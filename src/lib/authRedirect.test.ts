import { describe, expect, it } from "vitest";

import {
  authPageAction,
  isSessionStable,
  profileRedirectTarget,
  type AuthPageView,
  type SessionState,
} from "@/lib/authRedirect";
import type { PublicUser } from "@/lib/types";

const user = (patch: Partial<PublicUser> = {}) =>
  ({
    id: "u-5220",
    name: "عضو 5220",
    email: "bananq67xx@example.com",
    phoneVerifiedAt: "2026-01-01T00:00:00Z",
    profileCompletedAt: "2026-01-01T00:00:00Z",
    ...patch,
  }) as unknown as PublicUser;

const state = (s: Partial<SessionState>): SessionState => ({
  user: undefined,
  isLoading: false,
  isFetching: false,
  isClient: true,
  ...s,
});

describe("isSessionStable", () => {
  it("is unstable during SSR, loading, fetching, or unknown user", () => {
    expect(isSessionStable(state({ isClient: false, user: null }))).toBe(false);
    expect(isSessionStable(state({ isLoading: true, user: null }))).toBe(false);
    expect(isSessionStable(state({ isFetching: true, user: user() }))).toBe(false);
    expect(isSessionStable(state({ user: undefined }))).toBe(false);
  });

  it("is stable once a definitive answer arrives", () => {
    expect(isSessionStable(state({ user: null }))).toBe(true);
    expect(isSessionStable(state({ user: user() }))).toBe(true);
  });
});

describe("/profile redirect", () => {
  it("never redirects before the session is stable", () => {
    expect(profileRedirectTarget(state({ isLoading: true }))).toBeNull();
    expect(profileRedirectTarget(state({ isFetching: true, user: null }))).toBeNull();
    expect(profileRedirectTarget(state({ isClient: false, user: null }))).toBeNull();
    expect(profileRedirectTarget(state({ user: undefined }))).toBeNull();
  });

  it("redirects a confirmed signed-out visitor to /auth", () => {
    expect(profileRedirectTarget(state({ user: null }))).toBe("/auth");
  });

  it("keeps a signed-in user on the page", () => {
    expect(profileRedirectTarget(state({ user: user() }))).toBeNull();
  });
});

describe("/auth actions", () => {
  const opts = { view: "signin" as AuthPageView, isNewRegistration: false };

  it("waits while the session is in flight", () => {
    expect(authPageAction(state({ isLoading: true }), opts).type).toBe("wait");
    expect(authPageAction(state({ isFetching: true, user: user() }), opts).type).toBe("wait");
  });

  it("stays on the form for signed-out visitors", () => {
    expect(authPageAction(state({ user: null }), opts).type).toBe("stay");
  });

  it("sends unverified phones to phone_setup once, then stays", () => {
    const s = state({ user: user({ phoneVerifiedAt: null as never }) });
    expect(authPageAction(s, opts)).toEqual({ type: "view", view: "phone_setup" });
    expect(authPageAction(s, { ...opts, view: "phone_setup" }).type).toBe("stay");
    expect(authPageAction(s, { ...opts, view: "otp" }).type).toBe("stay");
  });

  it("only shows profile_setup for brand new registrations", () => {
    const s = state({ user: user({ profileCompletedAt: null as never }) });
    expect(authPageAction(s, { ...opts, isNewRegistration: true })).toEqual({
      type: "view",
      view: "profile_setup",
    });
    expect(authPageAction(s, { ...opts, isNewRegistration: false })).toEqual({
      type: "redirect",
      to: "/profile",
    });
  });

  it("redirects a fully set-up user to /profile", () => {
    expect(authPageAction(state({ user: user() }), opts)).toEqual({
      type: "redirect",
      to: "/profile",
    });
  });
});

describe("redirect-once across unstable session sequences", () => {
  /** Replays a session timeline and counts navigations, like a real effect would. */
  function replayProfile(timeline: SessionState[]) {
    let redirects = 0;
    let navigatedAway = false;
    for (const s of timeline) {
      if (navigatedAway) break; // the route unmounts after navigation
      if (profileRedirectTarget(s)) {
        redirects += 1;
        navigatedAway = true;
      }
    }
    return redirects;
  }

  function replayAuth(timeline: SessionState[], isNewRegistration = false) {
    let redirects = 0;
    let view: AuthPageView = "signin";
    let navigatedAway = false;
    for (const s of timeline) {
      if (navigatedAway) break;
      const action = authPageAction(s, { view, isNewRegistration });
      if (action.type === "view") view = action.view;
      if (action.type === "redirect") {
        redirects += 1;
        navigatedAway = true;
      }
    }
    return { redirects, view };
  }

  it("signed-out visitor on /profile is redirected exactly once", () => {
    expect(
      replayProfile([
        state({ isClient: false, isLoading: true }),
        state({ isLoading: true }),
        state({ isFetching: true }),
        state({ user: null }),
        state({ user: null }),
      ]),
    ).toBe(1);
  });

  it("flapping session (null -> user -> null) never redirects from /profile more than once", () => {
    expect(
      replayProfile([
        state({ isLoading: true }),
        state({ user: user() }),
        state({ isFetching: true, user: user() }),
        state({ user: null }),
        state({ isFetching: true, user: null }),
        state({ user: user() }),
      ]),
    ).toBe(1);
  });

  it("slow network never redirects from /profile at all while data is pending", () => {
    expect(
      replayProfile([
        state({ isLoading: true }),
        state({ isLoading: true }),
        state({ isFetching: true }),
        state({ user: user() }),
      ]),
    ).toBe(0);
  });

  it("signed-in visitor on /auth is redirected exactly once", () => {
    expect(
      replayAuth([
        state({ isLoading: true }),
        state({ isFetching: true }),
        state({ user: user() }),
        state({ user: user() }),
        state({ user: user() }),
      ]).redirects,
    ).toBe(1);
  });

  it("new registration walks phone_setup -> profile_setup without any redirect", () => {
    const result = replayAuth(
      [
        state({
          user: user({ phoneVerifiedAt: null as never, profileCompletedAt: null as never }),
        }),
        state({ user: user({ profileCompletedAt: null as never }) }),
        state({ user: user({ profileCompletedAt: null as never }) }),
      ],
      true,
    );
    expect(result.redirects).toBe(0);
    expect(result.view).toBe("profile_setup");
  });

  it("auth <-> profile ping-pong is impossible: the two pages never both redirect on one snapshot", () => {
    const snapshots = [
      state({ user: null }),
      state({ user: user() }),
      state({ isLoading: true }),
      state({ isFetching: true, user: user() }),
      state({ user: user({ phoneVerifiedAt: null as never }) }),
    ];
    for (const s of snapshots) {
      const fromProfile = profileRedirectTarget(s) !== null;
      const fromAuth =
        authPageAction(s, { view: "signin", isNewRegistration: false }).type === "redirect";
      expect(fromProfile && fromAuth).toBe(false);
    }
  });
});
