import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Reveals a long list in batches. The sentinel element sits right after the last
 * rendered item; only when it actually enters the viewport (no early
 * pre-loading) does the next batch get revealed, after a short pause so the
 * spinner is visible and the staggered reveal reads as a new batch.
 */
export function useBatches<T>(items: T[], size = 8, pause = 550) {
  const [count, setCount] = useState(size);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when the source list changes length (filters, fresh data).
  useEffect(() => {
    setCount(size);
    setLoading(false);
  }, [items.length, size]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hasMore = count < items.length;

  const loadMore = useCallback(() => {
    if (timer.current) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setLoading(false);
      setCount((c) => Math.min(c + size, items.length));
    }, pause);
  }, [items.length, size, pause]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);

  /** Delay (ms) for an item's reveal, based on its position inside its batch. */
  const delayFor = useCallback((index: number) => (index % size) * 70, [size]);

  return { visible, hasMore, loading, sentinelRef: sentinel, batchSize: size, delayFor, loadMore };
}
