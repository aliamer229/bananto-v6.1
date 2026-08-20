import { Coins } from "lucide-react";
import { tr } from "@/i18n";
import { useCurrency } from "@/context/CurrencyContext";

interface BalanceCardProps {
  balance: number;
  reserved?: number;
}

export function BalanceCard({ balance, reserved = 0 }: BalanceCardProps) {
  const { formatIQDPrice } = useCurrency();

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-black rounded-[2rem] p-6 text-white shadow-lg border border-white/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Coins className="w-32 h-32" />
      </div>
      <p className="text-zinc-400 font-bold text-sm mb-2">{tr("Available balance")}</p>
      <div
        className="text-3xl sm:text-4xl font-black tracking-tight mb-4 flex items-center gap-2"
        dir="ltr"
      >
        <span className="text-emerald-400">{formatIQDPrice(balance)}</span>
      </div>

      {reserved > 0 && (
        <div className="text-zinc-400 text-xs font-bold border-t border-white/10 pt-4 mt-2">
          {tr("الرصيد المحجوز")}: {formatIQDPrice(reserved)}
        </div>
      )}
    </div>
  );
}
