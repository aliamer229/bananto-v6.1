import React, { useState } from "react";
import { isVideoUrl } from "@/lib/uploads";
import {
  Key,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Bot,
  User,
  Shield,
  Info,
  Maximize2,
  Ticket,
  Sparkles,
} from "lucide-react";
import { ChatMessage, MessageKind } from "@/lib/types";
import { toast } from "sonner";
import { accountCardTypeFor } from "@/lib/account-cards";
import AccountCard from "@/components/chat/AccountCard";

interface MessageCardProps {
  message: ChatMessage;
  onSelectSuggestion?: (text: string) => void;
}

export function MessageCard({ message, onSelectSuggestion }: MessageCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showImageZoom, setShowImageZoom] = useState(false);

  const copyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isUser = message.senderRole === "user";
  const isAdmin = message.senderRole === "admin";
  const isAssistant = message.senderRole === "assistant";
  const isSystem = message.senderRole === "system";

  const rawBody = (message.body || {}) as Record<string, any>;
  const cleanVal = (val: any) => {
    if (!val) return null;
    const str = String(val).trim();
    if (str === "null" || str === "undefined" || str === "excluded_from_export" || str === "") {
      return null;
    }
    return str;
  };

  const body: Record<string, any> = {
    ...rawBody,
    email: cleanVal(rawBody.email),
    password: cleanVal(rawBody.password),
    pin: cleanVal(rawBody.pin),
    code: cleanVal(rawBody.code),
    activationCode: cleanVal(rawBody.activationCode),
    cardCode: cleanVal(rawBody.cardCode),
    title: cleanVal(rawBody.title),
    text: cleanVal(rawBody.text),
    notes: cleanVal(rawBody.notes),
    instructions: cleanVal(rawBody.instructions),
    imageUrl:
      cleanVal(rawBody.imageUrl) ||
      (rawBody.mediaId ? `/api/files/legacy/${rawBody.mediaId}` : null),
  };
  const kind = message.kind;
  const legacyCardType = accountCardTypeFor(kind);

  // System notification message
  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/60 text-[11px] text-muted-foreground font-medium shadow-2xs">
          <Info className="w-3 h-3 text-muted-foreground" />
          <span>{body.text || "إشعار نظام"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      className={`flex flex-col my-1.5 w-full ${isAdmin ? "items-end" : "items-start"}`}
    >
      {/* Sender Header */}
      <div
        className={`flex items-center gap-1.5 mb-1 px-1 text-[11px] text-muted-foreground ${isAdmin ? "flex-row-reverse" : ""}`}
        dir="auto"
      >
        {isAdmin && (
          <>
            <Shield className="w-3 h-3 text-primary" />
            <span className="font-bold text-foreground">المشرف</span>
          </>
        )}
        {isAssistant && (
          <>
            <Bot className="w-3 h-3 text-amber-500" />
            <span className="font-bold text-foreground">
              {message.senderName || "مساعد بنانتو"}
            </span>
          </>
        )}
        {isUser && (
          <>
            <span className="font-medium">{message.senderName || "العميل"}</span>
            <User className="w-3 h-3 text-muted-foreground" />
          </>
        )}
        <span className="text-[10px] opacity-70">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Bubble / Card container */}
      <div
        dir="auto"
        className={`relative max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 shadow-2xs text-xs leading-relaxed transition-all ${
          isAdmin
            ? "bg-[var(--admin-ink)] text-white rounded-tr-xs border border-black/10"
            : isAssistant
              ? "bg-amber-500/10 text-foreground border border-amber-500/20 rounded-tr-xs"
              : "bg-muted/30 text-foreground border border-border rounded-tl-xs"
        }`}
      >
        {/* 1. Legacy account delivery cards (credentials / verification / instructions) */}
        {legacyCardType ? <AccountCard kind={kind} body={rawBody} tone="admin" /> : null}

        {/* 2. Activation Code / Card Code / OTP Card */}
        {kind === "discount_code" ||
        (body.code && !body.email) ||
        body.activationCode ||
        body.cardCode ? (
          <div className="space-y-2.5 min-w-[240px] sm:min-w-[260px]">
            <div className="flex items-center justify-between gap-1.5 font-bold text-xs border-b border-current/20 pb-2">
              <div className="flex items-center gap-1.5">
                {kind === "item_verification_code" ? (
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <Ticket className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>
                  {kind === "item_verification_code"
                    ? "كود التحقق (OTP)"
                    : kind === "discount_code"
                      ? "كود الخصم"
                      : "كود البطاقة / التفعيل"}
                </span>
              </div>
              {body.cardType && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-bold shrink-0">
                  {body.cardType}
                </span>
              )}
            </div>

            {body.title && <div className="text-[11px] font-bold opacity-90">{body.title}</div>}

            {/* Code Row */}
            {(body.code || body.activationCode || body.cardCode) && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/15 gap-2">
                <span className="opacity-75 text-[11px] whitespace-nowrap font-medium">الكود:</span>
                <div
                  className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest overflow-hidden"
                  dir="ltr"
                >
                  <span className="select-all truncate">
                    {body.code || body.activationCode || body.cardCode}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        String(body.code || body.activationCode || body.cardCode),
                        "كود التفعيل",
                      )
                    }
                    className="p-1 hover:bg-white/20 rounded-md transition-colors shrink-0"
                    title="نسخ الكود"
                  >
                    {copiedKey === "كود التفعيل" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* PIN or serial if exists */}
            {body.pin && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-black/15 gap-2">
                <span className="opacity-75 text-[11px] whitespace-nowrap font-medium">
                  الرقم السري (PIN):
                </span>
                <div
                  className="flex items-center gap-2 font-mono text-xs font-bold overflow-hidden"
                  dir="ltr"
                >
                  <span className="select-all">{body.pin}</span>
                  <button
                    type="button"
                    onClick={() => copyText(String(body.pin), "الرقم السري PIN")}
                    className="p-1 hover:bg-white/20 rounded-md transition-colors shrink-0"
                    title="نسخ PIN"
                  >
                    {copiedKey === "الرقم السري PIN" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {body.expiresInMinutes && (
              <div className="text-[10px] opacity-80 text-center">
                صالح لمدة {body.expiresInMinutes} دقيقة
              </div>
            )}

            {body.instructions && (
              <div className="text-[11px] opacity-90 p-2 rounded-xl bg-black/10 mt-1 whitespace-pre-wrap">
                {body.instructions}
              </div>
            )}
          </div>
        ) : null}

        {/* 4. Image Attachment */}
        {body.imageUrl && !legacyCardType ? (
          <div className="space-y-2">
            <div className="relative group overflow-hidden rounded-xl border border-border/40 max-w-sm">
              {isVideoUrl(body.imageUrl) ? (
                <video
                  src={body.imageUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full max-h-60 bg-black"
                />
              ) : (
                <img
                  src={body.imageUrl}
                  alt="مرفق محادثة"
                  className="w-full max-h-60 object-cover cursor-pointer hover:scale-102 transition-transform"
                  onClick={() => setShowImageZoom(true)}
                />
              )}
              <button
                type="button"
                onClick={() => setShowImageZoom(true)}
                className="absolute bottom-2 left-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {body.text && <p className="text-xs whitespace-pre-wrap">{body.text}</p>}
          </div>
        ) : null}

        {/* 5. Standard Text message (if not handled by custom cards) */}
        {!legacyCardType &&
          kind !== "discount_code" &&
          !body.imageUrl &&
          !(body.email && body.password) &&
          !(body.code && !body.email) &&
          body.text && (
            <p className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{body.text}</p>
          )}

        {/* 6. AI Assistant Suggestions / Cards */}
        {body.suggestions && Array.isArray(body.suggestions) && body.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-current/10">
            {body.suggestions.map((sugg: string, idx: number) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectSuggestion && onSelectSuggestion(sugg)}
                className="px-2 py-1 bg-white/20 hover:bg-white/30 text-current rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1"
              >
                <span>{sugg}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Image Zoom Modal */}
      {showImageZoom && body.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowImageZoom(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-black">
            <img
              src={body.imageUrl}
              alt="مرفق مكبر"
              className="max-w-full max-h-[85vh] object-contain mx-auto"
            />
            <button
              onClick={() => setShowImageZoom(false)}
              className="absolute top-3 right-3 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
