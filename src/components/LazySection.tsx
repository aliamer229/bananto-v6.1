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
            /*
              Reserved space, not a skeleton.

              A section below the fold has not been requested yet — nothing is
              loading. An animated shimmer says otherwise, and eight of them
              stacked down a page that is waiting on the catalogue is
              indistinguishable from a page that has hung. It stays quiet until
              the section actually mounts.
            */
            <div
              aria-hidden
              className="mx-4 h-40 rounded-3xl bg-muted/10"
            />
          )}
    </div>
  );
}
