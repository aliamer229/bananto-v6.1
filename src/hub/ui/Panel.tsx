import { createElement, type ElementType, type ReactNode } from "react";
import { cn } from "@/hub/utils/cn";

/**
 * The one surface primitive.
 *
 * A panel is a *tint of the page*, not a card floating above it: hairline
 * border, one inset highlight along the top edge, no drop shadow by default.
 * `tone="inset"` steps darker (used for content nested inside a panel) and
 * `tone="accent"` adds a very low-opacity accent wash for the single element
 * per screen that deserves emphasis.
 */
interface PanelProps {
  as?: ElementType;
  tone?: "default" | "inset" | "accent" | "bare";
  interactive?: boolean;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}

const TONES: Record<NonNullable<PanelProps["tone"]>, string> = {
  default: "panel",
  inset: "inset",
  accent:
    "relative rounded-panel border border-nin/25 bg-[linear-gradient(160deg,rgba(230,0,18,0.14),rgba(230,0,18,0.03))]",
  bare: "rounded-panel",
};

export function Panel({
  as: Tag = "div",
  tone = "default",
  interactive = false,
  className,
  children,
  ...rest
}: PanelProps) {
  // createElement rather than JSX: the prop index signature makes the JSX
  // `children` slot resolve to `never` for a dynamic tag.
  return createElement(
    Tag,
    { className: cn(TONES[tone], interactive && "panel-hover", className), ...rest },
    children,
  );
}
