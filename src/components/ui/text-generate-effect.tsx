import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/** Word-by-word reveal used for assistant messages. */
export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.3,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}) {
  const list = words.split(" ");
  return (
    <span className={cn("inline", className)}>
      {list.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, filter: filter ? "blur(6px)" : "none" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration, delay: i * 0.04 }}
          className="inline"
        >
          {word}{" "}
        </motion.span>
      ))}
    </span>
  );
}

export default TextGenerateEffect;
