import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishEnv } from "./env.server";
import type { User } from "./types";

/**
 * `requireAdmin` was once a stub that returned `{ isAdmin: true }` for every
 * caller. Because every `/api/admin/*` handler, `/api/admin-wipe` and the
 * privileged `/api/chat` actions call it, that single line made the whole admin
 * surface reachable without a session. These tests pin the guard shut.
 */

const SESSION_SECRET = "test-session-secret-0123456789abcdef";

const MEMBER: User = {
  id: "usr_member",
  name: "Member",
  email: "member@example.com",
  passwordHash: "pbkdf2-sha256:100000:salt:digest",
  preferredGenres: [],
  isAdmin: false,
  provider: "password",
  settings: {} as User["settings"],
  addresses: [],
  favorites: [],
  walletBalance: 0,
  bananaBalance: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const ADMIN: User = { ...MEMBER, id: "usr_admin", email: "admin@example.com", isAdmin: true };

const users = new Map<string, User>();

vi.mock("./db.server", () => ({
  findUserById: async (id: string) => users.get(id),
  toPublicUser: (user: User) => user,
}));

beforeEach(() => {
  vi.resetModules();
  users.clear();
  users.set(MEMBER.id, MEMBER);
  users.set(ADMIN.id, ADMIN);
  publishEnv({ SESSION_SECRET });
});

afterEach(() => publishEnv({}));

async function sessionModule() {
  return import("./session.server");
}

/** A request carrying a genuine signed session cookie for `user`. */
async function requestFor(user: User): Promise<Request> {
  const { setSessionCookie } = await sessionModule();
  const cookie = (await setSessionCookie(user.id)).split(";")[0]!;
  return new Request("https://banan.to/api/admin/users", { headers: { cookie } });
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

describe("requireAdmin", () => {
  it("rejects a request with no session", async () => {
    const { requireAdmin } = await sessionModule();
    const anonymous = new Request("https://banan.to/api/admin/users");
    expect(await statusOf(requireAdmin(anonymous))).toBe(401);
  });

  it("rejects a signed-in member who is not an admin", async () => {
    const { requireAdmin } = await sessionModule();
    expect(await statusOf(requireAdmin(await requestFor(MEMBER)))).toBe(403);
  });

  it("rejects a forged cookie that is not signed with the session secret", async () => {
    const { requireAdmin } = await sessionModule();
    const forged = new Request("https://banan.to/api/admin/users", {
      headers: {
        cookie: `banana_session=v2:${ADMIN.id}:9999999999:${"a".repeat(24)}.notasignature`,
      },
    });
    expect(await statusOf(requireAdmin(forged))).toBe(401);
  });

  it("admits a real admin", async () => {
    const { requireAdmin } = await sessionModule();
    const admin = await requireAdmin(await requestFor(ADMIN));
    expect(admin.id).toBe(ADMIN.id);
    expect(admin.isAdmin).toBe(true);
  });

  it("re-reads is_admin from the database, so a revoked admin loses access", async () => {
    const { requireAdmin } = await sessionModule();
    const request = await requestFor(ADMIN);
    expect(await statusOf(requireAdmin(request))).toBe(200);

    // Same still-valid cookie, but the flag is gone from the database.
    users.set(ADMIN.id, { ...ADMIN, isAdmin: false });
    expect(await statusOf(requireAdmin(request))).toBe(403);
  });
});
