import { useState } from "react";
import { Check, Copy, FileText, Gamepad2, KeyRound, ShieldCheck } from "lucide-react";

import { normalizeAccountCard, isRenderableAccountCard } from "@/lib/account-cards";

interface AccountCardProps {
  kind: string;
  body: Record<string, unknown> | null | undefined;
  /** "ar" (default) or "en" labels */
  locale?: "ar" | "en";
  /** visual tone: light bubble (customer) or dark admin bubble */
  tone?: "default" | "admin";
}

const LABELS = {
  ar: {
    credentials: "معلومات الحساب",
    verification: "رمز التحقق",
    instructions: "التعليمات",
    accountUser: "اسم المستخدم",
    password: "كلمة المرور",
    code: "رمز التحقق",
    copy: "نسخ",
    copied: "تم النسخ",
    show: "إظهار",
    hide: "إخفاء",
  },
  en: {
    credentials: "Account details",
    verification: "Verification code",
    instructions: "Instructions",
    accountUser: "Account user",
    password: "Password",
    code: "Verification code",
    copy: "Copy",
    copied: "Copied",
    show: "Show",
    hide: "Hide",
  },
} as const;

function CopyField({
  label,
  value,
  masked = false,
  copyLabel,
  copiedLabel,
  mono = true,
}: {
  label: string;
  value: string;
  masked?: boolean;
  copyLabel: string;
  copiedLabel: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!masked);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-1 min-w-0">
      <span className="block text-[11px] font-semibold opacity-70">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-current/15 bg-current/5 px-2.5 py-2 min-w-0">
        <span
          dir="ltr"
          className={`flex-1 min-w-0 truncate select-all text-[13px] font-semibold ${
            mono ? "font-mono" : ""
          }`}
        >
          {revealed ? value : "•".repeat(Math.min(value.length, 12))}
        </span>
        {masked ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold opacity-80 hover:opacity-100 hover:bg-current/10 transition-colors"
          >
            {revealed ? LABELS.ar.hide : LABELS.ar.show}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCopy}
          aria-label={`${copyLabel} — ${label}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold hover:bg-current/10 transition-colors min-h-8"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
    </div>
  );
}

export function AccountCard({ kind, body, locale = "ar", tone = "default" }: AccountCardProps) {
  const card = normalizeAccountCard(kind, body);
  if (!card || !isRenderableAccountCard(card)) return null;
  const t = LABELS[locale];

  const heading =
    card.type === "credentials"
      ? t.credentials
      : card.type === "verification"
        ? t.verification
        : t.instructions;

  const Icon =
    card.type === "credentials" ? KeyRound : card.type === "verification" ? ShieldCheck : FileText;

  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`w-full max-w-[320px] space-y-3 rounded-2xl border p-3 ${
        tone === "admin"
          ? "border-white/15 bg-white/5"
          : "border-border/60 bg-card/80 text-foreground"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-current/10 pb-2">
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
        <span className="text-[13px] font-bold">{heading}</span>
      </div>

      {card.title ? (
        <div className="flex items-center gap-1.5 text-[12px] font-semibold opacity-90 min-w-0">
          <Gamepad2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{card.title}</span>
        </div>
      ) : null}

      {card.accountUser ? (
        <CopyField
          label={t.accountUser}
          value={card.accountUser}
          copyLabel={t.copy}
          copiedLabel={t.copied}
        />
      ) : null}

      {card.type === "credentials" && card.password ? (
        <CopyField
          label={t.password}
          value={card.password}
          masked
          copyLabel={t.copy}
          copiedLabel={t.copied}
        />
      ) : null}

      {card.type === "verification" && card.verificationCode ? (
        <CopyField
          label={t.code}
          value={card.verificationCode}
          copyLabel={t.copy}
          copiedLabel={t.copied}
        />
      ) : null}

      {card.type === "instructions" && card.text ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{card.text}</p>
      ) : null}

      {card.type === "instructions" && card.images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {card.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
              <img
                src={src}
                alt={card.title ?? heading}
                loading="lazy"
                className="h-24 w-full rounded-xl object-cover border border-current/10"
              />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default AccountCard;
