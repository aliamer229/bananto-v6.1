/**
 * Sign in with Google / Apple, implemented entirely inside the Cloudflare
 * Worker with WebCrypto — no third-party auth service.
 *
 * Google: standard OIDC code flow (client secret).
 * Apple:  code flow where the client secret is an ES256 JWT signed with the
 *         .p8 key from the Apple developer portal.
 */

import { signValue, unsignValue } from "./crypto.server";
import { constantTimeEqual } from "./security.server";

export type OAuthProvider = "google" | "apple";

export interface OAuthProfile {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

const encoder = new TextEncoder();

import { env as getSafeEnv } from "./env.server";

function env(name: string): string | undefined {
  return getSafeEnv(name);
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === "google") return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
  return Boolean(
    env("APPLE_CLIENT_ID") &&
    env("APPLE_TEAM_ID") &&
    env("APPLE_KEY_ID") &&
    env("APPLE_PRIVATE_KEY"),
  );
}

export function redirectUri(origin: string, provider: OAuthProvider) {
  return `${origin}/api/oauth/${provider}/callback`;
}

export const OAUTH_NONCE_COOKIE = "banana_oauth";
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/**
 * Single-use nonce tying an authorization request to the browser that started
 * it.
 *
 * Without it the signed state is bearer material: anyone can fetch a valid
 * state, hand the resulting link to someone else, and land that person's
 * browser in *their* account (login CSRF) — which on a store with a wallet
 * means the victim tops up an attacker-controlled balance. The nonce lives in a
 * cookie; only its digest travels in the state, so a state observed in a
 * redirect chain or a server log is useless on its own.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function nonceDigest(nonce: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(`oauth-nonce:${nonce}`));
  return Array.from(new Uint8Array(hash).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Apple replies with a cross-site POST (`response_mode=form_post`), which a
 * `Lax` cookie is not sent on — so this mirrors the session cookie's recipe,
 * the one already proven to survive the Telegram and Instagram in-app browsers.
 */
export function oauthNonceCookie(nonce: string, secure: boolean): string {
  const attrs = secure ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
  const maxAge = Math.floor(OAUTH_STATE_TTL_MS / 1000);
  return `${OAUTH_NONCE_COOKIE}=${nonce}; Path=/; HttpOnly; ${attrs}; Max-Age=${maxAge}`;
}

export function clearOauthNonceCookie(secure: boolean): string {
  const attrs = secure ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
  return `${OAUTH_NONCE_COOKIE}=; Path=/; HttpOnly; ${attrs}; Max-Age=0`;
}

export function readOauthNonceCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OAUTH_NONCE_COOKIE) return rest.join("=");
  }
  return undefined;
}

/** HMAC-signed state so no server-side state table is needed. */
export async function createState(provider: OAuthProvider, next: string, nonce: string) {
  return signValue(`${provider}|${Date.now()}|${await nonceDigest(nonce)}|${next}`);
}

export async function readState(
  raw: string,
  provider: OAuthProvider,
  nonce: string | undefined,
): Promise<{ next: string } | undefined> {
  const value = await unsignValue(raw);
  if (!value) return undefined;
  const [stateProvider, issued, digest, ...rest] = value.split("|");
  if (stateProvider !== provider) return undefined;
  if (Date.now() - Number(issued) > OAUTH_STATE_TTL_MS) return undefined;
  if (!digest || !/^[a-f0-9]{32}$/.test(digest)) return undefined;
  // Fails closed: a callback that cannot present the nonce this state was
  // issued against does not get a session.
  if (!nonce || !constantTimeEqual(await nonceDigest(nonce), digest)) return undefined;
  return { next: rest.join("|") || "/" };
}

export async function authorizationUrl(
  provider: OAuthProvider,
  origin: string,
  state: string,
): Promise<string> {
  const uri = redirectUri(origin, provider);
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      redirect_uri: uri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: requireEnv("APPLE_CLIENT_ID"),
    redirect_uri: uri,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

/* --------------------------------- helpers -------------------------------- */

function b64url(bytes: Uint8Array | ArrayBuffer) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let raw = "";
  for (const byte of view) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtPayload<T>(token: string): T {
  const part = token.split(".")[1] ?? "";
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return JSON.parse(decodeURIComponent(escape(json))) as T;
}

function b64ToBytes(value: string) {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Accepts the Apple .p8 key in any of the shapes people paste it:
 * real PEM, PEM with literal \n escapes, bare base64, or base64 of the
 * whole PEM file.
 */
function pemToPkcs8(input: string) {
  const strip = (value: string) =>
    value
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\\r|\\n/g, "")
      .replace(/\s+/g, "");

  const first = b64ToBytes(strip(input.trim()));
  // Double-encoded: the decoded bytes are themselves a PEM document.
  const asText = new TextDecoder().decode(first.subarray(0, 30));
  if (asText.includes("BEGIN")) return b64ToBytes(strip(new TextDecoder().decode(first)));
  return first;
}

/** Apple requires a short-lived ES256 JWT as the client secret. */
async function appleClientSecret(): Promise<string> {
  const teamId = requireEnv("APPLE_TEAM_ID");
  const keyId = requireEnv("APPLE_KEY_ID");
  const clientId = requireEnv("APPLE_CLIENT_ID");
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(encoder.encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })));
  const payload = b64url(
    encoder.encode(
      JSON.stringify({
        iss: teamId,
        iat: now,
        exp: now + 60 * 10,
        aud: "https://appleid.apple.com",
        sub: clientId,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(requireEnv("APPLE_PRIVATE_KEY")),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

/* ------------------------------ code exchange ----------------------------- */

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string,
  origin: string,
  appleUser?: { name?: { firstName?: string; lastName?: string }; email?: string },
): Promise<OAuthProfile> {
  const uri = redirectUri(origin, provider);
  const tokenUrl =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://appleid.apple.com/auth/token";

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: uri,
    client_id:
      provider === "google" ? requireEnv("GOOGLE_CLIENT_ID") : requireEnv("APPLE_CLIENT_ID"),
    client_secret:
      provider === "google" ? requireEnv("GOOGLE_CLIENT_SECRET") : await appleClientSecret(),
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const token = (await res.json()) as TokenResponse;
  if (!res.ok || !token.id_token) {
    throw new Error(
      token.error_description ?? token.error ?? `token exchange failed (${res.status})`,
    );
  }

  const claims = decodeJwtPayload<{
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    email_verified?: boolean | string;
  }>(token.id_token);

  const expectedAudience = requireEnv(
    provider === "google" ? "GOOGLE_CLIENT_ID" : "APPLE_CLIENT_ID",
  );
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const validIssuer =
    provider === "google"
      ? claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com"
      : claims.iss === "https://appleid.apple.com";
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (
    !validIssuer ||
    !audiences.includes(expectedAudience) ||
    !claims.exp ||
    claims.exp <= Math.floor(Date.now() / 1000) ||
    !emailVerified
  ) {
    throw new Error("invalid identity token claims");
  }

  const email = (claims.email ?? appleUser?.email ?? "").trim().toLowerCase();
  if (!claims.sub || !email) throw new Error("provider did not return an email");

  const appleName = [appleUser?.name?.firstName, appleUser?.name?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    provider,
    providerId: claims.sub,
    email,
    name: claims.name || appleName || email.split("@")[0]!,
    ...(claims.picture ? { avatar: claims.picture } : {}),
  };
}
