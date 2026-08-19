import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades + lifts an item into place. The delay is explicit (position inside its
 * batch) so every batch cascades in order instead of the nth-child pattern
 * shifting around as items are appended.
 */
export default function StaggerItem({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const [shown, setShown] = useState(false);
  const raf = useRef<number>(0);

  useEffect(() => {
    raf.current = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div
      className={`stagger-item ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
