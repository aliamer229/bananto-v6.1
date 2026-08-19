import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Settings2,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
  Info,
  Sliders,
} from "lucide-react";
import { api } from "@/lib/api";
import { AdminAvailabilityConfig, AdminAvailabilityStatus } from "@/lib/types";
import { DAYS_MAP } from "@/lib/admin-availability";
import { toast } from "sonner";

const DAYS_LIST: { id: number; name: string }[] = [
  { id: 0, name: "الأحد" },
  { id: 1, name: "الإثنين" },
  { id: 2, name: "الثلاثاء" },
  { id: 3, name: "الأربعاء" },
  { id: 4, name: "الخميس" },
  { id: 5, name: "الجمعة" },
  { id: 6, name: "السبت" },
];

export function AdminAvailabilityBar() {
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Fetch admin availability & config
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-availability"],
    queryFn: async () => {
      const res = await api.getAdminAvailability();
      return res;
    },
    refetchInterval: 15000,
  });

  const availability: AdminAvailabilityStatus = data?.availability || {
    isAvailable: true,
    status: "schedule",
    currentBaghdadTime: "00:00",
    workingHoursText: "09:00 ص - 11:00 م بتوقيت بغداد",
    offlineMessage: "",
  };

  const config: AdminAvailabilityConfig = data?.config || {
    mode: "schedule",
    startHour: 9,
    endHour: 23,
    workDays: [0, 1, 2, 3, 4, 5, 6],
    timezone: "Asia/Baghdad",
  };

  // State for draft config in modal
  const [draftConfig, setDraftConfig] = useState<AdminAvailabilityConfig>(config);

  // Update draft whenever modal opens or fresh config arrives
  const handleOpenModal = () => {
    if (data?.config) {
      setDraftConfig(data.config);
    }
    setShowConfigModal(true);
  };

  // Mutation to save config
  const mutation = useMutation({
    mutationFn: async (newConfig: Partial<AdminAvailabilityConfig>) => {
      return await api.setAdminAvailability(newConfig);
    },
    onSuccess: (res) => {
      queryClient.setQueryData(["admin-availability"], res);
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
      queryClient.invalidateQueries({ queryKey: ["store"] });
      toast.success("تم تحديث حالة وساعات عمل الإدارة بنجاح");
    },
    onError: () => {
      toast.error("فشل حفظ إعدادات حالة الإدارة");
    },
  });

  const handleQuickModeChange = (mode: "available" | "unavailable" | "schedule") => {
    mutation.mutate({ mode });
  };

  const handleSaveModal = () => {
    mutation.mutate(draftConfig);
    setShowConfigModal(false);
  };

  const toggleDay = (dayId: number) => {
    const currentDays = draftConfig.workDays || [];
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter((d) => d !== dayId)
      : [...currentDays, dayId].sort();
    setDraftConfig({ ...draftConfig, workDays: newDays });
  };

  return (
    <>
      <div className="w-full bg-card/90 backdrop-blur-md border-b border-border/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs transition-colors">
        {/* Status Indicator & Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] border shrink-0 transition-all ${
              availability.isAvailable
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                availability.isAvailable ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span>{availability.isAvailable ? "متاح للرد الآن" : "غير متاح للرد"}</span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] truncate">
            <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/80" />
            <span className="truncate">
              توقيت بغداد:{" "}
              <strong className="text-foreground">{availability.currentBaghdadTime}</strong>
              <span className="mx-1.5 opacity-40">|</span>
              {availability.status === "schedule" ? (
                <span>الجدول: {availability.workingHoursText}</span>
              ) : availability.status === "available" ? (
                <span className="text-emerald-600 font-semibold">تثبيت متاح يدوياً</span>
              ) : (
                <span className="text-rose-600 font-semibold">تثبيت غير متاح يدوياً</span>
              )}
            </span>
          </div>
        </div>

        {/* Quick Actions & Settings Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex bg-muted/70 p-0.5 rounded-lg border border-border/40">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickModeChange("available")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                config.mode === "available"
                  ? "bg-card text-emerald-600 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="تفعيل وضع متاح دائماً يدوياً"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>متاح</span>
            </button>

            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickModeChange("unavailable")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                config.mode === "unavailable"
                  ? "bg-card text-rose-600 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="تفعيل وضع غير متاح دائماً يدوياً"
            >
              <XCircle className="w-3 h-3" />
              <span>غير متاح</span>
            </button>

            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickModeChange("schedule")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                config.mode === "schedule"
                  ? "bg-card text-primary shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="اتباع جدول ساعات العمل بتوقيت بغداد تلقائياً"
            >
              <Calendar className="w-3 h-3" />
              <span>الجدول التلقائي</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenModal}
            className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg border border-border/40 transition-colors"
            title="تعديل ساعات العمل ورسالة عدم التواجد"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          dir="rtl"
        >
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">إعدادات توفر الإدارة وساعات العمل</h3>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    ضبط توقيت دوام المشرفين وتوجيه طلبات الدعم تلقائياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
              >
                ✕
              </button>
            </div>

            {/* Current Status Preview */}
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  الوقت الحالي بتوقيت بغداد:
                </span>
                <span className="font-bold text-foreground font-mono bg-card px-2 py-0.5 rounded-md border border-border/50">
                  {availability.currentBaghdadTime} (Asia/Baghdad)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">الحالة المحسوبة الآن:</span>
                <span
                  className={`font-bold ${
                    availability.isAvailable ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {availability.isAvailable ? "🟢 متاح للرد" : "🔴 غير متاح حالياً"}
                </span>
              </div>
            </div>

            {/* Availability Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">وضع التوفر العام:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDraftConfig({ ...draftConfig, mode: "schedule" })}
                  className={`p-2.5 rounded-xl border text-right transition-all ${
                    draftConfig.mode === "schedule"
                      ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs"
                      : "bg-card border-border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-bold mb-0.5">📅 مجدول تلقائياً</div>
                  <div className="text-[10px] opacity-80">حسب ساعات وأيام العمل</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDraftConfig({ ...draftConfig, mode: "available" })}
                  className={`p-2.5 rounded-xl border text-right transition-all ${
                    draftConfig.mode === "available"
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 font-bold shadow-2xs"
                      : "bg-card border-border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-bold mb-0.5">🟢 متاح دائماً</div>
                  <div className="text-[10px] opacity-80">تجاوز الجدول وتفعيل الآن</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDraftConfig({ ...draftConfig, mode: "unavailable" })}
                  className={`p-2.5 rounded-xl border text-right transition-all ${
                    draftConfig.mode === "unavailable"
                      ? "bg-rose-500/10 border-rose-500 text-rose-600 font-bold shadow-2xs"
                      : "bg-card border-border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-bold mb-0.5">🔴 غير متاح دائماً</div>
                  <div className="text-[10px] opacity-80">إغلاق استقبال الاستفسارات</div>
                </button>
              </div>
            </div>

            {/* Working Hours */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">
                ساعات العمل اليومية (بتوقيت بغداد GMT+3):
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1">
                    بداية الدوام:
                  </span>
                  <select
                    value={draftConfig.startHour ?? 9}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, startHour: Number(e.target.value) })
                    }
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 text-foreground font-semibold"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00 {i < 12 ? "صباحاً" : "مساءً"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1">
                    نهاية الدوام:
                  </span>
                  <select
                    value={draftConfig.endHour ?? 23}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, endHour: Number(e.target.value) })
                    }
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 text-foreground font-semibold"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00 {i < 12 ? "صباحاً" : "مساءً"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Working Days */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">أيام العمل الأسبوعية:</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_LIST.map((day) => {
                  const isSelected = draftConfig.workDays?.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                          : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {day.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Offline Message Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                رسالة الرد الآلي عند عدم توفر الإدارة (اختياري):
              </label>
              <textarea
                rows={3}
                value={draftConfig.offlineMessage || ""}
                placeholder="فريق الدعم البشري غير متاح حالياً. ساعات العمل: {hours}. يمكنك استخدام المساعد الآلي الآن أو العودة خلال أوقات الدوام."
                onChange={(e) => setDraftConfig({ ...draftConfig, offlineMessage: e.target.value })}
                className="w-full bg-card border border-border rounded-xl p-3 text-xs focus:ring-2 focus:ring-primary/20 text-foreground leading-relaxed placeholder:text-muted-foreground/60"
              />
              <p className="text-[10px] text-muted-foreground">
                يمكنك استخدام المتغير <code className="bg-muted px-1 rounded">{"{hours}"}</code>{" "}
                ليتم استبداله بساعات العمل تلقائياً.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={handleSaveModal}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
              >
                {mutation.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
