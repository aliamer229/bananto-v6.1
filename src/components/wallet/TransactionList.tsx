import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  Hash,
  Receipt,
  Clock,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  CreditCard,
  Zap,
  Gift,
  Coins,
} from "lucide-react";
import { tr } from "@/i18n";
import { useCurrency } from "@/context/CurrencyContext";
import { toast } from "sonner";

export interface Transaction {
  id: string;
  kind: "deposit" | "withdrawal" | "purchase" | "refund" | "admin_adjustment";
  amount: number;
  description: string;
  orderId?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
  status?: "completed" | "pending" | "rejected";
}

export interface RechargeRequest {
  id: string;
  userId: string;
  amount: number;
  method: string;
  status: "pending" | "approved" | "rejected";
  proofUrl?: string;
  eshopCode?: string;
  bananCode?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  rechargeRequests?: RechargeRequest[];
  isLoading?: boolean;
}

const METHOD_DETAILS: Record<string, { label: string; icon: any }> = {
  zain_cash: { label: "زين كاش", icon: CreditCard },
  rafidain: { label: "ماستركارد الرافدين", icon: CreditCard },
  crypto: { label: "عملات رقمية", icon: Coins },
  eshop_card: { label: "Nintendo Gift Card", icon: Gift },
  banan_code: { label: "كود بنانتو", icon: Gift },
  binance: { label: "Binance Pay", icon: Zap },
};

function formatDate(dateStr?: string | number) {
  if (!dateStr) return "";
  try {
    const d =
      typeof dateStr === "number" ? new Date(dateStr) : new Date(String(dateStr).replace(" ", "T"));
    if (isNaN(d.getTime())) {
      const num = Number(dateStr);
      if (!isNaN(num) && num > 0) {
        const d2 = new Date(num > 1e11 ? num : num * 1000);
        if (!isNaN(d2.getTime())) {
          return d2.toLocaleDateString("ar-IQ", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
      return "";
    }
    return d.toLocaleDateString("ar-IQ", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function TransactionList({
  transactions = [],
  rechargeRequests = [],
}: TransactionListProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "deposit" | "purchase">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const { formatIQDPrice } = useCurrency();

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("تم نسخ رقم الحركة");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pendingRequests = rechargeRequests.filter((r) => r.status === "pending");
  const nonApprovedRequests = rechargeRequests.filter(
    (r) => r.status === "pending" || r.status === "rejected",
  );

  const depositCount = transactions.filter(
    (tx) => tx.kind === "deposit" || tx.kind === "refund" || tx.amount > 0,
  ).length;

  const purchaseCount = transactions.filter(
    (tx) => tx.kind === "purchase" || tx.kind === "withdrawal" || tx.amount < 0,
  ).length;

  const pendingCount = pendingRequests.length;
  const totalItemsCount = transactions.length + nonApprovedRequests.length;

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    if (filter === "deposit") {
      return tx.kind === "deposit" || tx.kind === "refund" || tx.amount > 0;
    }
    if (filter === "purchase") {
      return tx.kind === "purchase" || tx.kind === "withdrawal" || tx.amount < 0;
    }
    return false;
  });

  const displayRequests = rechargeRequests.filter((req) => {
    if (filter === "pending") return true;
    if (filter === "all") return req.status === "pending" || req.status === "rejected";
    if (filter === "deposit") return req.status === "pending";
    return false;
  });

  const totalVisibleCount =
    filter === "pending"
      ? displayRequests.length
      : filteredTransactions.length + displayRequests.length;

  return (
    <div className="space-y-4">
      {/* Proof Image Preview Modal */}
      {selectedProof && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedProof(null)}
        >
          <div
            className="relative max-w-lg w-full bg-background rounded-2xl p-2 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedProof}
              alt="Payment Proof"
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
            <button
              onClick={() => setSelectedProof(null)}
              className="mt-3 w-full py-2 bg-zinc-900 text-white font-bold rounded-xl"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">{tr("آخر العمليات")}</h2>
        <span className="text-xs font-bold text-muted-foreground">
          {totalVisibleCount} {totalVisibleCount === 1 ? "عملية" : "عمليات"}
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === "all"
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-muted/70 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{tr("الكل")}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
            {totalItemsCount}
          </span>
        </button>

        {/* Dedicated Pending Review Filter */}
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === "pending"
              ? "bg-amber-500 text-black font-black shadow-sm"
              : pendingCount > 0
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 font-bold"
                : "bg-muted/70 text-muted-foreground hover:bg-muted"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{tr("قيد المراجعة")}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              filter === "pending"
                ? "bg-black/20 text-black font-black"
                : pendingCount > 0
                  ? "bg-amber-500 text-white font-bold"
                  : "bg-muted-foreground/20"
            }`}
          >
            {pendingCount}
          </span>
        </button>

        <button
          onClick={() => setFilter("deposit")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === "deposit"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-muted/70 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{tr("إيداع")}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
            {depositCount}
          </span>
        </button>

        <button
          onClick={() => setFilter("purchase")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === "purchase"
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-muted/70 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{tr("شراء")}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
            {purchaseCount}
          </span>
        </button>
      </div>

      {totalVisibleCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl bg-muted/20 border border-dashed border-border/60">
          <Receipt className="w-10 h-10 text-muted-foreground/40 mb-2" />
          <p className="font-bold text-sm text-muted-foreground">
            {filter === "pending"
              ? "لا توجد طلبات شحن قيد المراجعة حالياً"
              : filter === "deposit"
                ? "لا توجد عمليات إيداع حتى الآن"
                : filter === "purchase"
                  ? "لا توجد عمليات شراء حتى الآن"
                  : "لا توجد أي حركات في المحفظة بعد"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Render Recharge Requests (Pending / Under Review) */}
          {displayRequests.map((req) => {
            const methodInfo = METHOD_DETAILS[req.method] || {
              label: req.method,
              icon: CreditCard,
            };
            const formattedDate = formatDate(req.createdAt);
            const isPending = req.status === "pending";
            const isRejected = req.status === "rejected";
            const isApproved = req.status === "approved";

            return (
              <div
                key={req.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all shadow-sm ${
                  isPending
                    ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50"
                    : isRejected
                      ? "bg-rose-500/5 border-rose-500/30 hover:border-rose-500/50"
                      : "bg-card border-border/70"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5 ${
                      isPending
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : isRejected
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-emerald-500/15 text-emerald-600"
                    }`}
                  >
                    {isPending ? (
                      <Clock className="w-5 h-5 animate-pulse" />
                    ) : isRejected ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-sm text-foreground">
                        {tr("طلب شحن")} - {methodInfo.label}
                      </p>

                      {/* Status Badges */}
                      {isPending && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tr("قيد المراجعة")}
                        </span>
                      )}

                      {isRejected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {tr("مرفوض")}
                        </span>
                      )}

                      {isApproved && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {tr("مكتمل")}
                        </span>
                      )}
                    </div>

                    {/* Reference and details */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-medium">
                      <div className="flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md font-mono text-[10px]">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="font-semibold select-all text-foreground/80">
                          {req.id}
                        </span>
                        <button
                          onClick={(e) => handleCopy(req.id, e)}
                          className="p-0.5 hover:text-foreground text-muted-foreground transition-colors ml-0.5"
                          title="نسخ رقم الطلب"
                        >
                          {copiedId === req.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {formattedDate && <span>{formattedDate}</span>}

                      {req.proofUrl && (
                        <button
                          onClick={() => setSelectedProof(req.proofUrl || null)}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md hover:bg-blue-500/20 transition-colors"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>{tr("صورة الإثبات")}</span>
                        </button>
                      )}
                    </div>

                    {/* Admin rejection notes if any */}
                    {isRejected && req.adminNotes && (
                      <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl mt-1">
                        <span className="font-bold">ملاحظة الإدارة: </span>
                        {req.adminNotes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                  <p
                    className={`font-black text-base ${
                      isPending
                        ? "text-amber-600 dark:text-amber-400"
                        : isRejected
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}
                    dir="ltr"
                  >
                    +
                    {req.method === "eshop_card" || req.method === "crypto"
                      ? `$${Number(req.amount).toFixed(2)}`
                      : formatIQDPrice(Number(req.amount))}
                  </p>
                  <span className="text-[10px] text-muted-foreground font-bold">
                    {methodInfo.label}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Render Ledger Transactions */}
          {filteredTransactions.map((tx) => {
            const isDeposit = tx.kind === "deposit" || tx.kind === "refund" || tx.amount > 0;
            const formattedDate = formatDate(tx.createdAt);

            return (
              <div
                key={tx.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/70 hover:border-border transition-colors shadow-sm"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5 ${
                      isDeposit
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-rose-500/10 text-rose-600"
                    }`}
                  >
                    {isDeposit ? (
                      <ArrowDownLeft className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-sm text-foreground truncate">
                        {tx.description || (isDeposit ? "إيداع رصيد" : "شراء")}
                      </p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isDeposit
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {isDeposit ? "إيداع" : "شراء"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-medium">
                      <div className="flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md font-mono text-[10px]">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="font-semibold select-all text-foreground/80">{tx.id}</span>
                        <button
                          onClick={(e) => handleCopy(tx.id, e)}
                          className="p-0.5 hover:text-foreground text-muted-foreground transition-colors ml-0.5"
                          title="نسخ رقم الحركة"
                        >
                          {copiedId === tx.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {formattedDate && <span>{formattedDate}</span>}
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                  <p
                    className={`font-black text-base ${
                      isDeposit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                    dir="ltr"
                  >
                    {isDeposit ? "+" : "-"}
                    {formatIQDPrice(Math.abs(tx.amount))}
                  </p>
                  {tx.orderId && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      طلب #{tx.orderId.slice(-6)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
