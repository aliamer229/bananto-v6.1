import { Coins } from "lucide-react";
import { tr } from "@/i18n";

interface BalanceCardProps {
  balance: number;
  reserved?: number;
}

export function BalanceCard({ balance, reserved = 0 }: BalanceCardProps) {
  return (
    <div className="bg-gradient-to-br from-zinc-900 to-black rounded-[2rem] p-6 text-white shadow-lg border border-white/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Coins className="w-32 h-32" />
      </div>
      <p className="text-zinc-400 font-bold text-sm mb-1">{tr("Available balance")}</p>
      <div className="text-4xl font-black tracking-tight mb-4 flex items-center gap-1.5">
        <span>{balance.toLocaleString("en-US")}</span>
        <span className="text-xl text-emerald-500 font-bold">{tr("IQD")}</span>
      </div>

      {reserved > 0 && (
        <div className="text-zinc-500 text-xs font-bold border-t border-white/10 pt-4 mt-2">
          {tr("الرصيد المحجوز")}: {reserved.toLocaleString("en-US")} د.ع
        </div>
      )}
    </div>
  );
}
