import { Suspense, useCallback, useEffect, useState } from "react";
import SafeBoundary from "@/components/SafeBoundary";
import { useImageTrim } from "@/hooks/useImageTrim";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { readPrefs } from "@/lib/prefs";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * What occupies the product hero's product slot: the interactive 3D case, or a
 * photograph of the box.
 *
 * ## The rule
 *
 * **The 3D case is shown only when the product has a real 3D Texture Source** —
 * a complete printed wrap (back + spine + front). Anything else shows the Front
 * Box Cover as a plain static image instead.
 *
 * This replaces a fallback that composed a sleeve out of the front cover and
 * painted it onto the model, generating a spine and a back that do not exist.
 * A fabricated wrap is a worse answer than a photograph of the real box, so the
 * composing path is no longer reachable from the storefront.
 *
 * ## Why a grey case used to appear
 *
 * The stage revealed the WebGL layer on a **600ms timer**, unconditionally, and
 * `SwitchBox3D` called `onReady` as soon as the glTF scene existed — before any
 * artwork had been composited onto it. So at 600ms the static image faded out
 * and an untextured model faded in, and if the texture never arrived it simply
 * stayed that way: a grey box, forever, in production.
 *
 * Readiness now means *textured*. The static cover holds the slot until the
 * model reports that artwork is actually on it, and if that never happens the
 * cover simply stays — which is the correct picture, not a degraded one.
 */

const CaseStageWebGL = lazyWithRetry(() => import("./CaseStageWebGL"));

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

/** A URL we are willing to hand to a texture loader or an `<img>`. */
function isUsableUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (url.length < 3) return false;
  if (/^(?:undefined$|null$|\[object)/i.test(url)) return false;
  return /^(?:https?:\/\/|\/|data:image\/)/i.test(url);
}

export function CaseStage({ className, ...rest }: GameCase3DProps & { className?: string }) {
  const { trim } = useImageTrim(
    cdnImage(rest.coverUrl ?? ""),
    rest.coverTrim,
    !rest.sleeve?.url && Boolean(rest.coverUrl),
  );
  const caseProps: GameCase3DProps = { ...rest, coverTrim: trim ?? rest.coverTrim };

  /*
    The only thing that earns a 3D case. `coverTextureUrl` is the product's
    3D Texture Source; `sleeve.url` is a wrap resolved from the retail game
    code. Both are complete back+spine+front artwork. The front box cover is
    deliberately not in this list.
  */
  const wrapUrl = isUsableUrl(caseProps.coverTextureUrl)
    ? caseProps.coverTextureUrl
    : isUsableUrl(caseProps.sleeve?.url)
      ? caseProps.sleeve?.url
      : undefined;

  const [textured, setTextured] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (hasWebGL()) setWebglReady(true);
  }, []);

  // Reset when the product changes, so a new game never inherits the previous
  // one's "already textured" state.
  useEffect(() => {
    setTextured(false);
    setHasError(false);
  }, [wrapUrl]);

  const handleTextured = useCallback(() => setTextured(true), []);

  const { motion } = readPrefs();
  const isReduced = motion === "lite";

  /**
   * The static stand-in: the Front Box Cover, shown at its natural aspect.
   *
   * `contain` rather than `cover`, and no plate behind it — a photograph of a
   * box cropped to fill a fixed frame loses its edges, and a black backing turns
   * a missing model into something that looks broken instead of something that
   * looks like a product photo.
   */
  const StaticCover = () => {
    const source = isUsableUrl(caseProps.coverUrl) ? caseProps.coverUrl : undefined;
    if (!source) {
      return (
        <div className="flex h-[320px] w-[240px] max-w-full flex-col items-center justify-center rounded-xl border border-white/10 bg-ink-900/80 p-4 text-center shadow-xl">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-nin/20 text-sm font-black text-nin">
            {caseProps.isSwitch2 ? "NS2" : "NS"}
          </div>
          <span className="line-clamp-2 text-xs font-bold text-white/90">{caseProps.title}</span>
        </div>
      );
    }
    return (
      <img
        src={cdnImage(source, { width: 800 })}
        alt={caseProps.title || "Game Cover"}
        loading="eager"
        decoding="async"
        width={480}
        height={768}
        className="h-auto max-h-[440px] w-auto max-w-full object-contain drop-shadow-2xl"
      />
    );
  };

  // No wrap artwork, no WebGL, reduced motion, or the model failed: the box
  // photograph is the whole answer. Nothing 3D is downloaded in this branch.
  const show3D = Boolean(wrapUrl) && webglReady && !hasError && !isReduced;

  if (!show3D) {
    return (
      <div
        className={cn(
          "relative flex min-h-[360px] w-full max-w-full items-center justify-center sm:min-h-[440px]",
          className,
        )}
      >
        <StaticCover />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative z-10",
        className,
        "flex min-h-[360px] w-full max-w-full items-center justify-center overflow-hidden sm:min-h-[440px] sm:overflow-visible",
      )}
    >
      {/* Holds the slot until the model is genuinely wearing its artwork. */}
      <div
        className={cn(
          "flex w-full items-center justify-center transition-opacity duration-700",
          textured ? "pointer-events-none absolute inset-0 opacity-0" : "relative opacity-100",
        )}
      >
        <StaticCover />
      </div>
      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-700",
          textured ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SafeBoundary
          onError={(err) => {
            console.error("[3D] case stage failed, falling back to the box cover:", err);
            setHasError(true);
          }}
        >
          <Suspense fallback={null}>
            <CaseStageWebGL
              {...caseProps}
              wrapUrl={wrapUrl as string}
              onTextured={handleTextured}
              onFailed={() => setHasError(true)}
            />
          </Suspense>
        </SafeBoundary>
      </div>
    </div>
  );
}
