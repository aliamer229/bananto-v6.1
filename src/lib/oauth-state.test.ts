import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { publishEnv } from "./env.server";
import { createNonce, createState, readState } from "./oauth.server";

/**
 * The signed state used to be pure bearer material: anyone could fetch one and
 * hand the resulting link to a victim, landing that victim's browser in the
 * attacker's account. On a store with a wallet that means the victim tops up a
 * balance they do not own. The nonce ties a state to the browser that asked
 * for it.
 */
beforeEach(() => publishEnv({ SESSION_SECRET: "test-session-secret-0123456789abcdef" }));
afterEach(() => publishEnv({}));

describe("oauth state binding", () => {
  it("accepts the state only together with its own nonce", async () => {
    const nonce = createNonce();
    const state = await createState("google", "/profile", nonce);

    await expect(readState(state, "google", nonce)).resolves.toEqual({ next: "/profile" });
  });

  it("rejects a state replayed without the nonce", async () => {
    const state = await createState("google", "/profile", createNonce());

    expect(await readState(state, "google", undefined)).toBeUndefined();
    expect(await readState(state, "google", "")).toBeUndefined();
  });

  it("rejects a state presented with someone else's nonce", async () => {
    const state = await createState("google", "/profile", createNonce());

    expect(await readState(state, "google", createNonce())).toBeUndefined();
  });

  it("still rejects a state issued for a different provider", async () => {
    const nonce = createNonce();
    const state = await createState("google", "/profile", nonce);

    expect(await readState(state, "apple", nonce)).toBeUndefined();
  });

  it("rejects a tampered state even with a valid nonce", async () => {
    const nonce = createNonce();
    const state = await createState("google", "/profile", nonce);

    expect(await readState(`${state}x`, "google", nonce)).toBeUndefined();
    expect(await readState(state.replace("/profile", "/admin"), "google", nonce)).toBeUndefined();
  });

  it("preserves a next path that contains the delimiter", async () => {
    const nonce = createNonce();
    const state = await createState("google", "/product/a|b", nonce);

    await expect(readState(state, "google", nonce)).resolves.toEqual({ next: "/product/a|b" });
  });

  it("issues a distinct high-entropy nonce each time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => createNonce()));
    expect(seen.size).toBe(200);
    for (const nonce of seen) expect(nonce).toMatch(/^[a-f0-9]{64}$/);
  });
});
