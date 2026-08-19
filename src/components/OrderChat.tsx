import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ImagePlus, Send, ShieldCheck, Ticket } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, fileToDataUrl } from "@/lib/api";
import { isAccountKind, type ChatMessage, type Order, type OrderItem } from "@/lib/types";

function Bubble({ message, children }: { message: ChatMessage; children: React.ReactNode }) {
  const mine = message.senderRole === "user";
  const system = message.senderRole === "system";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          system
            ? "border border-amber-200 bg-amber-50 text-amber-900"
            : mine
              ? "bg-[var(--brand-red)] text-white"
              : "border border-border bg-card text-foreground"
        }`}
      >
        {!system && !mine && message.senderName && (
          <p className="mb-1 text-[11px] font-bold text-muted-foreground">{message.senderName}</p>
        )}
        {children}
        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
          {new Date(message.createdAt).toLocaleString("ar", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function cleanCredentialValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (s === "null" || s === "undefined" || s === "excluded_from_export" || s === "[excluded]") {
    return "";
  }
  return s;
}

function CredentialsCard({ message }: { message: ChatMessage; order: Order }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const email = cleanCredentialValue(message.body["email"]);
  const password = cleanCredentialValue(message.body["password"]);
  const code = cleanCredentialValue(message.body["code"] ?? message.body["deliveryCode"]);
  const pin = cleanCredentialValue(message.body["pin"]);
  const title = cleanCredentialValue(message.body["title"]);
  const notes = cleanCredentialValue(message.body["notes"]);

  const copyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-2.5 min-w-[220px]">
      <p className="flex items-center gap-2 font-bold text-xs sm:text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>بيانات الحساب {title ? `— ${title}` : ""}</span>
      </p>

      <div className="space-y-2 rounded-xl bg-black/10 p-2.5 font-mono text-xs">
        {email ? (
          <div className="flex items-center justify-between gap-2" dir="ltr">
            <span className="truncate select-all font-sans font-medium">{email}</span>
            <button
              type="button"
              onClick={() => copyText(email, "email")}
              className="p-1 hover:bg-black/10 rounded transition-colors shrink-0"
              title="نسخ البريد"
            >
              {copiedKey === "email" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : null}

        {password ? (
          <div className="flex items-center justify-between gap-2" dir="ltr">
            <span className="truncate select-all font-semibold">{password}</span>
            <button
              type="button"
              onClick={() => copyText(password, "password")}
              className="p-1 hover:bg-black/10 rounded transition-colors shrink-0"
              title="نسخ كلمة المرور"
            >
              {copiedKey === "password" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : null}

        {code ? (
          <div className="flex items-center justify-between gap-2" dir="ltr">
            <span className="truncate select-all font-bold tracking-wider">{code}</span>
            <button
              type="button"
              onClick={() => copyText(code, "code")}
              className="p-1 hover:bg-black/10 rounded transition-colors shrink-0"
              title="نسخ الكود"
            >
              {copiedKey === "code" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : null}

        {pin ? (
          <div className="flex items-center justify-between gap-2" dir="ltr">
            <span className="truncate select-all">{pin}</span>
            <button
              type="button"
              onClick={() => copyText(pin, "pin")}
              className="p-1 hover:bg-black/10 rounded transition-colors shrink-0"
              title="نسخ PIN"
            >
              {copiedKey === "pin" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : null}

        {notes ? (
          <p className="text-[11px] font-sans text-muted-foreground whitespace-pre-wrap mt-1">
            {notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MessageBody({ message, order }: { message: ChatMessage; order: Order }) {
  const [copiedCode, setCopiedCode] = useState(false);

  const copyCodeText = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  switch (message.kind) {
    case "image":
    case "payment_receipt":
      return (
        <div className="space-y-2">
          <img
            src={String(message.body["imageUrl"] ?? "")}
            alt="مرفق"
            className="max-h-64 rounded-xl object-cover"
          />
          {message.body["text"] ? <p>{String(message.body["text"])}</p> : null}
        </div>
      );
    case "payment_methods_card": {
      const methods =
        (message.body["methods"] as { id: string; name: string; details?: string }[]) ?? [];
      return (
        <div className="space-y-2">
          <p className="font-bold">
            المبلغ المطلوب: {Number(message.body["total"] ?? 0).toLocaleString()}{" "}
            {String(message.body["currency"] ?? "")}
          </p>
          <ul className="space-y-1 text-xs">
            {methods.map((method) => (
              <li key={method.id} className="rounded-lg bg-black/5 px-2 py-1">
                <b>{method.name}</b>
                {method.details ? ` — ${method.details}` : ""}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "item_credentials":
      return <CredentialsCard message={message} order={order} />;
    case "item_verification_code": {
      const code = String(message.body["code"] ?? "");
      return (
        <div className="space-y-1.5 text-center">
          <p className="text-[11px] font-bold opacity-80">كود التحقق الخاص بك</p>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-black/10 py-1.5 px-3">
            <span className="font-mono text-lg font-bold tracking-widest" dir="ltr">
              {code}
            </span>
            <button
              type="button"
              onClick={() => copyCodeText(code)}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="نسخ كود التحقق"
            >
              {copiedCode ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      );
    }
    case "discount_code": {
      const code = String(message.body["code"] ?? "");
      return (
        <div className="space-y-1">
          {message.body["text"] ? <p>{String(message.body["text"])}</p> : null}
          <div
            className="flex items-center justify-between gap-2 rounded-lg bg-black/10 p-2 font-mono"
            dir="ltr"
          >
            <span className="text-sm font-bold tracking-wider">{code}</span>
            <button
              type="button"
              onClick={() => copyCodeText(code)}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="نسخ كود الخصم"
            >
              {copiedCode ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      );
    }
    case "order_completed":
      return <p className="font-bold">تم إكمال الطلب {String(message.body["code"] ?? "")} 🎉</p>;
    default:
      return <p className="whitespace-pre-wrap">{String(message.body["text"] ?? "")}</p>;
  }
}

function AdminPanel({ order, onDone }: { order: Order; onDone: () => void }) {
  const [itemId, setItemId] = useState(order.items[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const item: OrderItem | undefined = order.items.find((i) => i.id === itemId);

  const action = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.adminOrderAction({ orderId: order.id, ...payload }),
    onSuccess: onDone,
  });

  return (
    <div className="space-y-3 border-t border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => action.mutate({ action: "set_payment", paymentStatus: "paid" })}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
        >
          تأكيد الدفع
        </button>
        <button
          onClick={() => action.mutate({ action: "set_payment", paymentStatus: "rejected" })}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
        >
          رفض الدفع
        </button>
        <button
          onClick={() => action.mutate({ action: "complete_order" })}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-white"
        >
          إكمال الطلب
        </button>
      </div>

      <select
        value={itemId}
        onChange={(event) => setItemId(event.target.value)}
        className="w-full rounded-lg border border-border px-2 py-2 text-xs"
      >
        {order.items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title} — {isAccountKind(i.kind) ? "حساب" : "جهاز"}
          </option>
        ))}
      </select>

      {isAccountKind(item?.kind) ? (
        <div className="space-y-2">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="بريد الحساب"
            className="w-full rounded-lg border border-border px-2 py-2 text-xs"
            dir="ltr"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="كلمة المرور (تُشفَّر)"
            className="w-full rounded-lg border border-border px-2 py-2 text-xs"
            dir="ltr"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                action.mutate({ action: "stage_credentials", itemId, email, password })
              }
              className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold"
            >
              تجهيز البيانات
            </button>
            <button
              disabled={Boolean(item?.credsSentAt)}
              onClick={() => action.mutate({ action: "send_credentials", itemId })}
              className="rounded-lg bg-[var(--brand-red)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {item?.credsSentAt ? "تم الإرسال" : "إرسال للعميل"}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="رمز التحقق"
              className="flex-1 rounded-lg border border-border px-2 py-2 text-xs"
              dir="ltr"
            />
            <button
              onClick={() => action.mutate({ action: "send_verification_code", itemId, code })}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-white"
            >
              إرسال الرمز
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => action.mutate({ action: "mark_shipped", itemId })}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            تم الشحن
          </button>
          <button
            onClick={() => action.mutate({ action: "mark_delivered", itemId })}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            تم التسليم
          </button>
        </div>
      )}
    </div>
  );
}

export default function OrderChat({
  orderId,
  isAdmin = false,
}: {
  orderId: string;
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.order(orderId),
    refetchInterval: 4000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["order", orderId] });

  const send = useMutation({
    mutationFn: (payload: { text?: string; imageUrl?: string }) =>
      api.sendMessage({ threadId: data!.thread.id, ...payload }),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });

  const messages: ChatMessage[] = data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const uploadReceipt = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const { url } = await api.upload(dataUrl, "receipts");
    send.mutate({ imageUrl: url, text: "إيصال الدفع" });
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل المحادثة...</div>
    );
  }

  const { order } = data;

  return (
    <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl border border-border bg-[#faf8f2]">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-bold text-foreground">طلب {order.code}</p>
          <p className="text-xs text-muted-foreground">
            {order.status === "completed"
              ? "مكتمل"
              : order.status === "delivering"
                ? "قيد التسليم"
                : "قيد المعالجة"}{" "}
            · {order.paymentStatus === "paid" ? "مدفوع" : "بانتظار الدفع"}
          </p>
        </div>
        <p className="text-sm font-bold text-[var(--brand-red)]">
          {order.total.toLocaleString()} {order.currency}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <Bubble key={message.id} message={message}>
            <MessageBody message={message} order={order} />
          </Bubble>
        ))}
        <div ref={bottomRef} />
      </div>

      {isAdmin && <AdminPanel order={order} onDone={refresh} />}

      <div className="flex items-center gap-2 border-t border-border bg-card p-3">
        <label className="cursor-pointer rounded-xl bg-muted p-2.5 text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadReceipt(file);
            }}
          />
        </label>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && text.trim()) send.mutate({ text: text.trim() });
          }}
          placeholder="اكتب رسالتك للدعم..."
          className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm outline-none focus:border-[var(--brand-red)]"
        />
        <button
          disabled={!text.trim() || send.isPending}
          onClick={() => send.mutate({ text: text.trim() })}
          className="rounded-xl bg-[var(--brand-red)] p-2.5 text-white disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
