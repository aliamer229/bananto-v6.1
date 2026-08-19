import type { ReactElement } from "react";
import type { PlatformId } from "@/hub/types";
import { cn } from "@/hub/utils/cn";

/** Nintendo Switch mark — two Joy-Con silhouettes. */
export function SwitchLogo({
  className,
  style,
}: {
  className?: string;
  /** Used by the 3D case, which sizes printed marks in px rather than classes. */
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M43.7 18.5H35c-9.1 0-16.5 7.4-16.5 16.5v30c0 9.1 7.4 16.5 16.5 16.5h8.7V18.5zm-11.1 40c-3.1 0-5.6-2.5-5.6-5.6s2.5-5.6 5.6-5.6 5.6 2.5 5.6 5.6-2.5 5.6-5.6 5.6zM54 18.5v63c10.4 0 18.8-8.4 18.8-18.8v-25.5C72.8 26.8 64.4 18.5 54 18.5zm9 21.4c3.1 0 5.6 2.5 5.6 5.6s-2.5 5.6-5.6 5.6-5.6-2.5-5.6-5.6 2.5-5.6 5.6-5.6z" />
    </svg>
  );
}

/** Switch mark with the generation numeral, used for Switch 2 badges. */
export function Switch2Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5", className)} aria-hidden="true">
      <SwitchLogo className="h-[1em] w-[1em]" />
      <span className="text-[0.85em] font-black leading-none">2</span>
    </span>
  );
}

export function PlayStationLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.6 3.4v15.1l3.4 1.1V7.1c0-.7.3-1.1.8-1 .7.2.8.9.8 1.6v5.1c2.1 1 3.8.0 3.8-2.7 0-2.8-1-4-3.9-5-1.1-.4-3.1-1-4.9-1.7zM6.3 17.9c-2-.6-2.3-1.7-1.4-2.4.8-.6 2.3-1.1 2.3-1.1l3-1.1v2.4l-2.1.8c-.8.3-.9.7-.3.9.6.2 1.6.1 2.4-.2v2.2c-1.3.2-2.7.1-3.9-.3zm10.9-.4l4.5-1.6v-2.2l-5.7 2c-.8.3-.9.7-.3.9.6.2 1.6.1 2.4-.2z" />
    </svg>
  );
}

export function XboxLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-6.3 2.2c1.7-.9 4.6.6 6.3 2.3 1.7-1.7 4.6-3.2 6.3-2.3A10 10 0 0 0 12 2zM4.2 5.9A10 10 0 0 0 2 12c0 3.1 1.4 5.9 3.6 7.7-.9-2.3 2.4-7.6 4.5-10.2C8.4 7.6 5.6 5.3 4.2 5.9zm15.6 0c-1.4-.6-4.2 1.7-5.9 3.6 2.1 2.6 5.4 7.9 4.5 10.2A10 10 0 0 0 22 12a10 10 0 0 0-2.2-6.1zM12 11.4c-2.3 2.8-5.2 7.4-4.4 8.5A10 10 0 0 0 12 22a10 10 0 0 0 4.4-2.1c.8-1.1-2.1-5.7-4.4-8.5z" />
    </svg>
  );
}

export function PcIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 4.5h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zm1 2v8h16v-8H4zM8 19h8v1.5H8V19z" />
    </svg>
  );
}

/** The store's own mark. */
export function BananaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 4c-.6 3.4.4 7.4 3 10.2C10.7 17 14.6 18.4 18 18c.9-.1 1.3-1.1.8-1.8-.5-.6-1.4-.8-2.2-1-2.6-.6-5-2-6.7-4-1.7-2-2.6-4.5-2.6-7 0-.8-.2-1.7-.9-2-.8-.3-1.3.2-1.4 1.8z"
        fill="currentColor"
      />
    </svg>
  );
}

export const PLATFORM_META: Record<
  PlatformId,
  {
    label: string;
    short: string;
    Icon: (props: { className?: string }) => ReactElement;
    nintendo?: boolean;
  }
> = {
  switch: { label: "Nintendo Switch", short: "Switch", Icon: SwitchLogo, nintendo: true },
  switch2: { label: "Nintendo Switch 2", short: "Switch 2", Icon: Switch2Logo, nintendo: true },
  ps5: { label: "PlayStation 5", short: "PS5", Icon: PlayStationLogo },
  ps4: { label: "PlayStation 4", short: "PS4", Icon: PlayStationLogo },
  "xbox-series": { label: "Xbox Series X|S", short: "Xbox", Icon: XboxLogo },
  "xbox-one": { label: "Xbox One", short: "Xbox One", Icon: XboxLogo },
  pc: { label: "PC", short: "PC", Icon: PcIcon },
};

/** Platform badge. Nintendo platforms carry the accent; others stay neutral. */
export function PlatformBadge({
  platform,
  size = "md",
  className,
}: {
  platform: PlatformId;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  const { Icon } = meta;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        meta.nintendo
          ? "bg-nin text-white"
          : "border border-white/10 bg-white/[0.06] text-[rgb(var(--text))]",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {meta.short}
    </span>
  );
}
