import { motion } from "motion/react";
import { useState } from "react";
import { cdnImage } from "@/lib/img";

import { useSettingsStore } from "../store/useSettingsStore";

/**
 * Interactive pseudo-3D Nintendo Switch cartridge. Drag / hover tilts the
 * cartridge with perspective transforms — no WebGL dependency.
 */
export default function Cartridge3D({
  image,
  title,
  isSwitch2 = false,
}: {
  image?: string | undefined;
  title: string;
  isSwitch2?: boolean | undefined;
}) {
  const liteMotion = useSettingsStore((s) => s.liteMotion);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 22, y: px * 28 });
  };

  return (
    <div
      className="flex w-full items-center justify-center py-6"
      style={{ perspective: "1100px" }}
      onPointerMove={handleMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <motion.div
        animate={liteMotion ? { rotateX: 0, rotateY: 0 } : { rotateX: tilt.x, rotateY: tilt.y }}
        transition={{ type: "spring", stiffness: 150, damping: 14 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative"
      >
        <div
          className={`relative flex h-[300px] w-[205px] flex-col rounded-[24px] border-[2px] p-[9px] pb-[30px] shadow-[0_30px_60px_rgba(0,0,0,0.35)] ${
            isSwitch2
              ? "border-[#f24e4e] border-b-[var(--cart-red-deep)] bg-[#e22728]"
              : "border-[#3a3a3a] border-b-[#111] bg-[#222]"
          }`}
          style={{ transform: "translateZ(30px)" }}
        >
          <div
            className={`absolute left-1/2 top-0 h-[5px] w-12 -translate-x-1/2 rounded-b-[3px] ${
              isSwitch2 ? "bg-[var(--cart-red-deep)]" : "bg-black"
            }`}
          />
          <div
            className={`absolute bottom-[6px] left-1/2 h-0 w-0 -translate-x-1/2 border-l-[12px] border-r-[12px] border-t-[12px] border-l-transparent border-r-transparent ${
              isSwitch2 ? "border-t-[var(--cart-red-deep)]" : "border-t-black"
            }`}
          />
          <div className="flex flex-1 flex-col overflow-hidden rounded-[12px] bg-[var(--cart-shell)] shadow-inner">
            <div className="flex h-[52px] shrink-0 items-center gap-2 bg-[var(--cart-red)] px-3 text-white">
              <div className="flex h-[22px] items-center gap-[2px]">
                <div className="flex h-full w-[7px] justify-center rounded-l-full rounded-r-[1px] border-[2px] border-white pt-[2px]" />
                <div className="flex h-full w-[7px] justify-center rounded-l-[1px] rounded-r-full bg-card pt-[9px]" />
              </div>
              <div className="flex flex-col leading-none" dir="ltr">
                <span className="text-[7px] font-bold tracking-[0.15em]">NINTENDO</span>
                <span className="text-[20px] font-bold leading-[0.9] tracking-tight">
                  SWITCH{isSwitch2 ? " 2" : ""}
                </span>
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden bg-black">
              {image ? (
                <>
                  {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 animate-pulse">
                      <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
                    </div>
                  )}
                  <img
                    src={cdnImage(image)}
                    alt={title}
                    loading="eager"
                    decoding="sync"
                    className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
                    onLoad={() => setIsLoaded(true)}
                  />
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/50">
                  بدون صورة
                </div>
              )}
            </div>
            <div className="flex h-[54px] shrink-0 flex-col justify-end bg-[var(--cart-shell)] px-3 py-2">
              <h4 className="truncate text-[14px] font-medium text-white" dir="ltr">
                {title}
              </h4>
              <span className="text-[10px] text-[#a0a0a0]" dir="ltr">
                Game Card
              </span>
            </div>
          </div>
        </div>
        <div
          className="absolute inset-x-6 -bottom-6 h-8 rounded-full bg-black/25 blur-xl"
          style={{ transform: "translateZ(-40px)" }}
        />
      </motion.div>
    </div>
  );
}
