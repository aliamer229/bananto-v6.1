import type { PublicUser } from "@/lib/types";

/**
 * Pure decision helpers shared by /auth and /profile.
 *
 * Both pages must only ever act on a *stable* session snapshot: while the
 * "me" query is loading or refetching the answer is always "wait", so a
 * flapping session can never bounce the user back and forth.
 */

export type SessionState = {
  user: PublicUser | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** false during SSR / before hydration */
  isClient?: boolean;
};

export function isSessionStable(s: SessionState): boolean {
  if (s.isClient === false) return false;
  if (s.isLoading || s.isFetching) return false;
  return s.user !== undefined;
}

/** /profile: redirect to /auth exactly once, and only for a confirmed signed-out visitor. */
export function profileRedirectTarget(s: SessionState): "/auth" | null {
  if (!isSessionStable(s)) return null;
  return s.user === null ? "/auth" : null;
}

export type AuthPageView =
  | "signin"
  | "signup"
  | "forgot"
  | "otp"
  | "reset_password"
  | "phone_setup"
  | "profile_setup"
  | "genres_setup";

export type AuthPageAction =
  | { type: "wait" }
  | { type: "stay" }
  | { type: "view"; view: AuthPageView }
  | { type: "redirect"; to: "/profile" };

/** /auth: decide what a signed-in visitor should see. */
export function authPageAction(
  s: SessionState,
  opts: { view: AuthPageView; isNewRegistration: boolean },
): AuthPageAction {
  if (!isSessionStable(s)) return { type: "wait" };
  if (s.user === null) return { type: "stay" };

  const user = s.user!;
  if (!user.phoneVerifiedAt) {
    // SECURITY: If we are not in an OTP-related view, force redirection to phone setup.
    // This prevents users from navigating back and accessing the profile without verification.
    return opts.view === "otp" || opts.view === "phone_setup"
      ? { type: "stay" }
      : { type: "view", view: "phone_setup" };
  }

  if (!user.profileCompletedAt && opts.isNewRegistration) {
    return opts.view === "profile_setup" || opts.view === "genres_setup"
      ? { type: "stay" }
      : { type: "view", view: "profile_setup" };
  }

  return { type: "redirect", to: "/profile" };
}
