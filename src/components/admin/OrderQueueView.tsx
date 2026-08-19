import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  User,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";

interface QueueItem {
  id: string;
  order_id: string;
  status: "waiting" | "processing" | "completed";
  assigned_staff_id?: string;
  created_at: string;
  updated_at: string;
  orderCode?: string;
  userName?: string;
}

export default function OrderQueueView() {
  const queryClient = useQueryClient();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["order-queue"],
    queryFn: async () => {
      const res = await fetch("/api/public/order-queue", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json() as Promise<QueueItem[]>;
    },
    refetchInterval: 10000, // Poll every 10s
  });

  const claimMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "claim" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to claim");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-queue"] });
      toast.success("تم استلام الطلب بنجاح");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "complete" }),
      });
      if (!res.ok) throw new Error("Failed to complete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-queue"] });
      toast.success("تم إكمال الطلب بنجاح");
    },
  });

  if (isLoading) return <div className="p-8 text-center">جاري التحميل...</div>;

  const waiting = queue?.filter((i) => i.status === "waiting") || [];
  const processing = queue?.filter((i) => i.status === "processing") || [];

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 overflow-y-auto max-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="text-blue-500" />
            طابور تسليم الطلبات الرقمية
          </h1>
          <p className="text-muted-foreground mt-1">إدارة وتسليم الحسابات والأكواد للعملاء</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-lg flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span>{waiting.length} في الانتظار</span>
          </div>
          <div className="bg-amber-500/10 text-amber-500 px-4 py-2 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{processing.length} قيد التنفيذ</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Waiting List */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 px-1">
            <Timer className="w-5 h-5 text-blue-500" />
            طلبات جديدة (انتظار)
          </h2>
          <div className="space-y-3">
            {waiting.length === 0 ? (
              <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground">
                لا توجد طلبات في الانتظار حالياً
              </div>
            ) : (
              waiting.map((item) => (
                <div
                  key={item.id}
                  className="bg-card border rounded-xl p-4 flex items-center justify-between hover:border-blue-500/50 transition-colors shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-lg">
                      طلب #{item.orderCode || item.order_id.slice(-6)}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <User className="w-3 h-3" />
                      {item.userName || "عميل"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => claimMutation.mutate(item.order_id)}
                      disabled={claimMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      استلام الطلب
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Processing List */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 px-1">
            <Clock className="w-5 h-5 text-amber-500" />
            طلبات قيد التنفيذ (خاصتك)
          </h2>
          <div className="space-y-3">
            {processing.length === 0 ? (
              <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground">
                لا توجد طلبات قيد التنفيذ حالياً
              </div>
            ) : (
              processing.map((item) => (
                <div
                  key={item.id}
                  className="bg-card border border-amber-500/30 rounded-xl p-4 space-y-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-bold text-lg">
                        طلب #{item.orderCode || item.order_id.slice(-6)}
                      </div>
                      <div className="text-sm text-muted-foreground">{item.userName}</div>
                    </div>
                    <div className="bg-amber-500/10 text-amber-500 text-xs px-2 py-1 rounded-full border border-amber-500/20">
                      جاري المعالجة
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(`/chat/${item.order_id}`, "_blank")}
                      className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      فتح المحادثة
                    </button>
                    <button
                      onClick={() => completeMutation.mutate(item.order_id)}
                      disabled={completeMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      إكمال التسليم
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
