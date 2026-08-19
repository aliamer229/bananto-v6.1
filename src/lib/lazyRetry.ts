import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Wraps React.lazy with retry mechanisms to gracefully handle transient network errors
 * or stale chunk hashes ("Importing a module script failed", "Failed to fetch dynamically imported module").
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  retries = 2,
  interval = 1000,
): LazyExoticComponent<T> {
  return lazy(
    () =>
      new Promise<{ default: T }>((resolve, reject) => {
        const attempt = (remaining: number) => {
          factory()
            .then((mod) => {
              if ("default" in mod && mod.default) {
                resolve({ default: mod.default });
              } else {
                const firstKey = Object.keys(mod)[0];
                resolve({ default: (firstKey ? (mod as any)[firstKey] : mod) as T });
              }
            })
            .catch((error: any) => {
              const errStr = String(error?.message || error?.name || error || "").toLowerCase();
              const isModuleScriptError =
                errStr.includes("dynamically imported module") ||
                errStr.includes("importing a module script failed") ||
                errStr.includes("error loading dynamically imported module") ||
                errStr.includes("failed to fetch dynamically imported module") ||
                errStr.includes("failed to load module script") ||
                errStr.includes("chunkloaderror");

              if (remaining > 0) {
                setTimeout(() => {
                  attempt(remaining - 1);
                }, interval);
              } else if (isModuleScriptError && typeof window !== "undefined") {
                const CHUNK_RELOAD_KEY = "bananto_chunk_reload_at";
                const previousReload = Number(
                  window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0",
                );
                if (Date.now() - previousReload >= 20_000) {
                  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
                  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
                    navigator.serviceWorker
                      .getRegistrations()
                      .then((regs) => {
                        for (const reg of regs) void reg.unregister();
                        if (typeof caches !== "undefined" && caches.keys) {
                          caches
                            .keys()
                            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                            .finally(() => window.location.reload());
                        } else {
                          window.location.reload();
                        }
                      })
                      .catch(() => window.location.reload());
                  } else {
                    window.location.reload();
                  }
                } else {
                  reject(error);
                }
              } else {
                reject(error);
              }
            });
        };
        attempt(retries);
      }),
  );
}
