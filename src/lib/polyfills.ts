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
const RECOVERY_ID = "bananto-recovery-screen";
const CHUNK_RELOAD_COUNT_KEY = "bananto_chunk_reload_count";
/** Reloading more than this in one session is a loop, not a recovery. */
const MAX_AUTOMATIC_RELOADS = 2;

export const isScriptImportError = (errString: string) => {
  const s = String(errString || "").toLowerCase();
  return (
    s.includes("importing a module script failed") ||
    s.includes("module script") ||
    s.includes("dynamically imported module") ||
    s.includes("error loading dynamically imported module") ||
    s.includes("failed to fetch dynamically imported module") ||
    s.includes("failed to load module script") ||
    s.includes("error resolving module specifier") ||
    s.includes("unable to import module") ||
    s.includes("chunkloaderror") ||
    s.includes("loading chunk") ||
    s.includes("failed to resolve module") ||
    s.includes("javascript mime type") ||
    s.includes("mime type") ||
    s.includes("networkerror when attempting to fetch resource")
  );
};

/**
 * Last-resort recovery UI, built with plain DOM so it works when React is gone.
 *
 * Reloading is the fix for a stale chunk, but a reload that lands on the same
 * broken build would loop. When that happens the page used to be left blank
 * with the failure already swallowed — the member saw nothing at all. This puts
 * something on screen and hands them the button instead.
 */
export function showRecoveryScreen(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(RECOVERY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = RECOVERY_ID;
  overlay.setAttribute("dir", "rtl");
  overlay.setAttribute("role", "alert");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:16px",
    "padding:24px",
    "background:#fcf9f5",
    "color:#221a15",
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    "text-align:center",
  ].join(";");

  const title = document.createElement("p");
  title.textContent = "تعذر تحميل الصفحة";
  title.style.cssText = "margin:0;font-size:18px;font-weight:800";

  const hint = document.createElement("p");
  hint.textContent = "قد تكون لديك نسخة قديمة محفوظة. اضغط لإعادة التحميل.";
  hint.style.cssText = "margin:0;font-size:14px;opacity:.75;max-width:26rem;line-height:1.7";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "إعادة التحميل";
  button.style.cssText = [
    "appearance:none",
    "border:0",
    "cursor:pointer",
    "border-radius:14px",
    "padding:12px 28px",
    "font-size:15px",
    "font-weight:800",
    "color:#fff",
    "background:#d2231f",
  ].join(";");
  button.addEventListener("click", () => {
    // The member asked for this one, so it is not part of any loop budget.
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      window.sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
    } catch {
      /* private mode */
    }
    handleModuleReload(true);
  });

  overlay.append(title, hint, button);
  document.body.appendChild(overlay);
}

export const handleModuleReload = (force = false) => {
  if (typeof window === "undefined") return;
  let previousReload = 0;
  try {
    previousReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
  } catch {
    /* sessionStorage can throw in private mode; treat it as never reloaded */
  }
  if (!force && Date.now() - previousReload < 15_000) {
    // Reloading again would loop on the same broken build. Show the member a
    // way out rather than leaving them on a blank page.
    showRecoveryScreen();
    return;
  }

  let attempts = 0;
  try {
    attempts = Number(window.sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) ?? "0");
  } catch {
    /* ignore */
  }
  if (attempts >= MAX_AUTOMATIC_RELOADS) {
    // Even a forced reload stops here: whatever is broken is not going to be
    // fixed by loading the same thing a third time.
    showRecoveryScreen();
    return;
  }

  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(attempts + 1));
  } catch {
    /* ignore */
  }

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

function isScriptElement(target: EventTarget | null): target is HTMLScriptElement {
  return Boolean(target && (target as HTMLElement).tagName === "SCRIPT");
}

/** A script tag from this origin for a built chunk, i.e. part of the build we shipped. */
function isOwnScriptElement(target: EventTarget | null): boolean {
  if (!isScriptElement(target)) return false;
  const src = target.getAttribute("src");
  if (!src) return false;
  try {
    const url = new URL(src, window.location.href);
    return (
      url.origin === window.location.origin &&
      (url.pathname.includes("/assets/") || url.pathname.includes("/_build/"))
    );
  } catch {
    return false;
  }
}

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
        const target = e.target as HTMLElement | null;
        const msg = String(e.message || e.error?.message || e.error || "");
        // Only our own build's scripts mean "this page is broken, reload it".
        // Any <script> tag used to qualify, so a third-party script that failed
        // for reasons of its own — telegram-web-app.js behind a blocker, an
        // analytics tag on a bad network — reloaded the app, failed again, and
        // reloaded again: an endless loop that shows the member nothing.
        if (isOwnScriptElement(target) || (!isScriptElement(target) && isScriptImportError(msg))) {
          try {
            e.preventDefault();
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          handleModuleReload();
        }
      },
      true,
    );

    window.addEventListener(
      "unhandledrejection",
      (e: PromiseRejectionEvent) => {
        const reasonMsg = String(e.reason?.message || e.reason || "");
        if (isScriptImportError(reasonMsg)) {
          try {
            e.preventDefault();
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          handleModuleReload();
        }
      },
      true,
    );
  }
}

/**
 * Blank-screen watchdog.
 *
 * Whatever kills the app — a chunk that never arrives, a hydration error that
 * tears the root down — the member is left staring at a white page, and any
 * audio that had already started keeps playing, which makes it look like the
 * site is running when nothing is. The app always paints something, so an empty
 * body a few seconds after load means it never came up: reload once, and if
 * that did not help, put the recovery screen in front of them.
 */
function installBlankScreenWatchdog() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__bananto_blank_watchdog_installed) return;
  (window as any).__bananto_blank_watchdog_installed = true;

  const looksBlank = () => {
    const body = document.body;
    if (!body) return true;
    if (document.getElementById(RECOVERY_ID)) return false;
    if ((body.innerText || "").trim().length > 0) return false;
    // Text can legitimately be empty while an image-only view paints, so only
    // call it blank when nothing renderable is in the tree at all.
    return body.querySelectorAll("img,svg,canvas,video,input,button").length === 0;
  };

  const check = () => {
    if (!looksBlank()) return;
    let previousReload = 0;
    try {
      previousReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
    } catch {
      /* ignore */
    }
    if (Date.now() - previousReload < 30_000) showRecoveryScreen();
    else handleModuleReload();
  };

  const start = () => window.setTimeout(check, 8_000);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

installPolyfills();
installBlankScreenWatchdog();
