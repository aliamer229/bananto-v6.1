import { useState } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, Search } from "lucide-react";
import { tr } from "@/i18n";

interface Transaction {
  id: string;
  kind: "deposit" | "withdrawal" | "purchase";
  amount: number;
  description: string;
  createdAt: string;
  status?: "completed" | "pending" | "rejected";
}

interface TransactionListProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

export function TransactionList({ transactions, isLoading }: TransactionListProps) {
  const [filter, setFilter] = useState("all");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">{tr("آخر العمليات")}</h2>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar">
        {["all", "deposit", "purchase"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${filter === f ? "bg-zinc-900 text-white" : "bg-muted text-muted-foreground"}`}
          >
            {tr(f === "all" ? "الكل" : f === "deposit" ? "إيداع" : "شراء")}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex justify-between items-center p-4 rounded-2xl bg-muted/20 border border-border"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.amount > 0 ? "bg-emerald-50" : "bg-rose-50"}`}
              >
                {tx.amount > 0 ? (
                  <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                ) : (
                  <ArrowUpRight className="w-5 h-5 text-rose-600" />
                )}
              </div>
              <div>
                <p className="font-bold text-sm">{tx.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(tx.createdAt).toLocaleDateString("ar-EG")}
                </p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <p
                className={`font-black text-sm ${tx.amount > 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {tx.amount > 0 ? "+" : ""}
                {tx.amount.toLocaleString("en-US")} {tr("IQD")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
