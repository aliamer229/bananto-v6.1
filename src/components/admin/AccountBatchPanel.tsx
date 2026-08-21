import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, Send, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api, type AccountBatchEntry, type AccountBatchProgress } from "@/lib/api";
import { parseAccountPaste } from "@/lib/account-paste";

/** The server refuses anything larger, so the panel stops there too. */
const MAX_BATCH_ACCOUNTS = 50;

/**
 * Bulk account preparation for a single order line.
 *
 * Staff paste every account they have prepared in one go, and the buyer then
 * receives them one at a time: the next account is only released once the
 * current one has been registered, so the customer is never handed a stack of
 * logins to work through at once.
 */
export function AccountBatchPanel({
  orderId,
  itemId,
  onOrderChanged,
}: {
  orderId: string;
  itemId: string;
  onOrderChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [paste, setPaste] = useState("");

  const statusKey = ["account-batch", orderId, itemId] as const;
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => api.accountBatchStatus({ orderId, itemId }),
    refetchInterval: 20_000,
  });

  const progress: AccountBatchProgress | undefined = status.data?.progress;
  const parsed = useMemo(() => parseAccountPaste(paste), [paste]);
  const overLimit = parsed.accounts.length > MAX_BATCH_ACCOUNTS;

  const applyProgress = (next: AccountBatchProgress) => {
    queryClient.setQueryData(statusKey, { progress: next });
  };

  const stage = useMutation({
    mutationFn: () =>
      api.stageAccountBatch({
        orderId,
        itemId,
        // Only the login and the password ever leave this panel: the game name
        // and any supplier note stay behind.
        accounts: parsed.accounts.slice(0, MAX_BATCH_ACCOUNTS).map((account) => ({
          email: account.username,
          password: account.password,
        })),
      }),
    onSuccess: (result) => {
      applyProgress(result.progress);
      setPaste("");
      toast.success(`تمت إضافة ${result.added} حساب إلى الطابور`);
    },
    onError: (err: Error) => toast.error(err.message || "تعذر تجهيز الحسابات"),
  });

  const release = useMutation({
    mutationFn: () => api.releaseNextAccount({ orderId, itemId }),
    onSuccess: (result) => {
      applyProgress(result.progress);
      onOrderChanged?.();
      toast.success(`تم إرسال الحساب رقم ${result.released} للعميل`);
    },
    onError: (err: Error) => {
      // The server refuses while an account is still with the buyer; that is a
      // normal state, not a failure, so it reads as guidance rather than red.
      toast.message(err.message || "لا يوجد حساب جاهز للإرسال");
      void status.refetch();
    },
  });

  const busy = stage.isPending || release.isPending;
  const hasQueue = Boolean(progress && progress.total > 0);
  const waitingOnBuyer = Boolean(progress?.current);
  const canRelease = Boolean(progress?.next) && !waitingOnBuyer;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
          <Users className="h-4 w-4 text-amber-500" />
          <span>تجهيز الحسابات دفعة واحدة</span>
        </div>
        {hasQueue && progress ? (
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {progress.registered}/{progress.total} مكتمل
          </span>
        ) : null}
      </div>

      <textarea
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        rows={4}
        dir="ltr"
        placeholder={
          "account1@mail.com:Pass123\naccount2@mail.com,Pass456\naccount3@mail.com Pass789"
        }
        className="w-full rounded-lg border border-border bg-card px-2 py-2 font-mono text-[11px] leading-relaxed text-foreground"
      />

      {parsed.accounts.length > 0 && (
        <div className="space-y-1 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2">
          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            سيُرسل للعميل هذا فقط:
          </p>
          <ol className="max-h-40 space-y-1 overflow-y-auto">
            {parsed.accounts.slice(0, MAX_BATCH_ACCOUNTS).map((account, index) => (
              <li
                key={`${account.username}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-card px-2 py-1 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 font-bold text-muted-foreground">{index + 1}.</span>
                  <span className="truncate font-mono text-foreground" dir="ltr">
                    {account.username}
                  </span>
                  <span className="truncate font-mono text-muted-foreground" dir="ltr">
                    {account.password}
                  </span>
                </span>
                {account.label ? (
                  <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">
                    {account.label}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="text-muted-foreground">
          {parsed.accounts.length > 0 ? (
            <span className={overLimit ? "font-bold text-rose-600" : "font-bold text-emerald-600"}>
              {parsed.accounts.length} حساب جاهز للإضافة
              {overLimit ? ` (الحد ${MAX_BATCH_ACCOUNTS})` : ""}
            </span>
          ) : (
            <span>الصق الحسابات سطراً لكل حساب — يُستخرج اليوزر وكلمة المرور فقط</span>
          )}
          {parsed.duplicates.length > 0 ? (
            <span className="mr-2 text-amber-600">(تم تجاهل {parsed.duplicates.length} مكرر)</span>
          ) : null}
          {parsed.skipped.length > 0 ? (
            <span className="mr-2 text-rose-600">({parsed.skipped.length} سطر غير مقروء)</span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={busy || parsed.accounts.length === 0 || overLimit}
          onClick={() => stage.mutate()}
          className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background disabled:opacity-40"
        >
          {stage.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardList className="h-3.5 w-3.5" />
          )}
          <span>إضافة للطابور</span>
        </button>
      </div>

      {hasQueue && progress ? (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              بالانتظار {progress.staged}
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">
              مع العميل {progress.sent}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
              مسجّل {progress.registered}
            </span>
          </div>

          <ol className="max-h-40 space-y-1 overflow-y-auto">
            {progress.entries.map((entry) => (
              <BatchRow key={entry.id} entry={entry} />
            ))}
          </ol>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {waitingOnBuyer
                ? "الحساب الحالي مع العميل — يُرسل التالي تلقائياً بعد تأكيد تسجيله."
                : progress.next
                  ? "الحساب التالي جاهز للإرسال."
                  : "لا توجد حسابات متبقية في الطابور."}
            </p>
            <button
              type="button"
              disabled={busy || !canRelease}
              onClick={() => release.mutate()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-red)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {release.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>إرسال التالي</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BatchRow({ entry }: { entry: AccountBatchEntry }) {
  const tone =
    entry.status === "registered"
      ? "text-emerald-600"
      : entry.status === "sent"
        ? "text-amber-600"
        : "text-muted-foreground";
  const label =
    entry.status === "registered" ? "مسجّل" : entry.status === "sent" ? "مع العميل" : "بالانتظار";

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-card px-2 py-1 text-[11px]">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-bold text-muted-foreground">{entry.seq}.</span>
        <span className="truncate font-mono text-foreground" dir="ltr">
          {entry.email}
        </span>
      </span>
      <span className={`flex shrink-0 items-center gap-1 font-bold ${tone}`}>
        {entry.status === "registered" ? <CheckCircle2 className="h-3 w-3" /> : null}
        {label}
      </span>
    </li>
  );
}

export default AccountBatchPanel;
