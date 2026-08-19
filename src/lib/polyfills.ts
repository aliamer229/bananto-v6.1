/**
 * Runtime polyfills for older / restricted browsers (iOS < 15.4, in-app
 * browsers such as Telegram's, and any non-secure context) where
 * `crypto.randomUUID` is missing. Without this the very first call throws and
 * the whole app renders the "This page didn't load" error screen.
 */

type UuidCrypto = Crypto & { randomUUID?: () => string };

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Always-safe UUID, regardless of browser or context. */
export function safeRandomUUID(): string {
  const c = (globalThis as { crypto?: UuidCrypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* falls through */
    }
  }
  return fallbackUuid();
}

export function installPolyfills() {
  const g = globalThis as { crypto?: UuidCrypto };
  if (!g.crypto) {
    // Extremely old contexts: provide the minimum surface the app touches.
    (g as { crypto?: unknown }).crypto = { randomUUID: fallbackUuid } as unknown as Crypto;
    return;
  }
  if (typeof g.crypto.randomUUID !== "function") {
    try {
      Object.defineProperty(g.crypto, "randomUUID", {
        value: fallbackUuid,
        configurable: true,
        writable: true,
      });
    } catch {
      /* read-only crypto object — callers should use safeRandomUUID */
    }
  }
}

installPolyfills();
