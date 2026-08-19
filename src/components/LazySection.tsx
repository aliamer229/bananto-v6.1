import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only when they enter the viewport.
 * Useful for heavy sections lower down the page to avoid early mounting and image loading.
 */
export function LazySection({
  children,
  placeholder,
  rootMargin = "200px",
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [ref, setRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin },
    );

    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, isVisible, rootMargin]);

  return (
    <div ref={setRef} className="min-h-[100px] w-full">
      {isVisible
        ? children
        : placeholder || (
            <div className="h-40 animate-pulse animate-skeleton-shimmer bg-muted/20 rounded-3xl mx-4" />
          )}
    </div>
  );
}
