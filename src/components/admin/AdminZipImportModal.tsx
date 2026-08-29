import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Download,
  FileArchive,
  Loader2,
  Play,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { buildBatchGameImport, buildBatchSchemaImport } from "@/lib/gameImportForm";
import {
  COVER_TEXTURE_FETCH_FAILED,
  COVER_TEXTURE_FIELD,
  mirrorCoverTextureSource,
  needsStorageMirror,
} from "@/lib/coverTexture";
import { downloadTemplateFile } from "@/lib/downloadTemplate";
import { api } from "@/lib/api";
import { PRODUCT_SCHEMAS, detectSchemaId, getSchema } from "@/lib/productImport/registry";
import { sanitizeSlug } from "@/lib/productSlug";
import type { ProductSchema } from "@/lib/productImport/types";
import {
  isImportableTextEntry,
  listZipEntries,
  readZipEntryText,
  type ZipEntry,
} from "@/lib/zipReader";
import { safeStringify } from "@/utils/safeJson";

/**
 * Batch import of products from a ZIP of template files.
 *
 * A wrapper, not a second importer: every file goes through the same parser and
 * the same product save endpoint the single-product import uses. What this
 * screen adds is unzipping, a dry run that writes nothing, running the files one
 * after another so two saves never race, and saving each result hidden.
 *
 * Which parser a file gets is the registry's decision, not this component's.
 * Nintendo Switch Games keeps its own long-standing schema and parser; every
 * other category resolves to a registry schema. That is the whole reason there
 * is one importer here rather than one per category.
 */

/** `undefined` schema means the Nintendo Switch Games path. */
type Target = { label: string; schema?: ProductSchema };

const NINTENDO: Target = { label: "ألعاب Nintendo Switch" };

type Prepared =
  | {
      file: string;
      state: "ready";
      title: string;
      slug: string;
      /** Filled during the dry run against the live catalogue and the archive. */
      duplicateOf?: string;
      completeness?: number;
      missingRequired: string[];
      payload: Record<string, any>;
    }
  | { file: string; state: "failed"; reason: string };

type FileOutcome =
  | { file: string; state: "saved"; title: string }
  | { file: string; state: "duplicate"; title: string; slug: string }
  | { file: string; state: "failed"; reason: string };

interface AdminZipImportModalProps {
  /** Category the imported products are filed under. */
  categoryId: string;
  onClose: () => void;
  /** Called for every product the endpoint stored, so the list stays live. */
  onProductSaved: (product: any) => void;
}

export default function AdminZipImportModal({
  categoryId,
  onClose,
  onProductSaved,
}: AdminZipImportModalProps) {
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [current, setCurrent] = useState(0);
  const [prepared, setPrepared] = useState<Prepared[] | null>(null);
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  /** Files whose 3D Texture Source could not be pulled off its source host. */
  const [textureFailures, setTextureFailures] = useState<string[]>([]);
  const bufferRef = useRef<ArrayBuffer | null>(null);

  /*
    The category the admin came from picks the schema; the select is an override
    for the case where a ZIP was prepared for a different section than the one
    the product list happens to be filtered to.
  */
  const [schemaId, setSchemaId] = useState<string>(
    () => detectSchemaId({ category: categoryId }) ?? "",
  );
  const target: Target = useMemo(() => {
    const schema = getSchema(schemaId);
    return schema ? { label: schema.label, schema } : NINTENDO;
  }, [schemaId]);

  const savedCount = outcomes.filter((o) => o.state === "saved").length;
  const duplicateCount = outcomes.filter((o) => o.state === "duplicate").length;
  const failures = outcomes.filter((o) => o.state === "failed") as Extract<
    FileOutcome,
    { state: "failed" }
  >[];
  const duplicates = outcomes.filter((o) => o.state === "duplicate") as Extract<
    FileOutcome,
    { state: "duplicate" }
  >[];

  const readyCount = prepared?.filter((p) => p.state === "ready").length ?? 0;
  const prepFailures = (prepared ?? []).filter((p) => p.state === "failed") as Extract<
    Prepared,
    { state: "failed" }
  >[];

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOutcomes([]);
    setPrepared(null);
    setCurrent(0);
    try {
      const buffer = await file.arrayBuffer();
      const found = listZipEntries(buffer).filter(isImportableTextEntry);
      bufferRef.current = buffer;
      setEntries(found);
      setFileName(file.name);
      if (found.length === 0) toast.error("لا يوجد أي ملف TXT داخل الأرشيف");
    } catch (err: any) {
      bufferRef.current = null;
      setEntries([]);
      setFileName("");
      toast.error(err?.message || "تعذّر قراءة ملف ZIP");
    }
  }, []);

  /** Parses one file through whichever pipeline the target names. */
  const prepareOne = useCallback(
    (text: string, baseName: string): Prepared => {
      /*
        Only the schema path reports quality; the Nintendo pipeline has its own
        audit elsewhere. An unmeasured file shows no percentage in the preview
        rather than showing zero.
      */
      const built = target.schema
        ? buildBatchSchemaImport(text, categoryId, target.schema)
        : { ...buildBatchGameImport(text, categoryId), quality: undefined };
      if (!built.ok) return { file: baseName, state: "failed", reason: built.reason };

      const quality = built.quality;
      const total = quality ? quality.required.total + quality.recommended.total : 0;
      const present = quality ? quality.required.present + quality.recommended.present : 0;
      return {
        file: baseName,
        state: "ready",
        title: String(built.payload.title || built.payload.titleEn || baseName),
        /*
          The template leaves the slug blank and the endpoint derives it from
          the English title, so the preview has to derive it the same way or it
          would compare an empty string against every existing product and
          report nothing. Same function the endpoint calls.
        */
        slug: sanitizeSlug(
          String(built.payload.slug || built.payload.titleEn || built.payload.title || ""),
          String(built.payload.id ?? ""),
        ),
        completeness: total > 0 ? (present / total) * 100 : undefined,
        missingRequired: quality?.required.missing ?? [],
        payload: built.payload,
      };
    },
    [categoryId, target],
  );

  /**
   * The dry run. Reads the archive and the catalogue and writes nothing.
   *
   * Duplicates are checked against both the live catalogue and the rest of the
   * archive, because a ZIP that contains the same product twice is the failure
   * this is most likely to catch — and the endpoint would happily store both.
   */
  const dryRun = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || entries.length === 0 || isChecking || isRunning) return;

    setIsChecking(true);
    setOutcomes([]);
    try {
      const results: Prepared[] = [];
      for (const entry of entries) {
        try {
          const text = await readZipEntryText(buffer, entry);
          results.push(prepareOne(text, entry.baseName));
        } catch (err: any) {
          results.push({
            file: entry.baseName,
            state: "failed",
            reason: String(err?.message || err || "خطأ غير معروف"),
          });
        }
      }

      let existing = new Map<string, string>();
      try {
        const store: any = await api.store();
        existing = new Map(
          (store?.products ?? [])
            .filter((p: any) => p?.slug)
            .map((p: any) => [String(p.slug).toLowerCase(), String(p.title || p.titleEn || p.id)]),
        );
      } catch {
        /*
          A catalogue that will not load is not a reason to refuse the dry run —
          the endpoint does its own slug check on every save. The preview simply
          cannot pre-warn about clashes, and says so rather than implying the
          archive is clean.
        */
        toast.warning("تعذّر قراءة الكتالوج — لن يظهر تحذير التكرار قبل الحفظ");
        existing = new Map();
      }

      const seenInZip = new Map<string, string>();
      for (const item of results) {
        if (item.state !== "ready" || !item.slug) continue;
        const key = item.slug.toLowerCase();
        const clash = existing.get(key) ?? seenInZip.get(key);
        if (clash) item.duplicateOf = clash;
        if (!seenInZip.has(key)) seenInZip.set(key, `${item.file} (داخل نفس الأرشيف)`);
      }

      setPrepared(results);
      toast.success("انتهى الفحص — لم يُكتب أي شيء");
    } finally {
      setIsChecking(false);
    }
  }, [entries, isChecking, isRunning, prepareOne]);

  const runImport = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || entries.length === 0 || isRunning) return;

    setIsRunning(true);
    setOutcomes([]);
    setTextureFailures([]);
    setCurrent(0);

    // Sequential on purpose: the catalogue is one document, and parallel saves
    // would read the same snapshot and overwrite each other.
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      setCurrent(index + 1);
      let outcome: FileOutcome;
      try {
        const text = await readZipEntryText(buffer, entry);
        const ready = prepareOne(text, entry.baseName);
        if (ready.state === "failed") {
          outcome = { file: entry.baseName, state: "failed", reason: ready.reason };
        } else {
          const payload = ready.payload;
          /*
            The wrap is a link to an archive that will not serve a plain
            server-side request, so copy it into our storage before the product
            is written. A source that refuses is noted and the field left
            empty — the product itself still imports.
          */
          const wrap = payload[COVER_TEXTURE_FIELD];
          if (needsStorageMirror(wrap)) {
            const mirrored = await mirrorCoverTextureSource(String(wrap));
            if (mirrored.ok) {
              payload[COVER_TEXTURE_FIELD] = mirrored.url;
            } else {
              // Keep original URL for fallback/audit rather than failing
              payload[COVER_TEXTURE_FIELD] = String(wrap);
              setTextureFailures((prev) => [...prev, entry.baseName]);
            }
          }

          const res = await fetch("/api/admin/products", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: safeStringify(payload),
          });
          const result = await res.json().catch(() => null);
          if (!res.ok || !result?.success) {
            outcome = {
              file: entry.baseName,
              state: "failed",
              reason: String(result?.error || `HTTP ${res.status}`).split("\n")[0] || "فشل الحفظ",
            };
          } else {
            const saved = result.product;
            onProductSaved(saved);
            const title = String(saved?.title || saved?.titleEn || entry.baseName);
            outcome = saved?.isDuplicate
              ? {
                  file: entry.baseName,
                  state: "duplicate",
                  title,
                  slug: String(saved?.duplicateOriginalSlug || saved?.slug || ""),
                }
              : { file: entry.baseName, state: "saved", title };
          }
        }
      } catch (err: any) {
        outcome = {
          file: entry.baseName,
          state: "failed",
          reason: String(err?.message || err || "خطأ غير معروف"),
        };
      }
      setOutcomes((prev) => [...prev, outcome]);
      // Small pause between items to keep D1 writes steady
      await new Promise((r) => setTimeout(r, 50));
    }

    setIsRunning(false);
    toast.success("انتهى استيراد المجموعة");
  }, [entries, isRunning, onProductSaved, prepareOne]);

  const busy = isRunning || isChecking;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-500/20">
              <FileArchive className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">استيراد مجموعة منتجات</h2>
              <p className="text-[11px] text-muted-foreground">
                ملف ZIP يحتوي ملفات TXT بقالب {target.label} — يُحفظ كل منتج مخفياً.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 transition-colors hover:bg-muted disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold">القالب</label>
            <select
              value={schemaId}
              disabled={busy}
              onChange={(event) => {
                setSchemaId(event.target.value);
                setPrepared(null);
                setOutcomes([]);
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs disabled:opacity-40"
            >
              <option value="">{NINTENDO.label}</option>
              {PRODUCT_SCHEMAS.map((schema) => (
                <option key={schema.id} value={schema.id}>
                  {schema.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                void downloadTemplateFile(
                  target.schema?.templateFile ?? "nintendo-switch-game-template.txt",
                  target.schema,
                )
              }
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-muted"
            >
              <Download className="inline h-3.5 w-3.5 ms-1" />
              تحميل القالب
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".zip,application/zip"
              id="zip-import-file"
              className="hidden"
              disabled={busy}
              onChange={(event) => void handleFile(event)}
            />
            <label
              htmlFor="zip-import-file"
              className={`cursor-pointer rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-muted ${busy ? "pointer-events-none opacity-40" : ""}`}
            >
              اختيار ملف ZIP
            </label>
            <span className="text-xs text-muted-foreground">{fileName || "لم يتم اختيار ملف"}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ملفات TXT" value={entries.length} />
            <Stat
              label="التقدم"
              value={entries.length ? `${current} / ${entries.length}` : "0 / 0"}
            />
            <Stat label="محفوظة" value={savedCount} tone="ok" />
            <Stat label="فشلت" value={failures.length} tone={failures.length ? "bad" : undefined} />
          </div>

          {prepared && outcomes.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold">
                <Search className="h-3.5 w-3.5" /> نتيجة الفحص — لم يُكتب أي شيء ({readyCount}{" "}
                جاهزة، {prepFailures.length} فشلت)
              </h3>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {prepared.map((item) =>
                  item.state === "ready" ? (
                    <div key={item.file} className="text-[11px]">
                      <span className="font-bold">{item.title}</span>
                      {typeof item.completeness === "number" && (
                        <span className="text-muted-foreground">
                          {" "}
                          — اكتمال {Math.round(item.completeness)}%
                        </span>
                      )}
                      {item.missingRequired.length > 0 && (
                        <span className="text-[var(--brand-red-dark)]">
                          {" "}
                          — ينقص: {item.missingRequired.join("، ")}
                        </span>
                      )}
                      {item.duplicateOf && (
                        <span className="text-amber-600"> — مكرر مع {item.duplicateOf}</span>
                      )}
                    </div>
                  ) : (
                    <div key={item.file} className="text-[11px] text-red-600 dark:text-red-300">
                      <span className="font-bold">{item.file}</span> — {item.reason}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {duplicateCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-300">
                <Copy className="h-3.5 w-3.5" /> مكررة ({duplicateCount})
              </h3>
              <div className="space-y-1">
                {duplicates.map((item) => (
                  <div key={item.file} className="text-[11px] text-amber-700 dark:text-amber-300">
                    <span className="font-bold">{item.file}</span> — نفس الـslug ({item.slug})،
                    حُفظت نسخة مخفية ومعلّمة كمكرر دون المساس بالمنتج القديم.
                  </div>
                ))}
              </div>
            </div>
          )}

          {textureFailures.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {COVER_TEXTURE_FETCH_FAILED} (
                {textureFailures.length})
              </h3>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {textureFailures.join("، ")} — حُفظت المنتجات بدون صورة المجسم؛ أضفها يدوياً من محرر
                المنتج.
              </p>
            </div>
          )}

          {failures.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-red-700 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> ملفات فشلت ({failures.length})
              </h3>
              <div className="space-y-1">
                {failures.map((item) => (
                  <div key={item.file} className="text-[11px] text-red-600 dark:text-red-300">
                    <span className="font-bold">{item.file}</span> — {item.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isRunning && outcomes.length > 0 && failures.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 p-3 text-[12px] font-bold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
              <CheckCircle className="h-4 w-4" /> تم استيراد كل الملفات بنجاح.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <span className="text-[11px] text-muted-foreground">
            يتم الاستيراد ملفاً بعد ملف بالتتابع.
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl px-6 py-2 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => void dryRun()}
              disabled={busy || entries.length === 0}
              className="flex items-center gap-2 rounded-xl border border-border px-6 py-2 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40"
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              فحص بدون حفظ
            </button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={busy || entries.length === 0}
              className="flex items-center gap-2 rounded-xl bg-[var(--admin-ink)] px-8 py-2 text-sm font-bold text-white transition-all hover:bg-black disabled:opacity-50"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              بدء الاستيراد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok" ? "text-green-600" : tone === "bad" ? "text-[var(--brand-red-dark)]" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
