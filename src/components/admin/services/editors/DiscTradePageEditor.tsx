import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  Sparkles,
  Search,
  ListOrdered,
  HelpCircle,
  Eye,
  Sliders,
  ShieldCheck,
  ArrowLeftRight,
  FileText,
  RotateCcw,
  Camera,
  Layers,
} from "lucide-react";
import { useI18n } from "@/i18n";
import type { DiscTradeData, ServiceStep, ServiceFeature, StatusContent } from "@/lib/content";
import { DEFAULT_CONTENT } from "@/lib/content";
import TradeRulesManager from "../TradeRulesManager";

export function DiscTradePageEditor() {
  const t = useI18n((s) => s.t);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    | "hero"
    | "search_copy"
    | "condition_photos"
    | "steps"
    | "statuses"
    | "offer_success"
    | "visibility"
  >("hero");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { data: contentData, isLoading } = useQuery({
    queryKey: ["admin_content"],
    queryFn: async () => {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("Failed to load content");
      return res.json();
    },
  });

  const [config, setConfig] = useState<DiscTradeData>(DEFAULT_CONTENT.discTrade);

  React.useEffect(() => {
    if (contentData?.discTrade) {
      setConfig({
        ...DEFAULT_CONTENT.discTrade,
        ...contentData.discTrade,
      });
    }
  }, [contentData]);

  const saveMutation = useMutation({
    mutationFn: async (updated: DiscTradeData) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discTrade: updated }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_content"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const update = <K extends keyof DiscTradeData>(field: K, val: DiscTradeData[K]) => {
    setConfig((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    setError("");
    saveMutation.mutate(config);
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        t("هل أنت متأكد من استعادة الإعدادات والنصوص الافتراضية لصفحة المقايضة والاستبدال؟"),
      )
    ) {
      setConfig(DEFAULT_CONTENT.discTrade);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ArrowLeftRight className="w-6 h-6 text-primary" />
              {t("إعدادات وتخصيص صفحة استبدال الأقراص (/disc_trade)")}
            </h2>
            <label className="flex items-center gap-2 cursor-pointer bg-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
              <input
                type="checkbox"
                checked={config.enabled !== false}
                onChange={(e) => update("enabled", e.target.checked)}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className={config.enabled !== false ? "text-emerald-500" : "text-rose-500"}>
                {config.enabled !== false ? t("الصفحة مفعلة") : t("الصفحة معطلة")}
              </span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "تحكم بجميع النصوص، الشروط، متطلبات الصور، خطوات المعاينة، رسائل الحالات والظهور بدون تعديل الكود.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted border border-border rounded-xl transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("استعادة الافتراضي")}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
            }`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? t("تم الحفظ بنجاح") : t("حفظ التغييرات")}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 p-4 rounded-xl border border-rose-200 dark:border-rose-500/20 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: "hero", label: t("الواجهة والترويسة (Hero)"), icon: Sparkles },
          { id: "search_copy", label: t("البحث والكتالوج"), icon: Search },
          { id: "condition_photos", label: t("الحالة والصور والرفع"), icon: Camera },
          { id: "steps", label: t("كيف تتم العملية؟"), icon: ListOrdered },
          { id: "statuses", label: t("رسائل الحالات للمستخدم"), icon: HelpCircle },
          { id: "offer_success", label: t("العرض والسياسة والنجاح"), icon: FileText },
          { id: "visibility", label: t("ظهور الأقسام"), icon: Eye },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: Hero & Trust */}
      {activeTab === "hero" && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {t("النصوص الترويجية للترويسة (Hero Section)")}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1.5">
                  {t("شارة الترويسة (Badge)")}
                </label>
                <input
                  type="text"
                  value={config.hero_badge_ar || ""}
                  onChange={(e) => update("hero_badge_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                  placeholder="خدمة المقايضة"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5">{t("العنوان الرئيسي")}</label>
                <input
                  type="text"
                  value={config.hero_title_ar || ""}
                  onChange={(e) => update("hero_title_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                  placeholder="استبدل ألعابك القديمة برصيد متجر أو لعبة جديدة"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold mb-1.5">{t("الوصف التوضيحي")}</label>
                <textarea
                  value={config.hero_subtitle_ar || ""}
                  onChange={(e) => update("hero_subtitle_ar", e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none resize-none"
                  placeholder="تقييم فوري وعادل لألعابك المستعملة مع مكافأة رصيد متجر..."
                />
              </div>
            </div>
          </div>

          {/* Trust points */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                {t("نقاط الثقة والضمان (Trust Chips)")}
              </h3>
              <button
                type="button"
                onClick={() => {
                  const newItems: ServiceFeature[] = [
                    ...(config.trust_items || []),
                    { id: "t-" + Date.now(), label_ar: "نقطة ثقة جديدة" },
                  ];
                  update("trust_items", newItems);
                }}
                className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("إضافة نقطة")}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(config.trust_items || []).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center gap-2 bg-background border border-border rounded-xl p-2.5"
                >
                  <input
                    type="text"
                    value={item.label_ar || ""}
                    onChange={(e) => {
                      const updated = (config.trust_items || []).map((it, i) =>
                        i === idx ? { ...it, label_ar: e.target.value } : it,
                      );
                      update("trust_items", updated);
                    }}
                    className="flex-1 bg-transparent text-xs font-bold outline-none"
                    placeholder="نص النقطة..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (config.trust_items || []).filter((_, i) => i !== idx);
                      update("trust_items", updated);
                    }}
                    className="text-muted-foreground hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Search & Copy */}
      {activeTab === "search_copy" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <h3 className="font-bold text-base text-foreground flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            {t("نصوص البحث واختيار اللعبة")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان البحث عن اللعبة")}</label>
              <input
                type="text"
                value={config.search_title_ar || ""}
                onChange={(e) => update("search_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">
                {t("نص التلميح في البحث (Placeholder)")}
              </label>
              <input
                type="text"
                value={config.search_placeholder_ar || ""}
                onChange={(e) => update("search_placeholder_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">
                {t("بطاقة الإدخال اليدوي عند عدم وجود اللعبة في الكتالوج")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان غير موجودة")}</label>
              <input
                type="text"
                value={config.no_game_title_ar || ""}
                onChange={(e) => update("no_game_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("نص زر الإدخال اليدوي")}</label>
              <input
                type="text"
                value={config.manual_entry_title_ar || ""}
                onChange={(e) => update("manual_entry_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1.5">{t("وصف غير موجودة")}</label>
              <textarea
                value={config.no_game_description_ar || ""}
                onChange={(e) => update("no_game_description_ar", e.target.value)}
                rows={2}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Condition & Photos */}
      {activeTab === "condition_photos" && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              {t("نصوص تقييم حالة الشريط والملحقات")}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1.5">{t("عنوان خطوة الحالة")}</label>
                <input
                  type="text"
                  value={config.condition_title_ar || ""}
                  onChange={(e) => update("condition_title_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5">{t("وصف خطوة الحالة")}</label>
                <input
                  type="text"
                  value={config.condition_description_ar || ""}
                  onChange={(e) => update("condition_description_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                />
              </div>
            </div>
          </div>

          {/* Embedded Condition Percentages & Rules Engine Manager */}
          <TradeRulesManager embedded />

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              {t("إعدادات رفع صور الأقراص")}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1.5">{t("عنوان خطوة الصور")}</label>
                <input
                  type="text"
                  value={config.photos_title_ar || ""}
                  onChange={(e) => update("photos_title_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5">
                  {t("الحد الأقصى لعدد الصور")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.photos_max || 5}
                  onChange={(e) => update("photos_max", Number(e.target.value) || 5)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold mb-1.5">
                  {t("وصف خطوة الصور وتوجيهات التصوير")}
                </label>
                <textarea
                  value={config.photos_description_ar || ""}
                  onChange={(e) => update("photos_description_ar", e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none resize-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.photos_required !== false}
                    onChange={(e) => update("photos_required", e.target.checked)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-xs font-bold text-foreground">
                    {t("الصور إلزامية قبل إرسال الطلب (ينصح بتركها مفعلة لضمان دقة المعاينة)")}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Steps */}
      {activeTab === "steps" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-primary" />
                {t("خطوات قسم (كيف تتم عملية الاستبدال؟)")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("قم بإضافة أو تعديل خطوات الشرح التوضيحي للعميل.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const steps = [
                  ...(config.steps || []),
                  {
                    id: "step-" + Date.now(),
                    step_number: (config.steps?.length || 0) + 1,
                    title_ar: "خطوة جديدة",
                    description_ar: "تفاصيل الخطوة...",
                    sort_order: (config.steps?.length || 0) + 1,
                  },
                ];
                update("steps", steps);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t("إضافة خطوة")}
            </button>
          </div>

          <div className="space-y-3">
            {(config.steps || []).map((step, idx) => (
              <div
                key={step.id || idx}
                className="bg-background border border-border rounded-xl p-4 flex flex-col md:flex-row items-start gap-4"
              >
                <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary/10 text-primary font-black text-sm shrink-0">
                  {idx + 1}
                </span>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {t("عنوان الخطوة")}
                    </label>
                    <input
                      type="text"
                      value={step.title_ar || ""}
                      onChange={(e) => {
                        const updated = (config.steps || []).map((s, i) =>
                          i === idx ? { ...s, title_ar: e.target.value } : s,
                        );
                        update("steps", updated);
                      }}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {t("شرح الخطوة")}
                    </label>
                    <input
                      type="text"
                      value={step.description_ar || ""}
                      onChange={(e) => {
                        const updated = (config.steps || []).map((s, i) =>
                          i === idx ? { ...s, description_ar: e.target.value } : s,
                        );
                        update("steps", updated);
                      }}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const updated = (config.steps || []).filter((_, i) => i !== idx);
                    update("steps", updated);
                  }}
                  className="text-muted-foreground hover:text-rose-500 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Statuses Content */}
      {activeTab === "statuses" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <div>
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              {t("رسائل وعناوين الحالات الظاهرة للعميل")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "خصص العنوان والشرح التوضيحي الذي يظهر للعميل في خطه الزمني وسجله لكل حالة مقايضة.",
              )}
            </p>
          </div>

          <div className="space-y-4">
            {[
              { status: "waiting_review", label: "بانتظار المراجعة المبدئية" },
              { status: "waiting_shipment", label: "بانتظار تسليم / شحن القرص" },
              { status: "received", label: "تم استلام القرص في المقر" },
              { status: "inspecting", label: "جارٍ الفحص الفني للقرص" },
              { status: "approved", label: "تمت الموافقة وإيداع الرصيد" },
              { status: "completed", label: "مكتمل بنجاح" },
              { status: "rejected", label: "مرفوض بعد الفحص" },
              { status: "cancelled", label: "تم الإلغاء" },
            ].map(({ status, label }) => {
              const item = (config.status_content || []).find((s) => s.status === status) || {
                status,
                title_ar: label,
                description_ar: "",
              };

              return (
                <div
                  key={status}
                  className="bg-background border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  <div className="md:col-span-3">
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground block mb-1">
                      {status}
                    </span>
                    <span className="font-bold text-xs text-foreground">{label}</span>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {t("العنوان الظاهر")}
                    </label>
                    <input
                      type="text"
                      value={item.title_ar || ""}
                      onChange={(e) => {
                        const next = [...(config.status_content || [])];
                        const idx = next.findIndex((s) => s.status === status);
                        if (idx >= 0) {
                          next[idx] = { ...next[idx], title_ar: e.target.value };
                        } else {
                          next.push({ status, title_ar: e.target.value });
                        }
                        update("status_content", next);
                      }}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                    />
                  </div>

                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {t("النص التوضيحي")}
                    </label>
                    <input
                      type="text"
                      value={item.description_ar || ""}
                      onChange={(e) => {
                        const next = [...(config.status_content || [])];
                        const idx = next.findIndex((s) => s.status === status);
                        if (idx >= 0) {
                          next[idx] = { ...next[idx], description_ar: e.target.value };
                        } else {
                          next.push({ status, description_ar: e.target.value });
                        }
                        update("status_content", next);
                      }}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Offer, Success & History */}
      {activeTab === "offer_success" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <h3 className="font-bold text-base text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t("نصوص العرض النهائي، شروط الإقرار، النجاح، والسجل")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان خطوة العرض")}</label>
              <input
                type="text"
                value={config.offer_title_ar || ""}
                onChange={(e) => update("offer_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("نص زر إرسال الطلب")}</label>
              <input
                type="text"
                value={config.submit_button_ar || ""}
                onChange={(e) => update("submit_button_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1.5">{t("تنبيه التقييم المبدئي")}</label>
              <input
                type="text"
                value={config.valuation_notice_ar || ""}
                onChange={(e) => update("valuation_notice_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1.5">
                {t("نص مربع الإقرار والموافقة على الشروط")}
              </label>
              <input
                type="text"
                value={config.policy_checkbox_ar || ""}
                onChange={(e) => update("policy_checkbox_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-foreground mb-2">
                {t("شاشة النجاح بعد الإرسال")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان النجاح")}</label>
              <input
                type="text"
                value={config.success_title_ar || ""}
                onChange={(e) => update("success_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("وصف النجاح")}</label>
              <input
                type="text"
                value={config.success_description_ar || ""}
                onChange={(e) => update("success_description_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-foreground mb-2">
                {t("قسم سجل المقايضات (History)")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان السجل")}</label>
              <input
                type="text"
                value={config.history_title_ar || ""}
                onChange={(e) => update("history_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان الحالة الفارغة")}</label>
              <input
                type="text"
                value={config.history_empty_title_ar || ""}
                onChange={(e) => update("history_empty_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1.5">{t("وصف الحالة الفارغة")}</label>
              <input
                type="text"
                value={config.history_empty_description_ar || ""}
                onChange={(e) => update("history_empty_description_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Visibility */}
      {activeTab === "visibility" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 animate-in fade-in">
          <h3 className="font-bold text-base text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            {t("التحكم بظهور الأقسام في واجهة الصفحة")}
          </h3>

          <div className="space-y-3">
            {[
              { key: "hero", label: "قسم الترويسة والترحيب (Hero)" },
              { key: "steps", label: "قسم (كيف تتم عملية الاستبدال؟)" },
              { key: "history", label: "سجل مقايضات العميل السابقة" },
            ].map(({ key, label }) => {
              const isVis = config.section_visibility?.[key] !== false;
              return (
                <label
                  key={key}
                  className="flex items-center justify-between p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <span className="font-bold text-sm text-foreground">{label}</span>
                  <input
                    type="checkbox"
                    checked={isVis}
                    onChange={(e) => {
                      update("section_visibility", {
                        ...config.section_visibility,
                        [key]: e.target.checked,
                      });
                    }}
                    className="w-4 h-4 accent-primary rounded"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
