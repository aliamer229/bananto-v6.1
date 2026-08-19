import { createFileRoute, redirect } from "@tanstack/react-router";

import { findOrCreateOAuthUser } from "@/lib/db.server";
import { exchangeCode, readState } from "@/lib/oauth.server";
import type { OAuthProvider } from "@/lib/oauth.server";
import { setSessionCookie } from "@/lib/session.server";
import { textBody } from "@/lib/http.server";

type AppleUser = { name?: { firstName?: string; lastName?: string }; email?: string };

interface CallbackInput {
  code: string;
  state: string;
  error?: string;
  appleUser?: AppleUser;
}

async function readCallback(request: Request): Promise<CallbackInput> {
  const url = new URL(request.url);
  if (request.method === "POST") {
    // Apple posts the result as form data (response_mode=form_post).
    const form = new URLSearchParams(await textBody(request, 64 * 1024));
    const rawUser = form.get("user");
    return {
      code: form.get("code") ?? "",
      state: form.get("state") ?? "",
      ...(form.get("error") ? { error: String(form.get("error")) } : {}),
      ...(typeof rawUser === "string" && rawUser
        ? { appleUser: JSON.parse(rawUser) as AppleUser }
        : {}),
    };
  }
  return {
    code: url.searchParams.get("code") ?? "",
    state: url.searchParams.get("state") ?? "",
    ...(url.searchParams.get("error") ? { error: url.searchParams.get("error")! } : {}),
  };
}

async function handle(request: Request, providerParam: string) {
  const provider = providerParam as OAuthProvider;
  if (provider !== "google" && provider !== "apple") {
    return new Response("unknown provider", { status: 404 });
  }

  const input = await readCallback(request);
  const origin = new URL(request.url).origin;

  if (input.error || !input.code || !input.state) {
    throw redirect({ href: `/auth?error=${encodeURIComponent(input.error ?? "oauth_failed")}` });
  }

  const state = await readState(input.state, provider);
  if (!state) throw redirect({ href: "/auth?error=invalid_state" });

  try {
    const profile = await exchangeCode(provider, input.code, origin, input.appleUser);
    const user = await findOrCreateOAuthUser(profile);
    const sessionCookie = await setSessionCookie(user.id, request);

    // Safety check: All accounts must have a verified phone number.
    // Redirect to profile setup/phone verification if missing.
    // Use window.location origin for relative paths in redirect.
    let next =
      state.next.startsWith("/") && !state.next.startsWith("//") && !state.next.includes("\\")
        ? state.next
        : "/profile";

    if (!user.phoneVerifiedAt) {
      next = "/auth?view=phone_setup";
    }

    // Explicitly return a redirect with the session cookie in the headers.
    // D1 environment needs standard Response for set-cookie to persist reliably.
    return new Response(null, {
      status: 302,
      headers: {
        Location: next,
        "Set-Cookie": sessionCookie,
      },
    });
  } catch (error) {
    console.error("oauth callback failed", error);
    throw redirect({ href: "/auth?error=oauth_failed" });
  }
}

/** GET|POST /api/oauth/{google|apple}/callback */
export const Route = createFileRoute("/api/oauth/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params.provider),
      POST: async ({ request, params }) => handle(request, params.provider),
    },
  },
});
