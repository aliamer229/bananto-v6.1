import type { CurrencyCode, Money } from "@/hub/types";

/** Currencies whose smallest unit is the unit itself. */
const ZERO_DECIMAL: CurrencyCode[] = ["JPY", "IQD"];

export function formatMoney(money: Money | undefined, locale = "en-US"): string | null {
  if (!money || !Number.isFinite(money.amount)) return null;
  if (money.currency === "IQD") {
    return `${Math.round(money.amount).toLocaleString("en-US")} د.ع`;
  }
  const fractionDigits = ZERO_DECIMAL.includes(money.currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(money.amount);
  } catch {
    return `${money.amount.toFixed(fractionDigits)} ${money.currency}`;
  }
}

export function formatAmount(amount: number, currency: CurrencyCode, locale = "en-US"): string {
  return formatMoney({ amount, currency }, locale) ?? `${amount}`;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function formatBytes(bytes: number | undefined, locale = "en-US"): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: gb < 10 ? 1 : 1 }).format(gb)} GB`;
  }
  const mb = bytes / MB;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(mb)} MB`;
}

export const gb = (n: number) => Math.round(n * GB);

export function formatDate(iso: string | undefined, locale = "en-US"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatMonthYear(iso: string | undefined, locale = "en-US"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short" }).format(d);
}

/**
 * "Updated 5 minutes ago". Returns null for missing/invalid input so callers can
 * omit the freshness line entirely rather than showing a fake timestamp.
 */
export function formatRelativeTime(iso: string | undefined, locale = "en-US"): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (abs < 60) return rtf.format(Math.trunc(deltaSeconds), "second");
  if (abs < 3600) return rtf.format(Math.trunc(deltaSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.trunc(deltaSeconds / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.trunc(deltaSeconds / 86400), "day");
  if (abs < 31536000) return rtf.format(Math.trunc(deltaSeconds / 2592000), "month");
  return rtf.format(Math.trunc(deltaSeconds / 31536000), "year");
}

export function formatRange(
  range: { min: number; max: number } | undefined,
  unit?: string,
): string | null {
  if (!range) return null;
  const body = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  return unit ? `${body} ${unit}` : body;
}

export function formatDuration(seconds: number | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPercent(value: number, locale = "en-US", digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCount(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}
