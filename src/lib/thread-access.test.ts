import { describe, expect, it } from "vitest";

import { canAccessAdminInbox, canAccessThread } from "./thread-access";

describe("thread access rules", () => {
  const A = "user-a";
  const B = "user-b";

  it("lets a user open their own thread in the store", () => {
    expect(
      canAccessThread({ viewerId: A, isAdmin: false, threadUserId: A, surface: "store" }),
    ).toBe(true);
  });

  it("denies a user access to another user's thread", () => {
    expect(
      canAccessThread({ viewerId: A, isAdmin: false, threadUserId: B, surface: "store" }),
    ).toBe(false);
  });

  it("denies a normal user the admin inbox", () => {
    expect(canAccessAdminInbox(false)).toBe(false);
    expect(
      canAccessThread({ viewerId: A, isAdmin: false, threadUserId: B, surface: "admin" }),
    ).toBe(false);
  });

  it("keeps an admin inside the store surface scoped to their own threads", () => {
    expect(canAccessThread({ viewerId: A, isAdmin: true, threadUserId: B, surface: "store" })).toBe(
      false,
    );
    expect(canAccessThread({ viewerId: A, isAdmin: true, threadUserId: A, surface: "store" })).toBe(
      true,
    );
  });

  it("allows an admin to open any customer thread from the dashboard inbox", () => {
    expect(canAccessAdminInbox(true)).toBe(true);
    expect(canAccessThread({ viewerId: A, isAdmin: true, threadUserId: B, surface: "admin" })).toBe(
      true,
    );
  });

  it("denies anonymous viewers", () => {
    expect(
      canAccessThread({ viewerId: null, isAdmin: true, threadUserId: B, surface: "admin" }),
    ).toBe(false);
  });
});
