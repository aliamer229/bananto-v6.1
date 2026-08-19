/**
 * ServiceImportModal.tsx
 *
 * Universal template import modal for store services:
 * 1. حلول المشاكل التقنية (Troubleshooting & Problem Solutions)
 * 2. تعليمات التسجيل وتفعيل الحسابات (Registration Guides)
 * 3. الأسئلة الشائعة (FAQ)
 * 4. سياسة الشراء وحقوقك والضمان (Purchase Policy & Rights)
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clipboard,
  Download,
  Eye,
  FileText,
  FileUp,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  getTemplateForSection,
  parseServiceTemplate,
  type ServiceParseResult,
  type ServiceSectionType,
} from "@/lib/servicesImport";

interface ServiceImportModalProps {
  type: ServiceSectionType;
  onClose: () => void;
  onImport: (parsedResult: ServiceParseResult) => void;
}

const SECTION_CONFIG: Record<
  ServiceSectionType,
  {
    titleAr: string;
    descriptionAr: string;
    fileName: string;
    icon: any;
    accentColor: string;
    sampleDescription: string;
  }
> = {
  troubleshooting: {
    titleAr: "استيراد قالب حلول المشاكل التقنية",
    descriptionAr:
      "قم باستيراد أو ملء بنود المشاكل، رموز الأخطاء، وخطوات الحل للمساعد الآلي وصفحة الدعم.",
    fileName: "troubleshooting-template.txt",
    icon: Wrench,
    accentColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    sampleDescription: "قالب جاهز يحتوي على مشاكل رموز أخطاء الاتصال، التجمد، وإعادة المزامنة.",
  },
  registration_guides: {
    titleAr: "استيراد قالب تعليمات التسجيل والأدلة",
    descriptionAr: "استيراد خطوات تفعيل الحسابات، تحميل الألعاب، الملاحظات الإرشادية والتنبيهات.",
    fileName: "registration-guides-template.txt",
    icon: Layers,
    accentColor: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    sampleDescription: "قالب تفعيل الحساب الأساسي Primary Console مع 4 خطوات مصورة وتنبيهات أمان.",
  },
  faq: {
    titleAr: "استيراد قالب الأسئلة الشائعة والأقسام",
    descriptionAr: "استيراد أقسام وتصنيفات الأسئلة مع الإجابات المفصلة والكلمات المفتاحية للبحث.",
    fileName: "faq-template.txt",
    icon: HelpCircle,
    accentColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    sampleDescription: "قالب يحتوي 3 تصنيفات (حسابات، تسليم، ضمان) و4 أسئلة شائعة شائعة الاستخدام.",
  },
  purchase_policy: {
    titleAr: "استيراد قالب سياسة الشراء وحقوقك والضمان",
    descriptionAr: "استيراد بنود وثيقة الشروط، الضمان الذهبي، حقوق التعويض، وسياسات الاستبدال.",
    fileName: "purchase-policy-template.txt",
    icon: ShieldCheck,
    accentColor: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    sampleDescription: "وثيقة سياسة الشراء وضمان الحسابات مع تنبيهات الرأس والبنود المميزة.",
  },
};

export default function ServiceImportModal({ type, onClose, onImport }: ServiceImportModalProps) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const isRtl = lang !== "en";

  const config = SECTION_CONFIG[type];
  const templateSample = useMemo(() => getTemplateForSection(type), [type]);

  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<ServiceParseResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<"input" | "preview">("input");

  const errors = result?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.severity === "warning") ?? [];

  // Populate sample template
  const handleLoadSample = () => {
    setInputText(templateSample);
    toast.success(t("تم تحميل القالب النموذجي بنجاح"));
  };

  // Copy template text
  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(templateSample);
      toast.success(t("تم نسخ القالب إلى الحافظة بنجاح"));
    } catch {
      toast.error(t("تعذر نسخ القالب"));
    }
  };

  // Download template .txt file
  const handleDownloadTemplate = () => {
    const blob = new Blob([templateSample], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = config.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t("جاري تحميل ملف القالب..."));
  };

  // Handle local file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      setInputText(text);
      toast.success(`${t("تم استيراد الملف")}: ${file.name}`);
    };
    reader.readAsText(file);
  };

  // Validate and parse template
  const handleValidate = () => {
    if (!inputText.trim()) {
      toast.error(t("يرجى إدخال أو لصق محتوى القالب أولاً"));
      return;
    }
    setIsValidating(true);
    setTimeout(() => {
      try {
        const parsed = parseServiceTemplate(type, inputText);
        setResult(parsed);
        if (parsed.success && parsed.issues.filter((i) => i.severity === "error").length === 0) {
          toast.success(t("تم فحص وتجهيز البيانات بنجاح!"));
          setActiveTab("preview");
        } else {
          toast.error(t("يرجى مراجعة الأخطاء الموضحة في القالب"));
        }
      } catch (err: any) {
        toast.error(`${t("خطأ أثناء الفحص")}: ${err.message}`);
      } finally {
        setIsValidating(false);
      }
    }, 40);
  };

  // Apply parsed data to editor
  const handleApply = () => {
    if (!result || !result.success) {
      toast.error(t("يرجى فحص القالب والتأكد من خلوه من الأخطاء أولاً"));
      return;
    }
    onImport(result);
    toast.success(t("تم استيراد وتعبئة حقول البيانات بنجاح!"));
    onClose();
  };

  const IconComponent = config.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${config.accentColor}`}>
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                {config.titleAr}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {config.descriptionAr}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t("تحميل نموذج جاهز")}
            </button>
            <button
              onClick={handleCopyTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors"
            >
              <Clipboard className="w-3.5 h-3.5" />
              {t("نسخ القالب المرجعي")}
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t("تحميل ملف .txt")}
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground hover:opacity-90 border border-border cursor-pointer transition-colors">
            <FileUp className="w-3.5 h-3.5" />
            <span>{t("رفع ملف نصي")}</span>
            <input type="file" accept=".txt,.json" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-border px-6 bg-muted/20">
          <button
            onClick={() => setActiveTab("input")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "input"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="w-4 h-4" />
            {t("محتوى القالب")}
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            disabled={!result}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "preview"
                ? "border-primary text-primary"
                : result
                  ? "border-transparent text-muted-foreground hover:text-foreground"
                  : "border-transparent text-muted-foreground/40 cursor-not-allowed"
            }`}
          >
            <Eye className="w-4 h-4" />
            {t("المعاينة المباشرة")}
            {result && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {result.stats.totalItems || result.stats.totalSectionsOrSteps}
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "input" && (
            <div className="space-y-4">
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t(
                    "الصق نص القالب بصيغة key=value أو اضغط على 'تحميل نموذج جاهز' للبدء...",
                  )}
                  spellCheck={false}
                  rows={14}
                  className="w-full bg-zinc-950 text-zinc-200 font-mono text-xs sm:text-sm p-4 rounded-xl border border-border focus:outline-none focus:border-primary transition-colors resize-none leading-relaxed"
                  style={{ tabSize: 2 }}
                />
                <div className="absolute bottom-3 left-4 text-xs font-mono text-zinc-500 select-none">
                  {inputText.length} {t("حرف")} | {inputText.split("\n").length} {t("سطر")}
                </div>
              </div>

              {/* Validation & Parsing Stats */}
              {result && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-card border border-border p-3 rounded-xl">
                      <div className="text-xs text-muted-foreground">{t("العناصر المستخرجة")}</div>
                      <div className="text-lg font-bold text-foreground mt-0.5">
                        {result.stats.totalItems}
                      </div>
                    </div>
                    <div className="bg-card border border-border p-3 rounded-xl">
                      <div className="text-xs text-muted-foreground">{t("الحقول المقروءة")}</div>
                      <div className="text-lg font-bold text-foreground mt-0.5">
                        {result.stats.totalFieldsDetected}
                      </div>
                    </div>
                    <div className="bg-card border border-border p-3 rounded-xl">
                      <div className="text-xs text-muted-foreground">{t("الخطوات والبنود")}</div>
                      <div className="text-lg font-bold text-foreground mt-0.5">
                        {result.stats.totalSectionsOrSteps}
                      </div>
                    </div>
                    <div className="bg-card border border-border p-3 rounded-xl">
                      <div className="text-xs text-muted-foreground">{t("حالة القالب")}</div>
                      <div
                        className={`text-sm font-bold mt-1 flex items-center gap-1.5 ${
                          errors.length === 0 ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {errors.length === 0 ? (
                          <>
                            <CheckCircle className="w-4 h-4" /> {t("سليم وجاهز")}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4" /> {errors.length} {t("أخطاء")}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {t("يوجد أخطاء تمنع الاستيراد:")}
                      </div>
                      <ul className="text-xs space-y-1 text-rose-600/90 dark:text-rose-400/90 list-disc pr-4">
                        {errors.map((e, idx) => (
                          <li key={idx}>
                            <span className="font-mono font-bold">{e.field}:</span> {e.messageAr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {t("تنبيهات (غير مانعة للاستيراد):")}
                      </div>
                      <ul className="text-xs space-y-1 text-amber-600/90 dark:text-amber-400/90 list-disc pr-4">
                        {warnings.map((w, idx) => (
                          <li key={idx}>
                            <span className="font-mono font-bold">{w.field}:</span> {w.messageAr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "preview" && result && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Preview For Troubleshooting */}
              {type === "troubleshooting" && (
                <div className="space-y-3">
                  {(result.data as any[]).map((prob, idx) => (
                    <div
                      key={prob.id || idx}
                      className="bg-card border border-border p-4 rounded-xl space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary mb-1">
                            {prob.category || "مشاكل عامة"}
                          </div>
                          <h3 className="text-base font-bold text-foreground">{prob.title}</h3>
                        </div>
                        {prob.errorCodes && (
                          <div className="px-2 py-1 rounded bg-muted text-xs font-mono text-muted-foreground border border-border">
                            {prob.errorCodes}
                          </div>
                        )}
                      </div>

                      {prob.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {prob.description}
                        </p>
                      )}

                      {prob.steps && prob.steps.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-border">
                          <div className="text-xs font-bold text-foreground">
                            {t("خطوات الحل المكتشفة:")}
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                            {prob.steps.map((st: string, sIdx: number) => (
                              <li key={sIdx}>{st}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview For Registration Guides */}
              {type === "registration_guides" && (
                <div className="space-y-4">
                  {(result.data as any[]).map((guide, idx) => (
                    <div
                      key={guide.id || idx}
                      className="bg-card border border-border p-5 rounded-xl space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10">
                            {guide.category}
                          </span>
                          <h3 className="text-lg font-bold text-foreground mt-2">
                            {guide.title_ar}
                          </h3>
                        </div>
                        <div className="text-xs text-muted-foreground font-bold">
                          ⏱ {guide.estimated_time || "3 دقائق"} | {guide.difficulty || "سهل"}
                        </div>
                      </div>

                      {guide.description_ar && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {guide.description_ar}
                        </p>
                      )}

                      {guide.steps && guide.steps.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border">
                          <div className="text-xs font-bold text-foreground">
                            {t("الخطوات المكتشفة:")} ({guide.steps.length})
                          </div>
                          <div className="grid gap-2">
                            {guide.steps.map((st: any, sIdx: number) => (
                              <div
                                key={st.id || sIdx}
                                className="bg-muted/40 p-3 rounded-lg border border-border/60 text-xs space-y-1"
                              >
                                <div className="font-bold text-foreground flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
                                    {sIdx + 1}
                                  </span>
                                  {st.title_ar}
                                </div>
                                <div className="text-muted-foreground">{st.description_ar}</div>
                                {st.warning_ar && (
                                  <div className="text-rose-500 font-bold text-[11px] mt-1">
                                    ⚠️ {st.warning_ar}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview For FAQ */}
              {type === "faq" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {result.data.categories?.map((cat: any) => (
                      <span
                        key={cat.id}
                        className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg border border-border"
                      >
                        📂 {cat.name_ar}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {result.data.faqs?.map((f: any, idx: number) => (
                      <div
                        key={f.id || idx}
                        className="bg-card border border-border p-4 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-bold text-foreground flex items-center gap-2">
                            <span className="text-primary font-mono">Q{idx + 1}:</span>
                            {f.question_ar}
                          </div>
                          {f.featured && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              ⭐ {t("مميز")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pr-6 border-r-2 border-primary/40">
                          {f.answer_ar}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview For Policy */}
              {type === "purchase_policy" && (
                <div className="space-y-4">
                  <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-foreground">{result.data.title_ar}</h3>
                      <span className="text-xs font-mono px-2 py-1 bg-muted rounded border border-border text-muted-foreground">
                        {result.data.version} ({result.data.effective_date})
                      </span>
                    </div>
                    {result.data.subtitle_ar && (
                      <p className="text-xs text-muted-foreground">{result.data.subtitle_ar}</p>
                    )}
                    {result.data.important_notices && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                        🔔 {result.data.important_notices}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {result.data.sections?.map((sec: any, idx: number) => (
                      <div
                        key={sec.id || idx}
                        className={`bg-card border p-4 rounded-xl space-y-2 ${
                          sec.highlight ? "border-primary/50 shadow-sm" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-foreground">{sec.title_ar}</h4>
                          {sec.highlight && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-primary/10 text-primary">
                              {t("بند هام")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                          {sec.body_ar}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border bg-muted/30 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            {t("إلغاء")}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={isValidating || !inputText.trim()}
              className="px-5 py-2 rounded-xl text-sm font-bold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 flex items-center gap-2 transition-all"
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t("فحص وتحليل البيانات")}
            </button>

            <button
              onClick={handleApply}
              disabled={!result || errors.length > 0}
              className="px-6 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              {t("تطبيق واستيراد البيانات")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
