import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts a number up once the element scrolls into view.
 * Returns the live value and a ref to attach to the display element.
 */
export function useCountUp(target: number, durationMs = 900) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const started = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }

    let frame = 0;
    const run = () => {
      const start = performance.now();
      const from = 0;
      const tick = (now: number) => {
        const progress = Math.min((now - start) / durationMs, 1);
        // easeOutExpo — fast arrival, gentle settle.
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setValue(from + (target - from) * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started.current) {
          started.current = true;
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return { ref, value };
}
