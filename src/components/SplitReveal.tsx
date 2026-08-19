import { motion, AnimatePresence } from "motion/react";
import React, { useEffect, useState } from "react";

interface SplitRevealProps {
  isTransitioning: boolean;
  onClosed: () => void;
  onFinished: () => void;
}

export default function SplitReveal({ isTransitioning, onClosed, onFinished }: SplitRevealProps) {
  const [phase, setPhase] = useState<"idle" | "closing" | "closed" | "opening">("idle");

  useEffect(() => {
    if (isTransitioning && phase === "idle") {
      setPhase("closing");
    }
  }, [isTransitioning, phase]);

  useEffect(() => {
    if (phase === "closing") {
      const timer = setTimeout(() => {
        setPhase("closed");
        onClosed();
        setTimeout(() => {
          setPhase("opening");
        }, 100);
      }, 400);
      return () => clearTimeout(timer);
    } else if (phase === "opening") {
      const timer = setTimeout(() => {
        setPhase("idle");
        onFinished();
      }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, onClosed, onFinished]);

  const isVisible = phase !== "idle";
  const isClosed = phase === "closing" || phase === "closed";

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col">
          <motion.div
            initial={{ y: "-120%" }}
            animate={{ y: isClosed ? "0%" : "-120%" }}
            transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
            className="w-full h-1/2 bg-[var(--shell-2)] shadow-xl flex items-end justify-center overflow-hidden relative"
          >
            <div className="h-[2px] w-full bg-red-600/30 absolute bottom-0" />
          </motion.div>

          <motion.div
            initial={{ y: "120%" }}
            animate={{ y: isClosed ? "0%" : "120%" }}
            transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
            className="w-full h-1/2 bg-[var(--shell-2)] shadow-xl flex items-start justify-center overflow-hidden relative"
          >
            <div className="h-[2px] w-full bg-red-600/30 absolute top-0" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: phase === "closed" ? 1 : 0, scale: phase === "closed" ? 1 : 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <div className="flex gap-2 items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[var(--page)] font-black tracking-[0.2em] text-sm uppercase">
                Banana Store
              </span>
              <div
                className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
