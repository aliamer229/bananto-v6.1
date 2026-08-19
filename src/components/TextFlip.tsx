import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

/**
 * Cycles a short list of words in place, used for the market's animated
 * headline. Replaces the external container-text-flip dependency.
 */
export default function TextFlip({
  words,
  interval = 2000,
  className = "",
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span className={`relative inline-flex h-[1.4em] items-center overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
