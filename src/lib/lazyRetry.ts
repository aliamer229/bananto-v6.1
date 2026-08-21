import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Wraps React.lazy with retry mechanisms to gracefully handle transient network errors
 * or stale chunk hashes ("Importing a module script failed", "Failed to fetch dynamically imported module").
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  retries = 3,
  interval = 800,
): LazyExoticComponent<T> {
  return lazy(
    () =>
      new Promise<{ default: T }>((resolve) => {
        const attempt = (remaining: number) => {
          factory()
            .then((mod) => {
              if (mod && "default" in mod && mod.default) {
                resolve({ default: mod.default });
              } else if (mod) {
                const firstKey = Object.keys(mod)[0];
                resolve({ default: (firstKey ? (mod as any)[firstKey] : mod) as T });
              } else {
                resolve({ default: (() => null) as unknown as T });
              }
            })
            .catch((error: any) => {
              const errStr = String(error?.message || error?.name || error || "").toLowerCase();
              const isModuleScriptError = isScriptImportError(errStr);

              if (remaining > 0) {
                setTimeout(() => {
                  attempt(remaining - 1);
                }, interval);
              } else {
                // Return a lightweight silent fallback component rather than crashing the whole route
                resolve({
                  default: (() => null) as unknown as T,
                });
              }
            });
        };
        attempt(retries);
      }),
  );
}
