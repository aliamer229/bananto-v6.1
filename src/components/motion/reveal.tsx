"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Scroll-reveal primitive.
 *
 * One shared IntersectionObserver serves every revealing element on the page,
 * and each element is unobserved the moment it appears — the cost does not grow
 * with the number of problems rendered.
 */

let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return null;
  }
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        sharedObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
  );
  return sharedObserver;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Motion off: show immediately rather than leaving content at opacity 0.
    if (prefersReducedMotion()) {
      element.classList.add("is-visible");
      return;
    }

    const observer = getObserver();
    if (!observer) {
      element.classList.add("is-visible");
      return;
    }

    observer.observe(element);
    return () => observer.unobserve(element);
  }, []);

  return ref;
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger, in milliseconds, relative to the rest of the group. */
  delay?: number;
  /** `zoom` adds a subtle scale — reserved for images. */
  variant?: "fade" | "zoom";
  as?: "div" | "li" | "section" | "header" | "p";
  style?: CSSProperties;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  variant = "fade",
  as: Tag = "div",
  style,
}: RevealProps) {
  const ref = useReveal<HTMLElement>();
  const base = variant === "zoom" ? "bn-reveal-zoom" : "bn-reveal";

  return (
    <Tag
      // The union of element types here is wider than any single ref type.
      ref={ref as never}
      className={`${base} ${className}`}
      style={{ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
