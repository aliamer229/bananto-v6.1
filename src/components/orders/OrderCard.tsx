import { motion } from "framer-motion";
import {
  ChevronLeft,
  MessageCircle,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Order } from "@/lib/types";
import { tr } from "@/i18n";

interface StatusInfo {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
}

const statusConfig: Record<string, StatusInfo> = {
  pending: {
    label: "قيد الانتظار",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  processing: {
    label: "قيد المعالجة",
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  delivering: {
    label: "قيد التسليم",
    icon: Truck,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  completed: {
    label: "مكتمل",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  cancelled: {
    label: "ملغي",
    icon: XCircle,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
  },
};

function getAutoDeleteNotice(order: Order): string | null {
  if (order.status !== "cancelled") return null;
  const cancelledTimeStr = order.cancelledAt || order.updatedAt || order.createdAt;
  const cancelledTime = new Date(cancelledTimeStr).getTime();
  const elapsedDays = (Date.now() - cancelledTime) / (1000 * 60 * 60 * 24);
  const remainingDays = Math.max(0, Math.ceil(7 - elapsedDays));
  if (remainingDays > 1) {
    return `حذف نهائي بعد ${remainingDays} أيام`;
  } else if (remainingDays === 1) {
    return `حذف نهائي خلال 24 ساعة`;
  } else {
    return `حذف نهائي قريباً`;
  }
}

export default function OrderCard({ order }: { order: Order }) {
  const status: StatusInfo = statusConfig[order.status] ?? statusConfig["pending"]!;
  const StatusIcon = status.icon;
  const autoDeleteNotice = getAutoDeleteNotice(order);

  const isDigital = order.items.every((item) =>
    ["account", "offline_account", "online_account", "bundle", "preorder", "digital_code"].includes(
      item.kind,
    ),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <Link
        to="/chat"
        search={{ initialOrderId: order.id }}
        className="block bg-card border border-border/60 rounded-[2rem] p-5 shadow-sm hover:shadow-md transition-all group"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${status.bgColor} ${status.color}`}>
              <StatusIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-0.5 uppercase tracking-wider">
                {order.code}
              </p>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-black ${status.color}`}>{tr(status.label)}</p>
                {autoDeleteNotice && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{autoDeleteNotice}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-widest">
              {new Date(order.createdAt).toLocaleDateString("ar-IQ")}
            </p>
            {isDigital ? (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                <Zap className="w-3 h-3" /> {tr("تسليم فوري")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                <Truck className="w-3 h-3" /> {tr("توصيل")}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {order.items.map((item, idx) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground font-bold truncate max-w-[70%]">
                {item.quantity > 1 ? `${item.quantity}x ` : ""}
                {item.title}
              </span>
              {idx === 0 && order.items.length > 1 && (
                <span className="text-[10px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded-lg">
                  +{order.items.length - 1} {tr("عناصر أخرى")}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/40">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-muted group-hover:bg-[var(--brand-red)]/10 group-hover:text-[var(--brand-red)] transition-colors">
              <MessageCircle className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">
              {tr("محادثة الطلب والدعم")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-black text-foreground">
              {order.total.toLocaleString()}
            </span>
            <span className="text-[10px] font-black text-muted-foreground uppercase">
              {order.currency === "IQD" ? "د.ع" : order.currency}
            </span>
            <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:translate-x-[-2px] transition-transform ml-1" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
