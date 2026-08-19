import { useEffect } from "react";

/**
 * Scroll reveal driven by a single shared IntersectionObserver.
 *
 * Elements opt in with `data-reveal`; the observer flips the attribute to
 * `shown` once and unobserves. The transition itself lives in CSS, so no
 * per-element JS animation runs during scroll.
 */
let observer: IntersectionObserver | null = null;
let subscribers = 0;

function ensureObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset["reveal"] = "shown";
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
  );
  return observer;
}

/** Re-scans for unrevealed elements whenever `deps` change. */
export function useReveal(deps: unknown[] = []): void {
  useEffect(() => {
    const instance = ensureObserver();
    if (!instance) {
      document
        .querySelectorAll<HTMLElement>('[data-reveal="hidden"]')
        .forEach((el) => (el.dataset["reveal"] = "shown"));
      return;
    }

    subscribers += 1;
    const targets = document.querySelectorAll<HTMLElement>('[data-reveal="hidden"]');
    targets.forEach((el) => instance.observe(el));

    return () => {
      subscribers -= 1;
      targets.forEach((el) => instance.unobserve(el));
      if (subscribers === 0) {
        instance.disconnect();
        observer = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
