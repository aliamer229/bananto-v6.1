/**
 * Runtime polyfills and recovery handlers for older / restricted browsers
 * (iOS < 15.4, in-app browsers, Telegram Mini App) and handling of dynamic
 * chunk / module script load failures.
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

const CHUNK_RELOAD_KEY = "bananto_chunk_reload_at";

export const isScriptImportError = (errString: string) => {
  const s = String(errString || "").toLowerCase();
  return (
    s.includes("importing a module script failed") ||
    s.includes("dynamically imported module") ||
    s.includes("error loading dynamically imported module") ||
    s.includes("failed to fetch dynamically imported module") ||
    s.includes("failed to load module script") ||
    s.includes("error resolving module specifier") ||
    s.includes("unable to import module") ||
    s.includes("chunkloaderror") ||
    s.includes("loading chunk") ||
    s.includes("failed to resolve module") ||
    s.includes("javascript mime type")
  );
};

export const handleModuleReload = (force = false) => {
  if (typeof window === "undefined") return;
  const previousReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
  if (!force && Date.now() - previousReload < 20_000) return;
  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));

  const doReload = () => {
    try {
      window.location.reload();
    } catch {
      // noop
    }
  };

  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            try {
              void reg.unregister();
            } catch {
              // ignore
            }
          }
          if (typeof caches !== "undefined" && caches.keys) {
            caches
              .keys()
              .then((keys) =>
                Promise.all(keys.map((key) => caches.delete(key).catch(() => undefined))),
              )
              .catch(() => undefined)
              .finally(doReload);
          } else {
            doReload();
          }
        })
        .catch(doReload);
    } else if (typeof caches !== "undefined" && caches.keys) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key).catch(() => undefined))))
        .catch(() => undefined)
        .finally(doReload);
    } else {
      doReload();
    }
  } catch {
    doReload();
  }
};

export function installPolyfills() {
  const g = globalThis as { crypto?: UuidCrypto };
  if (!g.crypto) {
    // Extremely old contexts: provide the minimum surface the app touches.
    (g as { crypto?: unknown }).crypto = { randomUUID: fallbackUuid } as unknown as Crypto;
  } else if (typeof g.crypto.randomUUID !== "function") {
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

  // Global listeners for early catch of module load errors and Vite preload errors
  if (typeof window !== "undefined" && !(window as any).__bananto_chunk_listener_installed) {
    (window as any).__bananto_chunk_listener_installed = true;

    window.addEventListener(
      "vite:preloadError",
      (event) => {
        try {
          event.preventDefault();
        } catch {
          // ignore
        }
        handleModuleReload(true);
      },
      true,
    );

    window.addEventListener(
      "error",
      (e: ErrorEvent) => {
        const msg = String(e.message || e.error?.message || e.error || "");
        if (isScriptImportError(msg)) {
          handleModuleReload();
        }
      },
      true,
    );

    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const reasonMsg = String(e.reason?.message || e.reason || "");
      if (isScriptImportError(reasonMsg)) {
        handleModuleReload();
      }
    });
  }
}

installPolyfills();
