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
      delete document.documentElement.dataset["revealReady"];
      return;
    }

    subscribers += 1;
    const targets = document.querySelectorAll<HTMLElement>('[data-reveal="hidden"]');
    const observed: HTMLElement[] = [];

    targets.forEach((el) => {
      const rect = el.getBoundingClientRect();

      /*
        A restored scroll position can place an unrevealed element above the
        viewport before IntersectionObserver gets its first callback. Such an
        element will never intersect while the visitor keeps scrolling down,
        but it still owns its layout height — the result is the large blank
        block seen on iPad product pages. Anything already above or inside the
        reading viewport must therefore be visible immediately.
      */
      if (rect.bottom <= 0 || rect.top <= window.innerHeight * 0.92) {
        el.dataset["reveal"] = "shown";
        return;
      }

      observed.push(el);
      instance.observe(el);
    });

    // CSS hides pending elements only after the observer is ready. Until this
    // marker exists, server-rendered content stays visible (progressive enhancement).
    document.documentElement.dataset["revealReady"] = "true";

    return () => {
      subscribers -= 1;
      observed.forEach((el) => instance.unobserve(el));
      if (subscribers === 0) {
        instance.disconnect();
        observer = null;
        delete document.documentElement.dataset["revealReady"];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
