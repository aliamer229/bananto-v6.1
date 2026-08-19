/** AES-GCM encryption for delivered account passwords + password hashing + cookie signing. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += String.fromCharCode(byte);
  return btoa(out);
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

import { env } from "./env.server";

const SECRET_MIN_LENGTH: Record<string, number> = {
  // Existing installations may have a 16-31 character random signing key.
  // Keep those sessions operational while the runbook continues to recommend
  // rotating to 32 random bytes. Encryption keys remain strictly 32+ chars.
  SESSION_SECRET: 16,
  ACCOUNT_ENC_KEY: 32,
};

export function secretConfigured(name: string): boolean {
  const value = env(name);
  return typeof value === "string" && value.length >= (SECRET_MIN_LENGTH[name] ?? 32);
}

export function sessionSecretConfigured(): boolean {
  return secretConfigured("SESSION_SECRET");
}

function requireSecret(name: string) {
  const value = env(name);
  if (!value || !secretConfigured(name)) throw new Error(`Missing or weak secret: ${name}`);
  return value;
}

async function aesKey() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(requireSecret("ACCOUNT_ENC_KEY")),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecretValue(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain));
  return `enc:v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecretValue(value: string): Promise<string> {
  if (!value.startsWith("enc:v1:")) return value;
  const [, , ivB64, ctB64] = value.split(":");
  const key = await aesKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64!) },
    key,
    fromB64(ctB64!),
  );
  return decoder.decode(plain);
}

const PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const safeIterations = Math.min(Math.max(iterations, 1_000), 100_000);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: safeIterations },
    key,
    256,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256:${PBKDF2_ITERATIONS}:${b64(salt)}:${b64(digest)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith("pbkdf2-sha256:")) {
      const [, rounds, salt, expected] = stored.split(":");
      const iterations = Number(rounds);
      if (
        !salt ||
        !expected ||
        !Number.isSafeInteger(iterations) ||
        iterations < 1_000 ||
        iterations > 100_000
      )
        return false;
      const actual = new Uint8Array(await pbkdf2(password, fromB64(salt), iterations));
      const expectedBytes = fromB64(expected);
      if (actual.length !== expectedBytes.length) return false;
      let difference = 0;
      for (let i = 0; i < actual.length; i += 1) difference |= actual[i]! ^ expectedBytes[i]!;
      return difference === 0;
    }

    // Backward compatibility for existing one-round hashes. Successful logins
    // are upgraded immediately by the auth route.
    if (stored.startsWith("sha256:")) {
      const [, salt, expected] = stored.split(":");
      if (!salt || !expected) return false;
      const actual = new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${password}`)),
      );
      const expectedBytes = fromB64(expected);
      if (actual.length !== expectedBytes.length) return false;
      let difference = 0;
      for (let i = 0; i < actual.length; i += 1) difference |= actual[i]! ^ expectedBytes[i]!;
      return difference === 0;
    }
  } catch {
    return false;
  }
  return false;
}

export function passwordHashNeedsUpgrade(stored: string): boolean {
  if (!stored.startsWith("pbkdf2-sha256:")) return true;
  return Number(stored.split(":")[1] ?? 0) < PBKDF2_ITERATIONS;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requireSecret("SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signValue(value: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return `${value}.${b64(sig).replace(/=+$/, "")}`;
}

export async function unsignValue(signed: string): Promise<string | undefined> {
  const index = signed.lastIndexOf(".");
  if (index < 0) return undefined;
  const value = signed.slice(0, index);
  try {
    const signature = fromB64(
      `${signed.slice(index + 1)}${"=".repeat((4 - ((signed.length - index - 1) % 4)) % 4)}`,
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      signature,
      encoder.encode(value),
    );
    return valid ? value : undefined;
  } catch {
    return undefined;
  }
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function hashIp(ip: string): Promise<string> {
  const configuredSalt = env("IP_SALT");
  const salt =
    configuredSalt && configuredSalt.length >= 24
      ? configuredSalt
      : requireSecret("SESSION_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${ip}`));
  return b64(digest).slice(0, 32);
}
