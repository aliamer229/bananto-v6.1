import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, AlertCircle, FileText, CheckCircle } from "lucide-react";
import { useI18n } from "@/i18n";
import type { ContentDoc } from "@/lib/content";
import { PolicyEditor } from "./editors/PolicyEditor";
import { FaqEditor } from "./editors/FaqEditor";
import { GuidesEditor } from "./editors/GuidesEditor";
import { SupportEditor } from "./editors/SupportEditor";

export default function ContentSettingsWrapper({ type }: { type: string }) {
  const t = useI18n((s) => s.t);
  const queryClient = useQueryClient();
  const [contentState, setContentState] = useState<Partial<ContentDoc> | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: originalContent, isLoading } = useQuery({
    queryKey: ["admin_content"],
    queryFn: async () => {
      const res = await fetch("/api/content");
      return res.json() as Promise<ContentDoc>;
    },
  });

  useEffect(() => {
    if (originalContent) {
      setContentState(JSON.parse(JSON.stringify(originalContent))); // deep clone
    }
  }, [originalContent]);

  const saveMutation = useMutation({
    mutationFn: async (parsed: any) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error("Failed to save content");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_content"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    try {
      setError("");
      if (jsonMode) {
        const parsed = JSON.parse(jsonText);
        saveMutation.mutate(parsed);
      } else {
        saveMutation.mutate(contentState);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const getSectionDataJson = () => {
    if (!contentState) return {};
    switch (type) {
      case "services_faq":
        return { faqCategories: contentState.faqCategories, faq: contentState.faq };
      case "services_policy":
        return { policy: contentState.policy, tradePolicy: contentState.tradePolicy };
      case "services_support":
        return { support: contentState.support, problems: contentState.problems };
      case "services_guides":
        return { guides: contentState.guides };
      default:
        return {};
    }
  };

  useEffect(() => {
    if (jsonMode && contentState) {
      setJsonText(JSON.stringify(getSectionDataJson(), null, 2));
    }
  }, [jsonMode]);

  const titles: Record<string, string> = {
    services_faq: "الأسئلة الشائعة",
    services_policy: "السياسات والشروط والضمان",
    services_support: "الدعم وحلول المشاكل التقنية",
    services_guides: "تعليمات وتفعيل الحسابات والأدلة",
  };

  if (isLoading || !contentState)
    return (
      <div className="p-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const canUseVisualEditor =
    type === "services_policy" ||
    type === "services_faq" ||
    type === "services_guides" ||
    type === "services_support";

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" /> {titles[type] || "إدارة المحتوى"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t(
              "قم بتعديل المحتوى، الشروحات، القوالب، والبيانات التي تظهر للعملاء في واجهة المتجر.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canUseVisualEditor && (
            <button
              onClick={() => setJsonMode(!jsonMode)}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted border border-border rounded-xl transition-colors"
            >
              {jsonMode ? t("العودة للمحرر البصري") : t("تعديل عبر JSON")}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={`px-6 py-2 font-bold rounded-xl flex items-center gap-2 transition-all ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saved ? t("تم الحفظ بنجاح") : t("حفظ التغييرات")}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 p-4 rounded-xl mb-6 font-mono text-sm border border-rose-200 dark:border-rose-500/20">
          {t("خطأ:")} {error}
        </div>
      )}

      {!canUseVisualEditor || jsonMode ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="bg-muted p-4 border-b border-border text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {t("أنت الآن تستخدم محرر المطورين (JSON). يرجى التأكد من صحة الصيغة.")}
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-4 bg-zinc-950 text-zinc-300 font-mono text-sm focus:outline-none resize-none"
            style={{ tabSize: 2 }}
          />
        </div>
      ) : (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {type === "services_policy" && (
            <>
              <PolicyEditor
                policy={contentState.policy as any}
                label={t("سياسة الشراء والضمان الذهبي")}
                onChange={(p) => setContentState({ ...contentState, policy: p })}
              />
              <div className="h-px bg-border my-8" />
              <PolicyEditor
                policy={contentState.tradePolicy as any}
                label={t("سياسة المقايضة والاستبدال")}
                onChange={(p) => setContentState({ ...contentState, tradePolicy: p })}
              />
            </>
          )}

          {type === "services_faq" && (
            <FaqEditor
              categories={contentState.faqCategories as any}
              faq={contentState.faq as any}
              onChangeCategories={(cats) =>
                setContentState({ ...contentState, faqCategories: cats })
              }
              onChangeFaq={(faqs) => setContentState({ ...contentState, faq: faqs })}
            />
          )}

          {type === "services_guides" && (
            <GuidesEditor
              guides={contentState.guides as any}
              onChange={(guides) => setContentState({ ...contentState, guides })}
            />
          )}

          {type === "services_support" && (
            <SupportEditor
              support={contentState.support as any}
              onChange={(support) => setContentState({ ...contentState, support })}
              kbArticles={contentState.problems as any}
              onChangeKbArticles={(problems) => setContentState({ ...contentState, problems })}
            />
          )}
        </div>
      )}
    </div>
  );
}
