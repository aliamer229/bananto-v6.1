import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isScriptImportError, handleModuleReload } from "./polyfills";

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
              const isModuleScriptError = isScriptImportError(errStr);

              if (remaining > 0) {
                setTimeout(() => {
                  attempt(remaining - 1);
                }, interval);
              } else if (isModuleScriptError && typeof window !== "undefined") {
                handleModuleReload();
                reject(error);
              } else {
                reject(error);
              }
            });
        };
        attempt(retries);
      }),
  );
}
