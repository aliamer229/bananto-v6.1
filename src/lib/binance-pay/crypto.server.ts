/**
 * Cryptographic utilities for Binance Pay request signing and data protection.
 * Powered entirely by standard Web Crypto APIs (compatible with Cloudflare Workers).
 */

/**
 * Computes an HMAC SHA-256 signature in lowercase hexadecimal format.
 */
export async function signHmacSha256Hex(secretKey: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const signBinanceQuery = async (queryString: string, secretKey: string): Promise<string> => {
  return signHmacSha256Hex(secretKey, queryString);
};

/**
 * Computes a SHA-256 hash in hex format.
 */
export async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hashes a string using SHA-256 for privacy-preserving audit logs (e.g. client IP, session).
 */
export async function hashString(value: string, salt = "bananto-binance-audit"): Promise<string> {
  return sha256Hex(`${salt}:${value}`);
}

/**
 * Constant-time comparison between two strings.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generates a cryptographically secure random alphanumeric ID.
 */
export function generateSecureId(prefix = "bnt"): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${hex}`;
}

/**
 * Masks a Binance Transaction ID for safe logging and admin display.
 * Example: "1234567890123456" -> "123456...3456", "12345678" -> "1234...5678", "1234" -> "1234"
 */
export function maskTransactionId(txId: string | null | undefined): string {
  if (!txId) return "";
  const trimmed = txId.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  if (trimmed.length <= 8) {
    const half = Math.floor(trimmed.length / 2);
    return `${trimmed.slice(0, half)}...${trimmed.slice(-half)}`;
  }
  const start = trimmed.slice(0, 6);
  const end = trimmed.slice(-4);
  return `${start}...${end}`;
}

/**
 * Masks an API key for safe diagnostics.
 */
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey) return "(not set)";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "******";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
