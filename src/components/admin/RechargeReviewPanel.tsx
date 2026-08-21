import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  Clock,
  ExternalLink,
  ImageOff,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { adminApi } from "@/lib/api";
import type { RechargeRequestWithUser } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  zain_cash: "زين كاش",
  rafidain: "ماستركارد الرافدين",
  crypto: "عملات رقمية",
  eshop_card: "بطاقة Nintendo",
  banan_code: "كود بنانتو",
};

const IQD = new Intl.NumberFormat("en-US");

function money(amount: number | undefined): string {
  return `${IQD.format(Math.round(Number(amount ?? 0)))} د.ع`;
}

function when(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Proof of payment, shown rather than linked.
 *
 * The receipt is the whole basis for the decision, so it belongs on screen
 * next to the request. It is served from the private files route, which only
 * an administrator can read, and it opens full size on click.
 */
function ProofThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/40 text-[10px] font-bold text-muted-foreground"
      >
        <ImageOff className="h-4 w-4" />
        فتح الإثبات
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
        title="اضغط لتكبير الإثبات"
      >
        <img
          src={url}
          alt="إثبات الدفع"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-bold text-white">
          الإثبات
        </span>
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomed(false)}
        >
          <div className="max-h-full max-w-3xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img src={url} alt="إثبات الدفع" className="w-full rounded-xl" />
            <div className="mt-3 flex justify-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                فتح في تبويب جديد
              </a>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="rounded-xl bg-white/15 px-4 py-2 text-xs font-bold text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MemberCard({ request }: { request: RechargeRequestWithUser }) {
  const user = request.user;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-black">{user?.name || "عضو غير معروف"}</span>
        {user?.username && (
          <span className="text-[11px] text-muted-foreground" dir="ltr">
            @{user.username}
          </span>
        )}
        {user?.isAdmin && (
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600">
            مشرف
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {user?.phone && <span dir="ltr">{user.phone}</span>}
        {user?.email && (
          <span className="truncate" dir="ltr">
            {user.email}
          </span>
        )}
        <span dir="ltr">{request.userId}</span>
      </div>
      <p className="text-[11px] font-bold text-muted-foreground">
        الرصيد الحالي: {money(user?.walletBalance)}
      </p>
    </div>
  );
}

/**
 * Review queue for wallet top-ups, plus the log of everything already settled.
 *
 * Approving moves real money, so the decision is made with the receipt and the
 * member's identity both in view, and every settled request keeps who decided
 * it, when, and how much actually reached the wallet.
 */
export function RechargeReviewPanel({
  requests,
  onSettled,
  compact = false,
}: {
  requests: RechargeRequestWithUser[];
  onSettled?: () => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const settled = requests.filter((r) => r.status !== "pending");

  const afterSettle = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    onSettled?.();
  };

  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approve
        ? adminApi.approveRecharge(id, notes[id]?.trim() || undefined)
        : adminApi.rejectRecharge(id, notes[id]?.trim() || undefined),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (result: any, variables) => {
      if (variables.approve) {
        toast.success(
          `تمت الموافقة وإضافة ${money(result?.creditedAmount)} — الرصيد الآن ${money(result?.balance)}`,
        );
      } else {
        toast.success("تم رفض الطلب");
      }
      setNotes((prev) => ({ ...prev, [variables.id]: "" }));
      afterSettle();
    },
    onError: (error: any) => {
      // A request settled a moment ago by someone else, or a credit that did
      // not go through, must never look like it worked.
      const code = String(error?.message || "");
      if (code.includes("already_settled")) {
        toast.error("تمت معالجة هذا الطلب بالفعل — تم تحديث القائمة");
      } else if (code.includes("credit_failed")) {
        toast.error("تعذر إضافة الرصيد، أُعيد الطلب إلى قائمة الانتظار");
      } else if (code.includes("not_found")) {
        toast.error("الطلب غير موجود");
      } else {
        toast.error(code || "تعذر تنفيذ العملية");
      }
      afterSettle();
    },
    onSettled: () => setBusyId(null),
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Clock className="h-5 w-5 text-amber-500" />
          طلبات التعبئة المعلقة
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700">
              {pending.length}
            </span>
          )}
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm font-bold text-muted-foreground">
            لا يوجد طلبات معلقة
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {request.proofUrl ? (
                    <ProofThumbnail url={request.proofUrl} />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/40 text-[10px] font-bold text-muted-foreground">
                      <ImageOff className="h-4 w-4" />
                      بلا إثبات
                    </div>
                  )}

                  <MemberCard request={request} />

                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-lg font-black">{money(request.amount)}</p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      {METHOD_LABEL[request.method] ?? request.method}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{when(request.createdAt)}</p>
                    {request.eshopCode && (
                      <p className="mt-1 font-mono text-[10px]" dir="ltr">
                        {request.eshopCode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={notes[request.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))
                    }
                    placeholder="ملاحظة تُحفظ مع القرار (اختياري)"
                    className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === request.id}
                      onClick={() => review.mutate({ id: request.id, approve: true })}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                    >
                      {busyId === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      موافقة وإضافة الرصيد
                    </button>
                    <button
                      type="button"
                      disabled={busyId === request.id}
                      onClick={() => review.mutate({ id: request.id, approve: false })}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      رفض
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          سجل العمليات
        </h2>

        {settled.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm font-bold text-muted-foreground">
            لا توجد عمليات سابقة بعد
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-right text-xs">
              <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-bold">العضو</th>
                  <th className="px-4 py-3 font-bold">المبلغ</th>
                  <th className="px-4 py-3 font-bold">الطريقة</th>
                  <th className="px-4 py-3 font-bold">القرار</th>
                  <th className="px-4 py-3 font-bold">بواسطة</th>
                  <th className="px-4 py-3 font-bold">التاريخ</th>
                  <th className="px-4 py-3 font-bold">الإثبات</th>
                </tr>
              </thead>
              <tbody>
                {settled.slice(0, compact ? 10 : 100).map((request) => (
                  <tr key={request.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <span className="font-bold">{request.user?.name || request.userId}</span>
                      {request.adminNotes && (
                        <p className="text-[10px] text-muted-foreground">{request.adminNotes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {money(request.creditedAmount ?? request.amount)}
                      {request.creditedAmount != null &&
                        request.creditedAmount !== request.amount && (
                          <span className="mr-1 text-[10px] font-bold text-emerald-600">
                            (+مكافأة)
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {METHOD_LABEL[request.method] ?? request.method}
                    </td>
                    <td className="px-4 py-3">
                      {request.status === "approved" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-700">
                          <BadgeCheck className="h-3 w-3" />
                          مقبول
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-bold text-rose-700">
                          <X className="h-3 w-3" />
                          مرفوض
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {request.reviewedByName || request.reviewedBy || "—"}
                      {request.reviewSource === "telegram" && (
                        <span className="mr-1 text-[10px]">(تليجرام)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {when(request.reviewedAt || request.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {request.proofUrl ? (
                        <a
                          href={request.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          عرض <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default RechargeReviewPanel;
