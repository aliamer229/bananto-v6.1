import { env } from "./env.server";
import { normalizePhone } from "./phone";
import type { User } from "./types";

function configuredOwnerEmails() {
  return (env("OWNER_EMAILS") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function canonicalPhone(value?: string) {
  const normalized = value ? normalizePhone(value) : undefined;
  return normalized?.replace(/\D/g, "") ?? "";
}

function configuredOwnerPhones() {
  return (env("OWNER_PHONES") ?? "")
    .split(",")
    .map((value) => canonicalPhone(value))
    .filter(Boolean);
}

export function isOwnerEmail(email: string) {
  return configuredOwnerEmails().includes((email ?? "").trim().toLowerCase());
}

export function isOwnerPhone(phone?: string) {
  const canonical = canonicalPhone(phone);
  return !!canonical && configuredOwnerPhones().includes(canonical);
}

/** True only for an identity explicitly configured by the store owner. */
export function isOwnerAccount(input: { email?: string; phone?: string }) {
  return isOwnerEmail(input.email ?? "") || isOwnerPhone(input.phone);
}

/**
 * Identities that the application itself has already authenticated.
 * Password accounts may rely on a verified phone only. OAuth accounts may
 * additionally rely on the provider-verified email claim.
 */
export function verifiedOwnerIdentity(
  user: Pick<User, "email" | "phone" | "phoneVerifiedAt" | "provider">,
) {
  return {
    ...(user.phone && user.phoneVerifiedAt ? { phone: user.phone } : {}),
    ...(user.provider === "google" || user.provider === "apple" ? { email: user.email } : {}),
  };
}
