import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Rotating word swap. */
export function FlipWords({
  words,
  duration = 2200,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % words.length), duration);
    return () => clearInterval(timer);
  }, [words.length, duration]);

  return (
    <span className="relative inline-flex px-1">
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ duration: 0.35 }}
          className={cn("inline-block whitespace-nowrap", className)}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default FlipWords;
