/**
 * Knowledge-base editor — the articles the automated support engine answers
 * from. Stored in `settings.kbArticles` and merged on top of the built-in set
 * (an admin article with the same error code always wins).
 */

import { useEffect, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Sparkles,
  Wrench,
  BrainCircuit,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import ServiceImportModal from "./services/ServiceImportModal";
import { ImageUploadField } from "./ImageUploadField";
import type { ServiceParseResult, TroubleshootingItem } from "@/lib/servicesImport";

type KbRow = {
  id: string;
  title: string;
  match: string;
  ask: string;
  steps: string;
  errorCodes: string;
  imageUrl: string;
  source?: "admin_chat" | "manual" | "imported";
  confidence?: number;
};

const emptyRow = (): KbRow => ({
  id: `kb_admin_${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  match: "",
  ask: "",
  steps: "",
  errorCodes: "",
  imageUrl: "",
  source: "manual",
});

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--brand-red)]";

export default function KbEditor() {
  const [rows, setRows] = useState<KbRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    fetch("/api/data")
      .then((res) => res.json())
      .then((data) => {
        const list = (data?.settings?.kbArticles ?? []) as Partial<KbRow>[];
        setRows(list.map((row) => ({ ...emptyRow(), ...row })));
      })
      .catch(console.error);
  }, []);

  const update = (index: number, patch: Partial<KbRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const handleImportResult = (result: ServiceParseResult<TroubleshootingItem[]>) => {
    if (result.data && Array.isArray(result.data)) {
      const converted: KbRow[] = result.data.map((item) => ({
        id: item.id || `kb_admin_${Math.random().toString(36).slice(2, 8)}`,
        title: item.title || "",
        match: item.keywords || "",
        ask: item.ask || "",
        steps: Array.isArray(item.steps) ? item.steps.join("\n") : String(item.steps || ""),
        errorCodes: item.errorCodes || "",
        imageUrl: item.imageUrl || "",
        source: "imported",
      }));
      setRows((current) => [...current, ...converted]);
      toast.success(`تم استيراد ${converted.length} حلول بنجاح`);
    }
  };

  const mineFromResolvedChats = async () => {
    setIsMining(true);
    try {
      const res = await fetch("/api/admin/knowledge-base?action=mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.articles) {
        setRows(data.articles);
        toast.success(
          `تم استخراج ${data.minedCount || 0} حل جديد من ردود المشرفين المعتمدة وتحديث القاعدة!`,
        );
      } else {
        toast.error(data.error || "تعذر استخراج المعرفة من المحادثات حالياً");
      }
    } catch (err: any) {
      toast.error("خطأ أثناء استخراج المعرفة");
    } finally {
      setIsMining(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { kbArticles: rows.filter((row) => row.title.trim()) },
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("تم حفظ قاعدة المعرفة بنجاح");
        setTimeout(() => setSaved(false), 2500);
      } else {
        toast.error("فشل حفظ التعديلات");
      }
    } catch {
      toast.error("خطأ أثناء الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="mb-1 text-[22px] font-bold text-[var(--admin-ink)] flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[var(--brand-red)]" />
            قاعدة المشاكل والحلول المعتمدة
          </h1>
          <p className="text-xs text-muted-foreground">
            المساعد الآلي يتعلم حصرياً من ردود المشرفين المعتمدة بعد إغلاق التذاكر، مع تنظيف تام
            لكافة البيانات الحساسة وأكواد OTP.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={mineFromResolvedChats}
            disabled={isMining}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all border border-primary/20 cursor-pointer disabled:opacity-60"
            title="فحص المحادثات المحلولة واستخراج حلول المشرفين الموثوقة تلقائياً"
          >
            {isMining ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BrainCircuit className="w-3.5 h-3.5" />
            )}
            <span>
              {isMining ? "جاري التعلم من المحادثات..." : "تغذية المعرفة من ردود المشرفين"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-colors border border-amber-500/20 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>استيراد قالب</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <input
                className={field}
                placeholder="عنوان المشكلة (مثال: الحساب لا يقبل تسجيل الدخول)"
                value={row.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              {row.source === "admin_chat" && (
                <span className="shrink-0 px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-bold">
                  🤖 مستخرج من رد مشرف
                </span>
              )}
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="rounded-lg border border-border p-2 text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                aria-label="حذف المقال"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              className={field}
              placeholder="كلمات المستخدم التي تدل على المشكلة، مفصولة بفاصلة (مايدخل، الباس غلط، cant login)"
              value={row.match}
              onChange={(event) => update(index, { match: event.target.value })}
            />
            <input
              className={field}
              placeholder="سؤال توضيحي واحد قبل الحل (اختياري)"
              value={row.ask}
              onChange={(event) => update(index, { ask: event.target.value })}
            />
            <textarea
              className={`${field} min-h-28`}
              placeholder="خطوات الحل — خطوة في كل سطر"
              value={row.steps}
              onChange={(event) => update(index, { steps: event.target.value })}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className={field}
                placeholder="رموز الأخطاء المرتبطة (2124-4508، 2137-8056)"
                value={row.errorCodes}
                onChange={(event) => update(index, { errorCodes: event.target.value })}
              />
              <ImageUploadField
                label="صورة توضيحية (اختياري)"
                value={row.imageUrl}
                onChange={(url) => update(index, { imageUrl: url })}
                folder="support"
                aspect="video"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" /> إضافة مشكلة
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--brand-red)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Save className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>
        {saved && <span className="text-xs font-bold text-emerald-600">تم الحفظ بنجاح ✓</span>}
      </div>

      {showImportModal && (
        <ServiceImportModal
          type="troubleshooting"
          onClose={() => setShowImportModal(false)}
          onImport={(res) => {
            handleImportResult(res as any);
            setShowImportModal(false);
          }}
        />
      )}
    </div>
  );
}
