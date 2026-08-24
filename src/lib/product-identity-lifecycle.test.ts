import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The identity index, exercised through its real SQL against an in-memory
 * table that enforces the same constraints D1 does: `product_id` is the primary
 * key and `(normalized_title, platform)` is unique.
 */
interface Row {
  product_id: string;
  normalized_title: string;
  platform: string;
  title: string | null;
  updated_at: string;
}

const table = new Map<string, Row>();

const findByKey = (normalizedTitle: string, platform: string) =>
  [...table.values()].find(
    (row) => row.normalized_title === normalizedTitle && row.platform === platform,
  );

vi.mock("./d1.server", () => ({
  d1Ready: async () => true,
  d1First: async (sql: string, ...binds: unknown[]) => {
    if (/SELECT product_id, title FROM product_identity/i.test(sql)) {
      return findByKey(String(binds[0]), String(binds[1])) ?? null;
    }
    throw new Error(`unexpected d1First: ${sql}`);
  },
  d1All: async (sql: string) => {
    if (/SELECT product_id, normalized_title, platform, title FROM product_identity/i.test(sql)) {
      return [...table.values()];
    }
    throw new Error(`unexpected d1All: ${sql}`);
  },
  d1Run: async (sql: string, ...binds: unknown[]) => {
    if (/^DELETE FROM product_identity/i.test(sql.trim())) {
      table.delete(String(binds[0]));
      return;
    }
    if (/^INSERT INTO product_identity/i.test(sql.trim())) {
      const [productId, normalizedTitle, platform, title, updatedAt] = binds.map(String);
      const holder = findByKey(normalizedTitle!, platform!);
      // The unique index: a different product already holds this identity.
      if (holder && holder.product_id !== productId) {
        throw new Error("UNIQUE constraint failed: product_identity.normalized_title, platform");
      }
      table.set(productId!, {
        product_id: productId!,
        normalized_title: normalizedTitle!,
        platform: platform!,
        title: title ?? null,
        updated_at: updatedAt!,
      });
      return;
    }
    throw new Error(`unexpected d1Run: ${sql}`);
  },
}));

const {
  claimProductIdentity,
  claimProductIdentityAgainstCatalogue,
  listProductIdentities,
  pruneOrphanProductIdentities,
  releaseProductIdentity,
} = await import("./product-identity.server");

const DAVE = "DAVE THE DIVER – Nintendo Switch 2 Edition";

beforeEach(() => {
  table.clear();
});

/** The API's delete path: drop it from the catalogue, release its identity. */
async function deleteProduct(catalogue: any[], id: string) {
  const next = catalogue.filter((p) => String(p.id) !== id);
  await releaseProductIdentity(id);
  return next;
}

describe("create → delete → create the same game again", () => {
  it("succeeds, because deleting the product releases its identity row", async () => {
    let catalogue: any[] = [];

    // Create.
    const first = { id: "prd_dave_1", title: DAVE, titleEn: DAVE, platform: "switch2" };
    expect((await claimProductIdentityAgainstCatalogue(first, catalogue)).ok).toBe(true);
    catalogue = [first];
    expect(await listProductIdentities()).toHaveLength(1);

    // Delete.
    catalogue = await deleteProduct(catalogue, "prd_dave_1");
    expect(catalogue).toEqual([]);
    expect(await listProductIdentities()).toEqual([]);

    // Create again, same title, same platform.
    const second = { id: "prd_dave_2", title: DAVE, titleEn: DAVE, platform: "switch2" };
    const claim = await claimProductIdentityAgainstCatalogue(second, catalogue);
    expect(claim.ok).toBe(true);
    expect(claim.conflictProductId).toBeUndefined();
    expect((await listProductIdentities())[0]!.productId).toBe("prd_dave_2");
  });

  it("without the release, the old code refused it — that was the bug", async () => {
    const catalogue: any[] = [];
    await claimProductIdentity({
      id: "prd_dave_1",
      title: DAVE,
      titleEn: DAVE,
      platform: "switch2",
    });
    // The product is gone from the catalogue but its row was never released.
    const refused = await claimProductIdentity({
      id: "prd_dave_2",
      title: DAVE,
      titleEn: DAVE,
      platform: "switch2",
    });
    expect(refused.ok).toBe(false);
    expect(refused.conflictProductId).toBe("prd_dave_1");
    // And that id is nowhere in the catalogue — the ghost an admin cannot find.
    expect(catalogue.some((p) => p.id === refused.conflictProductId)).toBe(false);
  });
});

describe("rows orphaned by deletions made before the fix", () => {
  it("are released on demand, so the next save goes through", async () => {
    // A row whose product was deleted by the old code.
    await claimProductIdentity({
      id: "prd_ghost",
      title: DAVE,
      titleEn: DAVE,
      platform: "switch2",
    });
    const catalogue = [{ id: "prd_other", title: "Something Else", platform: "switch2" }];

    const claim = await claimProductIdentityAgainstCatalogue(
      { id: "prd_dave_new", title: DAVE, titleEn: DAVE, platform: "switch2" },
      catalogue,
    );

    expect(claim.ok).toBe(true);
    const rows = await listProductIdentities();
    expect(rows.map((row) => row.productId)).toEqual(["prd_dave_new"]);
  });

  it("are swept in one pass by the diagnostics endpoint", async () => {
    const live = { id: "prd_live", title: "Live Game", titleEn: "Live Game", platform: "switch1" };
    await claimProductIdentity(live);
    await claimProductIdentity({ id: "prd_ghost_a", title: DAVE, platform: "switch2" });
    await claimProductIdentity({ id: "prd_ghost_b", title: "Old Game", platform: "switch1" });

    const removed = await pruneOrphanProductIdentities([live]);

    expect(removed.map((row) => row.productId).sort()).toEqual(["prd_ghost_a", "prd_ghost_b"]);
    // The live product keeps its row: nothing in the catalogue is touched.
    expect((await listProductIdentities()).map((row) => row.productId)).toEqual(["prd_live"]);
  });
});

describe("real duplicates are still refused", () => {
  it("refuses a second product with the same title while the first is live", async () => {
    const live = { id: "prd_dave_1", title: DAVE, titleEn: DAVE, platform: "switch2" };
    await claimProductIdentityAgainstCatalogue(live, []);

    const claim = await claimProductIdentityAgainstCatalogue(
      { id: "prd_dave_2", title: DAVE, titleEn: DAVE, platform: "switch2" },
      [live],
    );

    expect(claim.ok).toBe(false);
    expect(claim.conflictProductId).toBe("prd_dave_1");
    expect(claim.conflictTitle).toBe(DAVE);
    // The live product keeps the identity; the newcomer never takes it.
    expect((await listProductIdentities())[0]!.productId).toBe("prd_dave_1");
  });

  it("re-saving the same product is not a conflict with itself", async () => {
    const live = { id: "prd_dave_1", title: DAVE, titleEn: DAVE, platform: "switch2" };
    await claimProductIdentityAgainstCatalogue(live, []);
    const again = await claimProductIdentityAgainstCatalogue(live, [live]);
    expect(again.ok).toBe(true);
  });
});

describe("the same game on two platforms is two products", () => {
  it("lets Switch 1 and Switch 2 hold the same title at once", async () => {
    const switch1 = { id: "prd_dave_s1", title: DAVE, titleEn: DAVE, platform: "switch1" };
    const switch2 = { id: "prd_dave_s2", title: DAVE, titleEn: DAVE, platform: "switch2" };

    expect((await claimProductIdentityAgainstCatalogue(switch1, [])).ok).toBe(true);
    expect((await claimProductIdentityAgainstCatalogue(switch2, [switch1])).ok).toBe(true);
    expect(await listProductIdentities()).toHaveLength(2);

    // Deleting the Switch 1 copy leaves the Switch 2 copy's row alone.
    await releaseProductIdentity("prd_dave_s1");
    expect((await listProductIdentities()).map((row) => row.productId)).toEqual(["prd_dave_s2"]);
  });

  it("still refuses a duplicate within one platform", async () => {
    const switch2 = { id: "prd_dave_s2", title: DAVE, titleEn: DAVE, platform: "switch2" };
    await claimProductIdentityAgainstCatalogue(switch2, []);
    const claim = await claimProductIdentityAgainstCatalogue(
      { id: "prd_dave_s2_copy", title: DAVE, titleEn: DAVE, platform: "switch2" },
      [switch2],
    );
    expect(claim.ok).toBe(false);
  });
});
