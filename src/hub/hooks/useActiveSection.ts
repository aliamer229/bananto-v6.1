import { useEffect, useState } from "react";

/**
 * Tracks which section is currently under the sticky nav so the section rail
 * can highlight it. Uses a top-anchored root margin rather than midpoint
 * detection, which keeps the highlight in step with what the user reads.
 */
export function useActiveSection(ids: string[], offset = 120): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (ids.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        if (visible.size === 0) return;
        // Closest to the top edge of the reading area wins.
        const next = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
        if (next) setActive(next[0]);
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, 0.15] },
    );

    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [ids, offset]);

  return active;
}
