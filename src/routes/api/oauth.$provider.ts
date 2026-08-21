import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionSecretConfigured } from "@/lib/crypto.server";
import {
  authorizationUrl,
  createNonce,
  createState,
  isProviderConfigured,
  oauthNonceCookie,
} from "@/lib/oauth.server";
import type { OAuthProvider } from "@/lib/oauth.server";

function authError(code: string): never {
  throw redirect({ href: `/auth?error=${encodeURIComponent(code)}` });
}

/** GET /api/oauth/google  |  /api/oauth/apple — starts the sign-in redirect. */
export const Route = createFileRoute("/api/oauth/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = params.provider as OAuthProvider;
        if (provider !== "google" && provider !== "apple") {
          return new Response("unknown provider", { status: 404 });
        }
        if (!isProviderConfigured(provider)) {
          console.error(`[oauth] ${provider} is not configured. Missing secrets.`);
          return authError(`${provider}_not_configured`);
        }
        if (!sessionSecretConfigured()) {
          console.error("[oauth] session signing is not configured.");
          return authError("auth_runtime_not_configured");
        }

        const url = new URL(request.url);
        const requestedNext = url.searchParams.get("next") ?? "/profile";
        const next =
          requestedNext.startsWith("/") &&
          !requestedNext.startsWith("//") &&
          !requestedNext.includes("\\")
            ? requestedNext
            : "/profile";
        // Bind this authorization request to this browser (see oauth.server).
        const nonce = createNonce();
        let target: string;
        try {
          const state = await createState(provider, next, nonce);
          target = await authorizationUrl(provider, url.origin, state);
        } catch (error) {
          console.error(
            `[oauth] failed to start ${provider} sign-in`,
            error instanceof Error ? error.message : "unknown",
          );
          return authError("oauth_start_failed");
        }

        const secure =
          url.protocol === "https:" ||
          (request.headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() === "https";
        return new Response(null, {
          status: 302,
          headers: {
            Location: target,
            "Set-Cookie": oauthNonceCookie(nonce, secure),
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
