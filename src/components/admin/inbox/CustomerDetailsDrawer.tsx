import React from "react";
import {
  X,
  User,
  ShoppingBag,
  CreditCard,
  Calendar,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  MessageSquare,
  Copy,
  Check,
} from "lucide-react";
import { Thread, Order } from "@/lib/types";
import { toast } from "sonner";

interface CustomerDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread: Thread | null;
  orders?: Order[];
  onOpenOrder?: (orderId: string) => void;
}

export function CustomerDetailsDrawer({
  isOpen,
  onClose,
  thread,
  orders = [],
  onOpenOrder,
}: CustomerDetailsDrawerProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  if (!isOpen || !thread) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const customerOrders = orders.filter((o) => o.userId === thread.userId);
  const activeOrders = customerOrders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 left-0 max-w-full flex" dir="rtl">
        <div className="w-screen max-w-md bg-card border-r border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border border-primary/20">
                {thread.userName ? thread.userName.charAt(0).toUpperCase() : "U"}
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground line-clamp-1">
                  {thread.userName}
                </h2>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{thread.userId}</span>
                  <button
                    onClick={() => copyToClipboard(thread.userId, "معرف العميل")}
                    className="hover:text-foreground"
                    title="نسخ المعرف"
                  >
                    {copiedField === "معرف العميل" ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/30 border border-border rounded-xl">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                  <span>إجمالي الطلبات</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {customerOrders.length}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({activeOrders.length} نشط)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-muted/30 border border-border rounded-xl">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                  <span>تاريخ المحادثة</span>
                </div>
                <div className="text-xs font-semibold text-foreground pt-1">
                  {new Date(thread.createdAt).toLocaleDateString("ar-IQ", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>

            {/* Current Thread Context */}
            <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2">
              <div className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>معلومات التذكرة الحالية</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    thread.status === "open"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {thread.status === "open" ? "مفتوحة" : "مغلقة"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">الموضوع: </span>
                {thread.subject}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">الوضع: </span>
                <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                  {thread.mode || "AI_ACTIVE"}
                </span>
              </div>
              {thread.orderId && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">الطلب المرتبط: </span>
                  <span className="font-mono text-primary font-bold">{thread.orderId}</span>
                </div>
              )}
            </div>

            {/* Orders History */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  سجل طلبات العميل
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {customerOrders.length} طلبات
                </span>
              </div>

              {customerOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
                  لا توجد طلبات مسجلة لهذا العميل
                </div>
              ) : (
                <div className="space-y-2">
                  {customerOrders.map((order) => {
                    const isCurrent = order.id === thread.orderId;
                    return (
                      <div
                        key={order.id}
                        onClick={() => onOpenOrder && onOpenOrder(order.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isCurrent
                            ? "bg-primary/5 border-primary/40 shadow-2xs"
                            : "bg-muted/20 border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              #{order.code || order.id.slice(-6)}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-primary text-primary-foreground font-bold">
                                المحادثة الحالية
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              order.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : order.status === "processing"
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-blue-500/10 text-blue-600"
                            }`}
                          >
                            {order.status === "completed"
                              ? "تم التسليم"
                              : order.status === "processing"
                                ? "قيد التجهيز"
                                : order.status === "pending"
                                  ? "معلق"
                                  : order.status}
                          </span>
                        </div>

                        <div className="text-xs text-muted-foreground line-clamp-1 mb-1">
                          {order.items?.map((i) => i.title).join(", ") || "منتجات رقمية"}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                          <span>{(order.total || 0).toLocaleString()} د.ع</span>
                          <span>{new Date(order.createdAt).toLocaleDateString("ar-IQ")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border bg-muted/20 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-card border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
