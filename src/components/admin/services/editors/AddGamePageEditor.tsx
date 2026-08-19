import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  Settings,
  Sparkles,
  Search,
  ListOrdered,
  HelpCircle,
  Eye,
  Sliders,
  ShieldCheck,
  Gamepad2,
  FileText,
  RotateCcw,
} from "lucide-react";
import { useI18n } from "@/i18n";
import type {
  AddGameData,
  SelectOption,
  ServiceStep,
  ServiceFeature,
  StatusContent,
} from "@/lib/content";
import { DEFAULT_CONTENT } from "@/lib/content";

export function AddGamePageEditor() {
  const t = useI18n((s) => s.t);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "hero" | "search_copy" | "options" | "steps" | "statuses" | "review_success" | "visibility"
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

  const [config, setConfig] = useState<AddGameData>(DEFAULT_CONTENT.addGame);

  React.useEffect(() => {
    if (contentData?.addGame) {
      setConfig({
        ...DEFAULT_CONTENT.addGame,
        ...contentData.addGame,
      });
    }
  }, [contentData]);

  const saveMutation = useMutation({
    mutationFn: async (updated: AddGameData) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addGame: updated }),
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

  const update = <K extends keyof AddGameData>(field: K, val: AddGameData[K]) => {
    setConfig((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    setError("");
    saveMutation.mutate(config);
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(t("هل أنت متأكد من استعادة الإعدادات والنصوص الافتراضية لصفحة طلب اللعبة؟"))
    ) {
      setConfig(DEFAULT_CONTENT.addGame);
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
              <Gamepad2 className="w-6 h-6 text-primary" />
              {t("إعدادات وتخصيص صفحة طلب إضافة لعبة (/add_game)")}
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
              "تحكم بجميع النصوص، خيارات المنصات، النسخ، الخطوات، رسائل الحالات والظهور بدون تعديل الكود.",
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
          { id: "search_copy", label: t("البحث والنتائج"), icon: Search },
          { id: "options", label: t("خيارات النموذج (المنصات والنسخ)"), icon: Sliders },
          { id: "steps", label: t("كيف تعمل الخدمة؟"), icon: ListOrdered },
          { id: "statuses", label: t("رسائل الحالات للمستخدم"), icon: HelpCircle },
          { id: "review_success", label: t("المراجعة والنجاح والتسجيل"), icon: FileText },
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
                  placeholder="طلب خاص"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5">{t("العنوان الرئيسي")}</label>
                <input
                  type="text"
                  value={config.hero_title_ar || ""}
                  onChange={(e) => update("hero_title_ar", e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
                  placeholder="ما لقيت لعبتك؟ خلّها علينا 🎮"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold mb-1.5">{t("الوصف التوضيحي")}</label>
                <textarea
                  value={config.hero_subtitle_ar || ""}
                  onChange={(e) => update("hero_subtitle_ar", e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none resize-none"
                  placeholder="ابحث عن اللعبة أولاً..."
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
            {t("نصوص محرك البحث وحالات النتائج الأربعة")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان حقل البحث")}</label>
              <input
                type="text"
                value={config.search_title_ar || ""}
                onChange={(e) => update("search_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">
                {t("نص التلميح في حقل البحث (Placeholder)")}
              </label>
              <input
                type="text"
                value={config.search_placeholder_ar || ""}
                onChange={(e) => update("search_placeholder_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                {t("الحالة 1: عندما تكون اللعبة متوفرة في المتجر حالياً")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان التوفر")}</label>
              <input
                type="text"
                value={config.available_title_ar || ""}
                onChange={(e) => update("available_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("وصف التوفر")}</label>
              <input
                type="text"
                value={config.available_description_ar || ""}
                onChange={(e) => update("available_description_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-primary mb-2">
                {t("الحالة 2: عندما تكون اللعبة في الكتالوج ولكن غير معروضة للبيع")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">
                {t("عنوان التطابق مع الكتالوج")}
              </label>
              <input
                type="text"
                value={config.catalog_match_title_ar || ""}
                onChange={(e) => update("catalog_match_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">
                {t("وصف التطابق مع الكتالوج")}
              </label>
              <input
                type="text"
                value={config.catalog_match_description_ar || ""}
                onChange={(e) => update("catalog_match_description_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">
                {t("الحالة 3 و 4: عند عدم العثور على اللعبة أو طلب إدخال يدوي")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان غير موجودة")}</label>
              <input
                type="text"
                value={config.not_found_title_ar || ""}
                onChange={(e) => update("not_found_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("نص زر الإدخال اليدوي")}</label>
              <input
                type="text"
                value={config.manual_request_cta_ar || ""}
                onChange={(e) => update("manual_request_cta_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1.5">{t("وصف غير موجودة")}</label>
              <textarea
                value={config.not_found_description_ar || ""}
                onChange={(e) => update("not_found_description_ar", e.target.value)}
                rows={2}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Form Options */}
      {activeTab === "options" && (
        <div className="space-y-6 animate-in fade-in">
          <OptionsGroupEditor
            title={t("الأجهزة والمنصات (Platforms)")}
            description={t("الأجهزة التي يمكن للعميل الاختيار منها عند تقديم الطلب")}
            options={config.platforms || []}
            onChange={(opts) => update("platforms", opts)}
          />

          <OptionsGroupEditor
            title={t("النسخ المفضلة (Versions)")}
            description={t("خيارات النسخ (فيزيائية، رقمية، ديلوكس، إلخ)")}
            options={config.versions || []}
            onChange={(opts) => update("versions", opts)}
          />

          <OptionsGroupEditor
            title={t("المناطق والريجون (Regions)")}
            description={t("الريجون المفضل (أمريكي، أوروبي، ياباني، أي منطقة)")}
            options={config.regions || []}
            onChange={(opts) => update("regions", opts)}
          />

          <OptionsGroupEditor
            title={t("طرق التواصل (Contact Methods)")}
            description={t("خيارات قنوات التواصل لتحديث العميل")}
            options={config.contact_methods || []}
            onChange={(opts) => update("contact_methods", opts)}
          />

          <OptionsGroupEditor
            title={t("أنواع الطلب المسموحة (Request Types)")}
            description={t("نوع الطلب (لعبة، إكسسوار، جهاز، كود، إلخ)")}
            options={config.allowed_request_types || []}
            onChange={(opts) => update("allowed_request_types", opts)}
          />
        </div>
      )}

      {/* TAB CONTENT: How It Works */}
      {activeTab === "steps" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-primary" />
                {t("خطوات قسم (كيف تعمل الخدمة؟)")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("قم بإضافة أو تعديل خطوات شرح الخدمة الظاهرة للعميل.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const steps = [
                  ...(config.how_it_works || []),
                  {
                    id: "step-" + Date.now(),
                    step_number: (config.how_it_works?.length || 0) + 1,
                    title_ar: "خطوة جديدة",
                    description_ar: "تفاصيل الخطوة...",
                    sort_order: (config.how_it_works?.length || 0) + 1,
                  },
                ];
                update("how_it_works", steps);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t("إضافة خطوة")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان القسم الرئيسي")}</label>
              <input
                type="text"
                value={config.how_it_works_title_ar || ""}
                onChange={(e) => update("how_it_works_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {(config.how_it_works || []).map((step, idx) => (
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
                        const updated = (config.how_it_works || []).map((s, i) =>
                          i === idx ? { ...s, title_ar: e.target.value } : s,
                        );
                        update("how_it_works", updated);
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
                        const updated = (config.how_it_works || []).map((s, i) =>
                          i === idx ? { ...s, description_ar: e.target.value } : s,
                        );
                        update("how_it_works", updated);
                      }}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const updated = (config.how_it_works || []).filter((_, i) => i !== idx);
                    update("how_it_works", updated);
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
              {t("خصص العنوان والشرح التوضيحي الذي يظهر للعميل في خطه الزمني وسجله لكل حالة.")}
            </p>
          </div>

          <div className="space-y-4">
            {[
              { status: "submitted", label: "تم الإرسال / استلام الطلب" },
              { status: "under_review", label: "قيد المراجعة" },
              { status: "accepted", label: "تم قبول الطلب" },
              { status: "sourcing", label: "جارٍ البحث عن توفر" },
              { status: "available", label: "أصبحت متوفرة" },
              { status: "added", label: "تمت إضافتها للمتجر" },
              { status: "rejected", label: "تعذر التوفير" },
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

      {/* TAB CONTENT: Review, Success & History */}
      {activeTab === "review_success" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in">
          <h3 className="font-bold text-base text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t("نصوص المراجعة، رسالة النجاح، السجل وبوابة الدخول")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان خطوة المراجعة")}</label>
              <input
                type="text"
                value={config.review_title_ar || ""}
                onChange={(e) => update("review_title_ar", e.target.value)}
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
              <label className="block text-xs font-bold mb-1.5">
                {t("ملاحظة أمان وتأكيد أسفل الزر")}
              </label>
              <input
                type="text"
                value={config.footer_note_ar || ""}
                onChange={(e) => update("footer_note_ar", e.target.value)}
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
                {t("قسم سجل الطلبات (History)")}
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

            <div className="border-t border-border pt-4 md:col-span-2">
              <h4 className="text-xs font-bold text-foreground mb-2">
                {t("بوابة تسجيل الدخول للزوار")}
              </h4>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("عنوان تسجيل الدخول")}</label>
              <input
                type="text"
                value={config.login_gate_title_ar || ""}
                onChange={(e) => update("login_gate_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">{t("وصف تسجيل الدخول")}</label>
              <input
                type="text"
                value={config.login_gate_description_ar || ""}
                onChange={(e) => update("login_gate_description_ar", e.target.value)}
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
              { key: "search", label: "محرك البحث واستكشاف المتجر" },
              { key: "how_it_works", label: "قسم (كيف تعمل الخدمة؟)" },
              { key: "history", label: "سجل الطلبات السابقة للعميل" },
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

function OptionsGroupEditor({
  title,
  description,
  options,
  onChange,
}: {
  title: string;
  description: string;
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  const t = useI18n((s) => s.t);

  const addOption = () => {
    const next = [
      ...options,
      {
        value: "opt_" + Date.now(),
        label_ar: "خيار جديد",
        label_en: "New Option",
        active: true,
      },
    ];
    onChange(next);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-sm text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={addOption}
          className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("إضافة خيار")}
        </button>
      </div>

      <div className="space-y-2">
        {options.map((opt, idx) => (
          <div
            key={opt.value || idx}
            className="flex items-center gap-3 bg-background border border-border rounded-xl p-3"
          >
            <input
              type="checkbox"
              checked={opt.active !== false}
              onChange={(e) => {
                const next = options.map((o, i) =>
                  i === idx ? { ...o, active: e.target.checked } : o,
                );
                onChange(next);
              }}
              className="w-4 h-4 accent-primary rounded shrink-0"
              title="تفعيل/تعطيل"
            />

            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={opt.label_ar || ""}
                onChange={(e) => {
                  const next = options.map((o, i) =>
                    i === idx ? { ...o, label_ar: e.target.value } : o,
                  );
                  onChange(next);
                }}
                className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-primary"
                placeholder="الاسم بالعربية"
              />

              <input
                type="text"
                value={opt.value || ""}
                onChange={(e) => {
                  const next = options.map((o, i) =>
                    i === idx ? { ...o, value: e.target.value } : o,
                  );
                  onChange(next);
                }}
                className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary"
                placeholder="value_key"
              />

              <input
                type="text"
                value={opt.label_en || ""}
                onChange={(e) => {
                  const next = options.map((o, i) =>
                    i === idx ? { ...o, label_en: e.target.value } : o,
                  );
                  onChange(next);
                }}
                className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary hidden sm:block"
                placeholder="English label"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const next = options.filter((_, i) => i !== idx);
                onChange(next);
              }}
              className="text-muted-foreground hover:text-rose-500 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
