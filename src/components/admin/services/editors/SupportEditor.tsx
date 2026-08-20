import React, { useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Wrench,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Phone,
  Mail,
  Send,
  HelpCircle,
  Clock,
} from "lucide-react";
import { useI18n } from "@/i18n";
import type { SupportData, SupportService, SupportChannel } from "@/lib/content";
import ServiceImportModal from "../ServiceImportModal";
import { ImageUploadField } from "../../ImageUploadField";
import type {
  ContactParseResultData,
  ServiceParseResult,
  TroubleshootingItem,
} from "@/lib/servicesImport";

interface SupportEditorProps {
  support: SupportData;
  onChange: (support: SupportData) => void;
  kbArticles?: any[];
  onChangeKbArticles?: (articles: any[]) => void;
}

export function SupportEditor({
  support,
  onChange,
  kbArticles = [],
  onChangeKbArticles,
}: SupportEditorProps) {
  const t = useI18n((s) => s.t);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"problems" | "channels" | "general">("problems");
  const [expandedId, setExpandedId] = useState<string | null>(kbArticles[0]?.id || null);

  const updateField = (field: keyof SupportData, value: any) => {
    onChange({ ...support, [field]: value });
  };

  // --- KB Problems Management ---
  const addProblem = () => {
    const newId = `kb_admin_${Math.random().toString(36).slice(2, 8)}`;
    const newProblem = {
      id: newId,
      title: "",
      category: "مشاكل عامة",
      match: "",
      ask: "",
      steps: "",
      errorCodes: "",
      imageUrl: "",
    };
    if (onChangeKbArticles) {
      onChangeKbArticles([...(kbArticles || []), newProblem]);
    }
    setExpandedId(newId);
  };

  const updateProblem = (id: string, patch: any) => {
    if (!onChangeKbArticles) return;
    onChangeKbArticles(
      (kbArticles || []).map((art) => (art.id === id ? { ...art, ...patch } : art)),
    );
  };

  const removeProblem = (id: string) => {
    if (!onChangeKbArticles) return;
    onChangeKbArticles((kbArticles || []).filter((art) => art.id !== id));
  };

  // --- Contact / Channels Import Handler ---
  const handleContactImport = (result: ServiceParseResult<ContactParseResultData>) => {
    const d = result.data;
    if (!d) return;
    const pick = (next: string | undefined, current: any) =>
      next && next.trim() ? next : current || "";

    onChange({
      ...support,
      hero_title_ar: pick(d.hero_title_ar, support.hero_title_ar),
      hero_title_en: pick(d.hero_title_en, support.hero_title_en),
      hero_subtitle_ar: pick(d.hero_subtitle_ar, support.hero_subtitle_ar),
      hero_subtitle_en: pick(d.hero_subtitle_en, support.hero_subtitle_en),
      support_intro_ar: pick(d.support_intro_ar, support.support_intro_ar),
      support_intro_en: pick(d.support_intro_en, support.support_intro_en),
      email: pick(d.email, support.email),
      phone: pick(d.phone, support.phone),
      whatsapp: pick(d.whatsapp, support.whatsapp),
      telegram: pick(d.telegram, support.telegram),
      chat_link: pick(d.chat_link, support.chat_link),
      status_message_ar: pick(d.status_message_ar, support.status_message_ar),
      status_message_en: pick(d.status_message_en, support.status_message_en),
      emergency_notice_ar: pick(d.emergency_notice_ar, support.emergency_notice_ar),
      working_hours_ar: pick(d.working_hours_ar, support.working_hours_ar),
      working_hours_en: pick(d.working_hours_en, support.working_hours_en),
      // القنوات والخدمات الجديدة تُضاف فوق الموجودة
      channels: [
        ...((support.channels || []) as any[]),
        ...((d.channels || []) as any[]).filter(
          (c) => !(support.channels || []).some((ex: any) => ex.id === c.id || ex.value === c.value),
        ),
      ] as any,
      services: [
        ...((support.services || []) as any[]),
        ...((d.services || []) as any[]).filter(
          (sv) =>
            !(support.services || []).some(
              (ex: any) => ex.id === sv.id || ex.title_ar === sv.title_ar,
            ),
        ),
      ] as any,
    });
  };

  // --- Import Handler ---
  const handleImportResult = (result: ServiceParseResult<TroubleshootingItem[]>) => {
    if (result.data && Array.isArray(result.data) && onChangeKbArticles) {
      const converted = result.data.map((item) => ({
        id: item.id || `kb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        category: item.category || "مشاكل عامة",
        match: item.keywords || "",
        ask: item.ask || "",
        steps: Array.isArray(item.steps) ? item.steps.join("\n") : String(item.steps || ""),
        errorCodes: item.errorCodes || "",
        imageUrl: item.imageUrl || "",
      }));
      onChangeKbArticles([...(kbArticles || []), ...converted]);
      const firstConverted = converted[0];
      if (firstConverted) {
        setExpandedId(firstConverted.id);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            {t("إعدادات الدعم وقاعدة حلول المشاكل")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t("تخصيص قنوات التواصل، أوقات العمل، ومقالات المشاكل التقنية للمساعد الآلي.")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-colors border border-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            {activeTab === "problems"
              ? t("استيراد قالب حلول المشاكل")
              : t("استيراد قالب تواصل معنا")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("problems")}
          className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${
            activeTab === "problems"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {t("قاعدة حلول المشاكل والأخطاء")} ({kbArticles?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("channels")}
          className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${
            activeTab === "channels"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {t("قنوات الدعم والتواصل")}
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${
            activeTab === "general"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {t("النصوص وأوقات العمل")}
        </button>
      </div>

      {/* 1. Problems Tab */}
      {activeTab === "problems" && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {t(
                "هذه المقالات يستخدمها المساعد الآلي للتعرف التلقائي على المشاكل ورموز الأخطاء وإرشاد العميل.",
              )}
            </p>
            <button
              onClick={addProblem}
              className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-4 py-2 rounded-xl font-bold hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t("إضافة مشكلة")}
            </button>
          </div>

          <div className="space-y-3">
            {kbArticles?.map((art, idx) => {
              const isExpanded = expandedId === art.id;
              return (
                <div
                  key={art.id || idx}
                  className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : art.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <h4 className="font-bold text-sm text-foreground">
                          {art.title || t("مشكلة بدون عنوان")}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {art.errorCodes && (
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                              {art.errorCodes}
                            </span>
                          )}
                          {art.match && <span>• {art.match}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProblem(art.id);
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-5 border-t border-border bg-muted/10 space-y-4 animate-in fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold mb-1">
                            {t("عنوان المشكلة")} *
                          </label>
                          <input
                            type="text"
                            value={art.title || ""}
                            onChange={(e) => updateProblem(art.id, { title: e.target.value })}
                            placeholder={t("مثال: مشكلة تعذر الاتصال أو رمز الخطأ 2124-4508")}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">
                            {t("رموز الأخطاء المرتبطة")}
                          </label>
                          <input
                            type="text"
                            value={art.errorCodes || ""}
                            onChange={(e) => updateProblem(art.id, { errorCodes: e.target.value })}
                            placeholder="مثال: 2124-4508, 2811-5003"
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">
                            {t("كلمات مطابقة بحث العميل")}
                          </label>
                          <input
                            type="text"
                            value={art.match || ""}
                            onChange={(e) => updateProblem(art.id, { match: e.target.value })}
                            placeholder="مايدخل, الباسورد غلط, خطأ اتصال"
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold mb-1">
                            {t("سؤال توضيحي قبل الحل (اختياري)")}
                          </label>
                          <input
                            type="text"
                            value={art.ask || ""}
                            onChange={(e) => updateProblem(art.id, { ask: e.target.value })}
                            placeholder="هل جهازك متصل بشبكة Wi-Fi ومحدث لآخر إصدار؟"
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold mb-1">
                            {t("خطوات الحل — خطوة في كل سطر")} *
                          </label>
                          <textarea
                            value={art.steps || ""}
                            onChange={(e) => updateProblem(art.id, { steps: e.target.value })}
                            rows={4}
                            placeholder={`1. أعد تشغيل الجهاز بالكامل.\n2. تأكد من ضبط الوقت تلقائياً عبر الإنترنت.\n3. أعد محاولة تسجيل الدخول.`}
                            className="w-full bg-background border border-border rounded-xl p-3 text-xs leading-relaxed focus:border-primary outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <ImageUploadField
                            label={t("صورة توضيحية للمشكلة أو الحل")}
                            value={art.imageUrl || ""}
                            onChange={(url) => updateProblem(art.id, { imageUrl: url })}
                            folder="support"
                            aspect="video"
                            helperText={t("تظهر مع الحل للعميل داخل صفحة الدعم والمساعد الآلي.")}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Channels Tab */}
      {activeTab === "channels" && (
        <div className="bg-card border border-border p-6 rounded-2xl space-y-4 animate-in fade-in">
          <h3 className="text-base font-bold mb-3">{t("قنوات الدعم المباشر")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                {t("رقم الواتساب")}
              </label>
              <input
                type="text"
                value={support?.whatsapp || ""}
                onChange={(e) => updateField("whatsapp", e.target.value)}
                placeholder="+964..."
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-blue-500" />
                {t("حساب التلغرام")}
              </label>
              <input
                type="text"
                value={support?.telegram || ""}
                onChange={(e) => updateField("telegram", e.target.value)}
                placeholder="@bananastore_support"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-500" />
                {t("البريد الإلكتروني")}
              </label>
              <input
                type="email"
                value={support?.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="support@bananastore.com"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-purple-500" />
                {t("رقم الهاتف")}
              </label>
              <input
                type="text"
                value={support?.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+964..."
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. General Tab */}
      {activeTab === "general" && (
        <div className="bg-card border border-border p-6 rounded-2xl space-y-4 animate-in fade-in">
          <h3 className="text-base font-bold mb-3">{t("النصوص التعريفية وأوقات العمل")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">{t("عنوان صفحة الدعم")}</label>
              <input
                type="text"
                value={support?.hero_title_ar || ""}
                onChange={(e) => updateField("hero_title_ar", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                {t("ساعات وأوقات العمل")}
              </label>
              <input
                type="text"
                value={support?.working_hours_ar || ""}
                onChange={(e) => updateField("working_hours_ar", e.target.value)}
                placeholder="يومياً من 10 صباحاً حتى 12 منتصف الليل"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1">{t("مقدمة ورسالة قسم الدعم")}</label>
              <textarea
                value={support?.support_intro_ar || ""}
                onChange={(e) => updateField("support_intro_ar", e.target.value)}
                rows={3}
                className="w-full bg-background border border-border rounded-xl p-3 text-sm focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ServiceImportModal
          type={activeTab === "problems" ? "troubleshooting" : "contact"}
          onClose={() => setShowImportModal(false)}
          onImport={
            activeTab === "problems" ? (handleImportResult as any) : (handleContactImport as any)
          }
        />
      )}
    </div>
  );
}
