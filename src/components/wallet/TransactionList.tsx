import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Copy, Check, Hash, Receipt } from "lucide-react";
import { tr } from "@/i18n";
import { useCurrency } from "@/context/CurrencyContext";
import { toast } from "sonner";

interface Transaction {
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

interface TransactionListProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

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

export function TransactionList({ transactions = [] }: TransactionListProps) {
  const [filter, setFilter] = useState<"all" | "deposit" | "purchase">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { formatIQDPrice } = useCurrency();

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("تم نسخ رقم الحركة");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const depositCount = transactions.filter(
    (tx) => tx.kind === "deposit" || tx.kind === "refund" || tx.amount > 0,
  ).length;

  const purchaseCount = transactions.filter(
    (tx) => tx.kind === "purchase" || tx.kind === "withdrawal" || tx.amount < 0,
  ).length;

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    if (filter === "deposit") {
      return tx.kind === "deposit" || tx.kind === "refund" || tx.amount > 0;
    }
    if (filter === "purchase") {
      return tx.kind === "purchase" || tx.kind === "withdrawal" || tx.amount < 0;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">{tr("آخر العمليات")}</h2>
        <span className="text-xs font-bold text-muted-foreground">
          {filteredTransactions.length} {filteredTransactions.length === 1 ? "عملية" : "عمليات"}
        </span>
      </div>

      <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            filter === "all"
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-muted/70 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{tr("الكل")}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
            {transactions.length}
          </span>
        </button>

        <button
          onClick={() => setFilter("deposit")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
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
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
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

      {filteredTransactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl bg-muted/20 border border-dashed border-border/60">
          <Receipt className="w-10 h-10 text-muted-foreground/40 mb-2" />
          <p className="font-bold text-sm text-muted-foreground">
            {filter === "deposit"
              ? "لا توجد عمليات إيداع حتى الآن"
              : filter === "purchase"
                ? "لا توجد عمليات شراء حتى الآن"
                : "لا توجد أي حركات في المحفظة بعد"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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

                    {/* Transaction Reference / ID for user & admin tracking */}
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

                      {formattedDate && (
                        <span className="text-[11px] text-muted-foreground">{formattedDate}</span>
                      )}
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
