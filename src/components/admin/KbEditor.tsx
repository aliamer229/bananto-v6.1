/**
 * Knowledge-base editor — the articles the automated support engine answers
 * from. Stored in `settings.kbArticles` and merged on top of the built-in set
 * (an admin article with the same error code always wins).
 */

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, Sparkles, Wrench } from "lucide-react";
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
};

const emptyRow = (): KbRow => ({
  id: `kb_admin_${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  match: "",
  ask: "",
  steps: "",
  errorCodes: "",
  imageUrl: "",
});

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--brand-red)]";

export default function KbEditor() {
  const [rows, setRows] = useState<KbRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      }));
      setRows((current) => [...current, ...converted]);
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
        setTimeout(() => setSaved(false), 2500);
      }
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
            قاعدة المشاكل والحلول
          </h1>
          <p className="text-xs text-muted-foreground">
            كل مقال هنا يستخدمه المساعد الآلي للإجابة. رموز الأخطاء تُطابق تلقائياً الصور والرسائل
            التي يرسلها المستخدم، والحلول تُعرض له خطوة خطوة.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-colors border border-amber-500/20"
        >
          <Sparkles className="w-4 h-4" />
          استيراد من قالب المشاكل
        </button>
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
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="rounded-lg border border-border p-2 text-red-600"
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
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground"
        >
          <Plus className="h-4 w-4" /> إضافة مشكلة
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--brand-red)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ"}
        </button>
        {saved && <span className="text-xs font-bold text-emerald-600">تم الحفظ ✓</span>}
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
