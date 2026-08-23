import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Order } from "@/lib/types";
import OrderCard from "./OrderCard";
import { tr } from "@/i18n";
import { ShoppingBag } from "lucide-react";
import { Link } from "@tanstack/react-router";

type FilterType = "all" | "active" | "completed";

export default function OrderList({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "active")
      return ["pending", "processing", "delivering", "awaiting_customer_confirmation"].includes(
        order.status,
      );
    if (filter === "completed") return order.status === "completed";
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 bg-card animate-pulse rounded-[2rem] border border-border/40"
          />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 px-6 text-center"
      >
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 opacity-20">
          <ShoppingBag className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-black text-foreground mb-2">{tr("لا توجد طلبات")}</h3>
        <p className="text-sm text-muted-foreground mb-8 max-w-xs">
          {tr("عندما تقوم بشراء ألعاب أو حسابات، ستظهر طلباتك هنا لتتمكن من متابعتها.")}
        </p>
        <Link
          to="/"
          className="bg-[var(--brand-red)] text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
        >
          {tr("ابدأ التسوق")}
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-1">
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${
              filter === f
                ? "bg-foreground text-background shadow-md scale-105"
                : "bg-card border border-border text-muted-foreground hover:border-foreground/20"
            }`}
          >
            {f === "all" ? tr("الكل") : f === "active" ? tr("قيد التنفيذ") : tr("المكتملة")}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-10 text-sm text-muted-foreground font-bold"
            >
              {tr("لا توجد نتائج لهذا الفلتر")}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
