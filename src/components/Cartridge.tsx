import { motion, AnimatePresence } from "motion/react";
import { useRef } from "react";

import { playSound } from "../utils/audio";
import { cdnImage } from "@/lib/img";

export interface CartridgeGame {
  id: string | number;
  title?: string;
  subtitle?: string;
  image?: string;
  rating?: string | number | null;
  platform?: string;
}

const MOVE_TOLERANCE = 10;

/**
 * Nintendo Switch cartridge card. Shared between the home strip and the
 * "all games" grid so both always look identical.
 */
export default function Cartridge({
  game,
  clicked = false,
  onSelect,
  index = 0,
  animate = true,
}: {
  game: CartridgeGame;
  clicked?: boolean;
  onSelect: (game: CartridgeGame) => void;
  index?: number;
  animate?: boolean;
}) {
  const isSwitch2 = game.platform === "switch2";
  const rating =
    game.rating != null && String(game.rating).trim() !== "" ? String(game.rating) : null;
  const sound = isSwitch2 ? "hover" : "hover_s";

  // Track the pointer so scrolling the strip never fires the sound or navigation.
  const start = useRef<{ x: number; y: number; moved: boolean; touch: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    const touch = e.pointerType !== "mouse";
    start.current = { x: e.clientX, y: e.clientY, moved: false, touch };
    // Mouse clicks can't be scroll gestures: play instantly.
    if (!touch) playSound(sound, 0.8);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.moved) return;
    if (Math.abs(e.clientX - s.x) > MOVE_TOLERANCE || Math.abs(e.clientY - s.y) > MOVE_TOLERANCE) {
      s.moved = true;
    }
  };

  const handlePointerUp = () => {
    const s = start.current;
    if (s && s.touch && !s.moved) playSound(sound, 0.8);
  };

  const handleClick = () => {
    // A second tap while the page is already opening would queue another
    // navigation and make the card feel stuck.
    if (clicked) return;
    if (start.current?.moved) {
      start.current = null;
      return;
    }
    onSelect(game);
  };

  return (
    <motion.div
      dir="ltr"
      aria-busy={clicked}
      initial={animate ? { opacity: 0, y: -40 } : false}
      animate={{
        opacity: 1,
        y: clicked ? 140 : 0,
        transition: {
          delay: clicked ? 0 : Math.min(index, 12) * 0.06,
          type: "spring",
          stiffness: 200,
          damping: 20,
        },
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (start.current) start.current.moved = true;
      }}
      onClick={handleClick}
      className={`w-[115px] min-w-[115px] h-[196px] rounded-[14px] p-[5px] pb-[18px] shadow-xl snap-start group flex flex-col relative shrink-0 border-[1.5px] ${
        clicked ? "cursor-wait" : "cursor-pointer"
      } ${
        isSwitch2
          ? "bg-[#e22728] border-[#f24e4e] border-b-[var(--cart-red-deep)]"
          : "bg-[#222] border-[#3a3a3a] border-b-[#111]"
      }`}
    >
      {/* Opening state: blocks repeat taps and shows the page is on its way. */}
      {clicked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[14px]">
          <span className="h-7 w-7 animate-spin rounded-full border-[3.5px] border-white/20 border-t-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
        </div>
      )}

      {/* Top notch */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-b-[2px] ${
          isSwitch2 ? "bg-[var(--cart-red-deep)]" : "bg-[#000]"
        }`}
      ></div>

      {/* Bottom arrow */}
      <div
        className={`absolute bottom-[4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] ${
          isSwitch2 ? "border-t-[var(--cart-red-deep)]" : "border-t-[#000]"
        }`}
      ></div>

      {/* Inner label */}
      <div className="bg-[var(--cart-shell)] flex-1 rounded-[7px] overflow-hidden flex flex-col shadow-inner">
        {isSwitch2 ? (
          <div className="bg-[var(--cart-red)] text-white flex flex-col items-center justify-center h-[34px] w-full shrink-0">
            <div className="flex items-center gap-[2px]">
              <div className="flex items-center gap-[1.5px] h-[11px]">
                <div className="w-[4px] h-full border-[1.5px] border-white rounded-l-full rounded-r-[1px] flex justify-center pt-[1px]">
                  <div className="w-[1px] h-[1px] bg-card rounded-full"></div>
                </div>
                <div className="w-[4px] h-full bg-card rounded-r-full rounded-l-[1px] flex justify-center pt-[4.5px]">
                  <div className="w-[1px] h-[1px] bg-[var(--cart-red)] rounded-full"></div>
                </div>
              </div>
              <span className="text-[15px] font-bold leading-[0.9] tracking-tighter" dir="ltr">
                2
              </span>
            </div>
            <div className="flex flex-col items-center leading-none mt-[1px]">
              <span className="text-[3.5px] font-bold tracking-[0.2em] leading-[1]" dir="ltr">
                NINTENDO
              </span>
              <span className="text-[3.5px] font-bold tracking-[0.2em] leading-[1]" dir="ltr">
                SWITCH.
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--cart-red)] text-white flex items-center h-[34px] px-2 gap-1.5 shrink-0">
            <div className="flex items-center gap-[1.5px] h-[14px]">
              <div className="w-[5px] h-full border-[1.5px] border-white rounded-l-full rounded-r-[1px] flex justify-center pt-[1px]">
                <div className="w-[1px] h-[1px] bg-card rounded-full"></div>
              </div>
              <div className="w-[5px] h-full bg-card rounded-r-full rounded-l-[1px] flex justify-center pt-[6px]">
                <div className="w-[1px] h-[1px] bg-[var(--cart-red)] rounded-full"></div>
              </div>
            </div>
            <div className="flex flex-col justify-center leading-none">
              <span className="text-[4.5px] font-bold tracking-[0.15em] leading-[1]" dir="ltr">
                NINTENDO
              </span>
              <span className="text-[13px] font-bold tracking-tight leading-[0.9]" dir="ltr">
                SWITCH
              </span>
            </div>
          </div>
        )}
        <div className="flex-1 w-full overflow-hidden shrink-0 bg-[var(--surface-3)]">
          <img
            src={cdnImage(game.image)}
            alt={game.title}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={115}
            height={90}
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div className="px-2 py-1.5 shrink-0 h-[64px] flex flex-col justify-between bg-[var(--cart-shell)]">
          <h4
            className="text-white text-[9px] font-semibold leading-[1.2] line-clamp-3 break-words"
            dir="ltr"
            title={game.title}
          >
            {game.title}
          </h4>
          <div className="flex justify-between items-end gap-1">
            <p className="text-[#a0a0a0] text-[8px] truncate min-w-0" dir="ltr">
              {game.subtitle}
            </p>
            {rating && (
              <span
                className="shrink-0 text-[8px] font-bold bg-[#f5c518] text-foreground rounded-[3px] px-[3px] leading-[13px]"
                dir="ltr"
                title="Metacritic"
              >
                {rating}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
