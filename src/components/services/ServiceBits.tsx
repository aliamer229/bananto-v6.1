import React from "react";
import { Check, LogIn } from "lucide-react";

/** Shared presentation primitives for the two service pages
 *  (/add_game and /disc_trade). Not used anywhere else. */

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 border border-border px-3 py-1 text-xs font-bold text-muted-foreground">
      <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-black tracking-wide">
      {children}
    </span>
  );
}

export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: string[];
  current: number;
  onGo?: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="خطوات">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onGo && i <= current ? () => onGo(i) : undefined}
              disabled={!onGo || i > current}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-black ${
                  active ? "bg-primary-foreground/20" : "bg-background/60"
                }`}
              >
                {done ? <Check className="w-3 h-3" aria-hidden="true" /> : i + 1}
              </span>
              {label}
            </button>
            {i < steps.length - 1 && <span className="w-4 h-px bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function ChoiceCard({
  selected,
  title,
  description,
  hint,
  onSelect,
}: {
  selected: boolean;
  title: string;
  description?: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-start rounded-2xl border p-4 min-h-[56px] transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid place-items-center w-5 h-5 rounded-full border shrink-0 ${
            selected ? "bg-primary border-primary text-primary-foreground" : "border-border"
          }`}
          aria-hidden="true"
        >
          {selected && <Check className="w-3 h-3" />}
        </span>
        <span className="flex-1">
          <span className="block font-bold text-sm text-foreground">{title}</span>
          {description && (
            <span className="block text-xs text-muted-foreground mt-1">{description}</span>
          )}
        </span>
        {hint && <span className="text-xs font-bold text-primary shrink-0">{hint}</span>}
      </div>
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function LoginGate({
  title,
  description,
  redirect,
}: {
  title: string;
  description: string;
  redirect: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
        <LogIn className="w-6 h-6" aria-hidden="true" />
      </div>
      <h3 className="font-black text-lg text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-4">{description}</p>
      <a
        href={`/auth?redirect=${encodeURIComponent(redirect)}`}
        className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold"
      >
        تسجيل الدخول والمتابعة
      </a>
    </div>
  );
}

export interface TimelineNode {
  status: string;
  title: string;
  description?: string;
  at?: string;
  done: boolean;
  current: boolean;
}

export function StatusTimeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <ol className="relative space-y-4 ps-5">
      <span className="absolute inset-y-1 start-[7px] w-px bg-border" aria-hidden="true" />
      {nodes.map((n) => (
        <li key={n.status} className="relative">
          <span
            className={`absolute -start-5 top-1 w-3.5 h-3.5 rounded-full border-2 ${
              n.current
                ? "bg-primary border-primary"
                : n.done
                  ? "bg-primary/40 border-primary/40"
                  : "bg-background border-border"
            }`}
            aria-hidden="true"
          />
          <p
            className={`text-sm font-bold ${n.current ? "text-foreground" : "text-muted-foreground"}`}
          >
            {n.title}
          </p>
          {n.description && <p className="text-xs text-muted-foreground">{n.description}</p>}
        </li>
      ))}
    </ol>
  );
}

export function formatIqd(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} د.ع`;
}
