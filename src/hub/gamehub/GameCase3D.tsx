import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SwitchMark } from "./nintendoMarks";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";

/**
 * 3D Nintendo game case.
 *
 * ## The texture model — read this first
 *
 * A retail case carries **one printed sleeve** that wraps back │ spine │ front.
 * The red header band, the Nintendo lockup and the spine title are all printed
 * on that single artwork file. So there are two modes here, and only the first
 * is fully faithful:
 *
 * 1. **`sleeveUrl` given** — the real wrap. Each face samples its own region of
 *    that one texture through `background-position` / `background-size`, which
 *    is UV mapping by another name. Front and spine are continuous by
 *    construction because they are literally the same image, and no mark is
 *    drawn on top of it. This is the correct path; use it wherever the artwork
 *    exists.
 *
 * 2. **`coverUrl` only** — what store APIs actually return: front key art, no
 *    band, no logo, no spine. The front shows that art untouched; the spine
 *    continues its outermost sliver (`SPINE_BLEED`), which is what a printed
 *    bleed does physically. The platform mark is then drawn as geometry because
 *    there is nothing in the texture to show — see `nintendoMarks.tsx`.
 *
 * The artwork itself is never recoloured, sharpened or filtered in either mode.
 * Lighting lives in sibling overlay layers so the texture underneath stays
 * exactly the pixels that were supplied.
 *
 * ## Geometry
 *
 * Height follows the reference model (10.37 × 17.15 cm → 1.654 × width). Depth
 * is `D_RATIO`, deliberately above the measured 0.108 — see the note there.
 * Six faces share one `preserve-3d` context so the case rotates as one solid;
 * the side faces are inset by the corner radius so their square corners cannot
 * poke past the rounded front.
 */

export interface CaseSleeve {
  /** Full wrap artwork, printed left→right as back │ spine │ front. */
  url: string;
  /**
   * Region boundaries as fractions of the texture width. Defaults to
   * `PRINTED_LAYOUT`, which matches a standard retail insert; override only for
   * artwork trimmed to different margins.
   */
  layout?: { backEnd: number; frontStart: number };
}

export interface GameCase3DProps {
  /** Front-only key art. Used when no `sleeve` is available. */
  coverUrl?: string | undefined;
  /** The real printed wrap. Always preferred over `coverUrl`. */
  sleeve?: CaseSleeve | undefined;
  /**
   * How front-only art fills the face. Case faces are 1:1.654 while store art
   * is usually 3:4, so something has to give: `cover` crops the edges (standard
   * packshot behaviour, no distortion), `contain` keeps every pixel and letter-
   * boxes against the shell. Never `fill` — that would distort the artwork.
   */
  coverFit?: "cover" | "contain" | undefined;
  title: string;
  subtitle?: string | undefined;
  /** Switch 2 livery: red shell, artwork-wrapped spine, full-width band. */
  isSwitch2?: boolean | undefined;
  ageRating?: { system: string; label: string } | undefined;
  editionLabel?: string | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
  onClick?: (() => void) | undefined;
}

const H_RATIO = 17.151 / 10.369;

/*
  Depth is deliberately above the measured 0.108.

  A real case is ~1.1 cm on a 10.4 cm face, but on screen the visible spine is
  `d · sin θ` against a face of `w · cos θ` — at 25° the true ratio lands near 5%
  of the face width, too thin to carry the title, the mark and the wordmark it
  has to. Retail product renders exaggerate the same way.
*/
const D_RATIO = 0.17;

/** Fraction of the front art that continues around the fold onto the spine. */
const SPINE_BLEED = 0.055;

/**
 * Where the printed sleeve's regions actually fall.
 *
 * These come from the **physical** case (back 10.369 + spine 1.117 + front
 * 10.369 = 21.855 cm wide), *not* from the rendered geometry. That distinction
 * matters: `D_RATIO` exaggerates depth for the viewing angle, and deriving the
 * layout from it made the spine sample 7.8% of the texture where a real insert
 * gives it 5.1% — a 1.5x over-sample that drags front artwork onto the spine
 * and shifts the front region with it.
 *
 * Verified against retail inserts, which are ~1471x1138 (ratio 1.293 against a
 * geometric 1.274 — the difference is trim bleed).
 */
export const PRINTED_LAYOUT = { backEnd: 0.4744, frontStart: 0.5256 } as const;

const WIDTHS = { sm: 118, md: 156, lg: 196 } as const;

export function GameCase3D({
  coverUrl,
  sleeve,
  coverFit = "cover",
  title,
  subtitle,
  isSwitch2 = false,
  ageRating,
  editionLabel,
  size = "lg",
  className,
  onClick,
}: GameCase3DProps) {
  const reduceMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const w = WIDTHS[size];
  const h = Math.round(w * H_RATIO);
  const d = Math.round(w * D_RATIO);
  const radius = Math.max(3, Math.round(w * 0.035));
  /* Plastic visible at the three free edges. The fold gets none. */
  const rim = Math.max(2, Math.round(w * 0.016));
  const scale = w / WIDTHS.lg;

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const springCfg = { stiffness: 140, damping: 18, mass: 0.6 };
  const sx = useSpring(px, springCfg);
  const sy = useSpring(py, springCfg);

  const rotateY = useTransform(sx, [-0.5, 0.5], [34, 16]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [-7, 10]);
  const sheenX = useTransform(sx, [-0.5, 0.5], ["135%", "-35%"]);
  const shadowX = useTransform(sx, [-0.5, 0.5], [10, -10]);
  const shadowScale = useTransform(sy, [-0.5, 0.5], [1.04, 0.92]);

  const onPointerMove = (event: React.PointerEvent) => {
    if (reduceMotion || event.pointerType === "touch") return;
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const reset = () => {
    px.set(0);
    py.set(0);
    setHovered(false);
  };

  /*
    Faces centre through their own inline transform. An inline `transform`
    replaces Tailwind's `-translate-x-1/2` outright, so centring has to be the
    first function in each face's own string.
  */
  const faceBase = "absolute left-1/2 top-1/2";
  const centre = "translate(-50%, -50%)";

  const spineLines = [
    [title, subtitle].filter(Boolean).join(" – "),
    ...(editionLabel ? [editionLabel] : []),
  ];

  // Shell colours only ever show where the sleeve does not reach.
  const shell = isSwitch2 ? "#c1122c" : "#e9edf2";
  const shellDeep = isSwitch2 ? "#8f0c1f" : "#cfd6df";

  /* ---- Texture sampling. `sleeve` is real UV; `coverUrl` is the fallback. ---- */
  const layout = sleeve?.layout ?? PRINTED_LAYOUT;

  /** Maps a texture sub-range onto a face of the given width. */
  const sample = (from: number, to: number, faceWidth: number): React.CSSProperties => {
    const sizeX = faceWidth / Math.max(0.0001, to - from);
    return {
      backgroundImage: `url(${sleeve!.url})`,
      backgroundSize: `${sizeX}px 100%`,
      backgroundPosition: `${-from * sizeX}px center`,
      backgroundRepeat: "no-repeat",
    };
  };

  const frontSleeve = sleeve ? sample(layout.frontStart, 1, w) : undefined;
  const spineSleeve = sleeve ? sample(layout.backEnd, layout.frontStart, d) : undefined;
  const backSleeve = sleeve ? sample(0, layout.backEnd, w) : undefined;

  /*
    Front-only fallback for the wrap: squeeze the outermost sliver of the cover
    onto the spine so the fold continues the art rather than cutting to a flat
    panel. Switch 2 only — Switch 1 spines are printed flat red (see DREDGE), so
    bleeding artwork onto one would be wrong, not merely approximate.
  */
  const spineBleed: React.CSSProperties | undefined =
    !sleeve && coverUrl && isSwitch2
      ? {
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: `${d / SPINE_BLEED}px 100%`,
          backgroundPosition: "left center",
          backgroundRepeat: "no-repeat",
        }
      : undefined;

  return (
    <div
      ref={hostRef}
      onPointerMove={onPointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={reset}
      className={cn("relative flex select-none items-center justify-center", className)}
      style={{
        perspective: "900px",
        perspectiveOrigin: "50% 45%",
        width: w + 84,
        height: h + 56,
      }}
    >
      {/* Ambient pool, biased low so the base has something to sit against. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[58%] -z-10 h-[62%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(150,170,220,0.16),transparent)] blur-2xl"
      />
      {/* Contact shadow on the ground plane. */}
      <motion.div
        aria-hidden
        style={{ x: shadowX, scaleX: shadowScale, bottom: 18 }}
        className="pointer-events-none absolute inset-x-0 mx-auto"
      >
        <motion.div
          {...(reduceMotion
            ? {}
            : { animate: { scaleX: [1, 0.93, 1], opacity: [0.85, 0.62, 0.85] } })}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto rounded-[50%] bg-[#05060a] blur-[10px]"
          style={{ width: w * 0.68, height: 14 }}
        />
      </motion.div>

      <motion.div
        {...(onClick ? { onClick } : {})}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
        {...(reduceMotion
          ? {}
          : { animate: { opacity: 1, scale: 1, y: hovered ? -10 : [0, -6, 0] } })}
        transition={
          hovered
            ? { type: "spring", stiffness: 220, damping: 20 }
            : {
                opacity: { duration: 0.6 },
                scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
                y: { duration: 7, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className={cn("relative", onClick && "cursor-pointer")}
        style={{ width: w, height: h, transformStyle: "preserve-3d" }}
        role={onClick ? "button" : undefined}
        aria-label={onClick ? title : undefined}
      >
        <motion.div
          style={{
            width: w,
            height: h,
            rotateY: reduceMotion ? 25 : rotateY,
            rotateX: reduceMotion ? 2 : rotateX,
            scale: hovered && !reduceMotion ? 1.035 : 1,
            transformStyle: "preserve-3d",
            transition: "scale 0.35s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* ======================= Front ======================= */}
          <div
            dir="ltr"
            className={cn(faceBase, "overflow-hidden")}
            style={{
              width: w,
              height: h,
              borderRadius: radius,
              background: shell,
              transform: `${centre} translateZ(${d / 2}px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {sleeve ? (
              /* Real wrap: the sleeve already carries band, logo and framing,
                 and covers the face edge to edge including the fold. */
              <div className="absolute inset-0" style={frontSleeve} />
            ) : (
              <>
                {/*
                  The printed sleeve is one sheet that wraps around the spine,
                  so it must reach the fold with nothing between. Insetting all
                  four sides — as this did — puts a strip of shell colour
                  between the artwork and the spine, which is exactly what made
                  the left edge read as detached. The rim stays on the three
                  free edges, where the sleeve is genuinely tucked into the
                  plastic.
                */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    top: rim,
                    bottom: rim,
                    right: rim,
                    left: 0,
                    borderRadius: `0 ${Math.max(2, radius - 2)}px ${Math.max(2, radius - 2)}px 0`,
                    background: "#0b0d13",
                  }}
                >
                  {/*
                    No drawn header band or platform mark: the supplied cover art
                    already carries the Nintendo Switch lockup (square on Switch,
                    wide on Switch 2). Drawing one would duplicate it.
                  */}
                  <div className="relative flex h-full w-full flex-col">
                    <CoverArt url={coverUrl} title={title} fit={coverFit} />
                  </div>

                  {ageRating && (
                    <div
                      className="absolute bottom-0 left-0 z-10 flex flex-col items-center justify-center bg-white text-black"
                      style={{
                        width: "15%",
                        height: "10%",
                        margin: w * 0.02,
                        borderRadius: 2,
                      }}
                    >
                      <span
                        className="font-black leading-none"
                        style={{ fontSize: Math.max(7, w * 0.055) }}
                      >
                        {ageRating.label}
                      </span>
                      <span
                        className="font-bold leading-none opacity-70"
                        style={{ fontSize: Math.max(3, w * 0.019) }}
                      >
                        {ageRating.system}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---- Material: semi-gloss plastic, applied over the art ---- */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20"
              style={{
                background:
                  "linear-gradient(103deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 26%, rgba(0,0,0,0.10) 100%)",
              }}
            />
            <motion.span
              aria-hidden
              style={{ x: reduceMotion ? "50%" : sheenX }}
              className="pointer-events-none absolute inset-y-0 -left-1/3 z-20 w-1/2 skew-x-[-15deg] bg-gradient-to-r from-transparent via-white/12 to-transparent"
            />
            {/*
              Directional bevel rather than a uniform outline. A ring on all four
              sides reads as a drawn stroke; a real moulded edge catches light on
              the side facing the key light and falls away on the other.
            */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20"
              style={{
                borderRadius: radius,
                boxShadow:
                  "inset 1px 1px 0 rgba(255,255,255,0.34), inset -1px -1px 0 rgba(0,0,0,0.30)",
              }}
            />
          </div>

          {/* ======================= Back ======================= */}
          <div
            className={faceBase}
            style={{
              width: w,
              height: h,
              borderRadius: radius,
              background: shellDeep,
              ...backSleeve,
              transform: `${centre} rotateY(180deg) translateZ(${d / 2}px)`,
              backfaceVisibility: "hidden",
            }}
          />

          {/* ======================= Spine ======================= */}
          <div
            dir="ltr"
            className={cn(faceBase, "overflow-hidden")}
            style={{
              width: d,
              /*
                Full height with its own rounding. Insetting the side faces by
                the corner radius left a visible step at the top and bottom of
                the fold; rounding the face in its own plane maps directly onto
                the case's left-hand corners, which is what is actually moulded.
              */
              height: h,
              borderRadius: radius,
              background: isSwitch2 ? shell : "#e60012",
              ...(spineSleeve ?? spineBleed),
              transform: `${centre} rotateY(-90deg) translateZ(${w / 2}px)`,
            }}
          >
            {/*
              No dark band at the fold. The previous build put a heavy gradient
              here, which is exactly what made the front and spine read as two
              separate pieces. A real case shows a bright specular line where the
              plastic folds, so that is what goes here.
            */}
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 18%, rgba(0,0,0,0.14) 100%)",
              }}
            />

            {/* Printed spine content is only ours to draw in fallback mode. */}
            {!sleeve && (
              <>
                {isSwitch2 && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 bg-[#e60012]"
                    style={{ height: "11.5%" }}
                  />
                )}
                <span
                  className="absolute inset-x-0 flex justify-center text-white"
                  style={{ top: h * 0.03 }}
                >
                  <span style={{ width: d * 0.44 }}>
                    <SwitchMark scale={scale * 0.34} />
                  </span>
                </span>

                {/* Title reads top-to-bottom; stacked the way retail prints it. */}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="block shrink-0 text-center"
                    style={{ width: h * 0.72, transform: "rotate(90deg)" }}
                  >
                    {spineLines.map((line, index) => (
                      <span
                        key={index}
                        className="block truncate font-bold uppercase leading-[1.25] tracking-[0.08em] text-white"
                        style={{
                          fontSize: Math.max(6, d * (spineLines.length > 1 ? 0.235 : 0.28)),
                          textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* ==================== Fore-edge ==================== */}
          <div
            className={faceBase}
            style={{
              width: d,
              height: h,
              borderRadius: radius,
              background: shell,
              transform: `${centre} rotateY(90deg) translateZ(${w / 2}px)`,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, rgba(0,0,0,0.22), rgba(255,255,255,0.34))",
              }}
            />
          </div>

          {/* ==================== Top / bottom ==================== */}
          {(["top", "bottom"] as const).map((edge) => (
            <div
              key={edge}
              className={faceBase}
              style={{
                width: w,
                height: d,
                borderRadius: radius,
                background: shell,
                transform: `${centre} rotateX(${edge === "top" ? 90 : -90}deg) translateZ(${h / 2}px)`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    edge === "top"
                      ? "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(0,0,0,0.20))"
                      : "linear-gradient(180deg, rgba(0,0,0,0.28), rgba(0,0,0,0.10))",
                }}
              />
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * Front artwork.
 *
 * Rendered with `object-fit` and nothing else — no filter, no blend mode, no
 * colour adjustment. Whatever pixels were supplied are the pixels that show.
 */
function CoverArt({
  url,
  title,
  fit,
}: {
  url?: string | undefined;
  title: string;
  fit: "cover" | "contain";
}) {
  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-3">
        <span className="text-center text-[9px] font-bold leading-tight text-white/70">
          {title}
        </span>
      </div>
    );
  }
  return (
    <div className="relative flex-1 overflow-hidden">
      <img
        src={cdnImage(url)}
        alt=""
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: fit, objectPosition: fit === "cover" ? "right center" : "center" }}
      />
    </div>
  );
}
