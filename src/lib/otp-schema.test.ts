import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishEnv } from "./env.server";

/**
 * `migrations/0002_otp_phone.sql` created otp_codes with exactly these columns.
 * Every database that ran it is still missing the ones the application writes.
 */
const LEGACY_COLUMNS = [
  "id",
  "phone",
  "purpose",
  "code_hash",
  "expires_at",
  "attempts",
  "created_at",
];

function stubD1(existingColumns: string[]) {
  const statements: string[] = [];
  const columns = new Set(existingColumns);

  const prepare = (sql: string) => ({
    bind: () => prepare(sql),
    all: async () => {
      statements.push(sql);
      if (sql.startsWith("PRAGMA table_info")) {
        return { results: [...columns].map((name) => ({ name })) };
      }
      return { results: [] };
    },
    first: async () => {
      statements.push(sql);
      return null;
    },
    run: async () => {
      statements.push(sql);
      const alter = /^ALTER TABLE otp_codes ADD COLUMN ([a-z_]+)/.exec(sql);
      if (alter) {
        if (columns.has(alter[1]!)) throw new Error(`duplicate column name: ${alter[1]}`);
        columns.add(alter[1]!);
      }
      return { success: true };
    },
  });

  return { db: { prepare }, statements, columns };
}

beforeEach(() => {
  // ensureOtpSchema memoises its work per module instance, so each test needs a
  // freshly evaluated copy of the module.
  vi.resetModules();
  publishEnv({});
});

afterEach(() => publishEnv({}));

async function freshEnsureOtpSchema() {
  const { ensureOtpSchema } = await import("./d1.server");
  return ensureOtpSchema;
}

describe("otp_codes schema repair", () => {
  it("adds every column the application writes to a legacy table", async () => {
    const stub = stubD1(LEGACY_COLUMNS);
    publishEnv({ bananto: stub.db });

    await (
      await freshEnsureOtpSchema()
    )();

    // Without these the INSERT in sendVerificationCode fails with
    // "table otp_codes has no column named user_id", which the API could only
    // report as a generic server error on signup, reset and phone confirmation.
    expect(stub.columns.has("user_id")).toBe(true);
    expect(stub.columns.has("channel")).toBe(true);
    expect(stub.columns.has("destination")).toBe(true);
    expect(stub.columns.has("verified_at")).toBe(true);
  });

  it("does not re-add columns a current database already has", async () => {
    const stub = stubD1([...LEGACY_COLUMNS, "user_id", "channel", "destination", "verified_at"]);
    publishEnv({ bananto: stub.db });

    await (
      await freshEnsureOtpSchema()
    )();

    expect(stub.statements.filter((sql) => sql.startsWith("ALTER TABLE"))).toEqual([]);
  });

  it("fails loudly when no database is bound", async () => {
    publishEnv({});
    await expect((await freshEnsureOtpSchema())()).rejects.toThrow("D1_BINDING_UNAVAILABLE");
  });
});
