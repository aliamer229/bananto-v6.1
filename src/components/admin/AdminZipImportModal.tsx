import React, { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Copy, FileArchive, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";

import { buildBatchGameImport } from "@/lib/gameImportForm";
import {
  COVER_TEXTURE_FETCH_FAILED,
  COVER_TEXTURE_FIELD,
  mirrorCoverTextureSource,
  needsStorageMirror,
} from "@/lib/coverTexture";
import {
  isImportableTextEntry,
  listZipEntries,
  readZipEntryText,
  type ZipEntry,
} from "@/lib/zipReader";
import { safeStringify } from "@/utils/safeJson";

/**
 * Batch import of Nintendo Switch games from a ZIP of template files.
 *
 * A wrapper, not a second importer: every file goes through the same
 * `parseGameImport` and the same product save endpoint the single-game import
 * uses. All this screen adds is unzipping, running the files one after another
 * so two saves never race, and saving each result hidden.
 */

type FileOutcome =
  | { file: string; state: "saved"; title: string }
  | { file: string; state: "duplicate"; title: string; slug: string }
  | { file: string; state: "failed"; reason: string };

interface AdminZipImportModalProps {
  /** Category the imported games are filed under (the games section). */
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
  const [current, setCurrent] = useState(0);
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  /** Files whose 3D Texture Source could not be pulled off its source host. */
  const [textureFailures, setTextureFailures] = useState<string[]>([]);
  const bufferRef = useRef<ArrayBuffer | null>(null);

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

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOutcomes([]);
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
        const prepared = buildBatchGameImport(text, categoryId);
        if (!prepared.ok) {
          outcome = { file: entry.baseName, state: "failed", reason: prepared.reason };
        } else {
          /*
            The wrap is a link to an archive that will not serve a plain
            server-side request, so copy it into our storage before the product
            is written. A source that refuses is noted and the field left
            empty — the game itself still imports.
          */
          const wrap = prepared.payload[COVER_TEXTURE_FIELD];
          if (needsStorageMirror(wrap)) {
            const mirrored = await mirrorCoverTextureSource(String(wrap));
            if (mirrored.ok) {
              prepared.payload[COVER_TEXTURE_FIELD] = mirrored.url;
            } else {
              // Keep original URL for fallback/audit rather than failing
              prepared.payload[COVER_TEXTURE_FIELD] = String(wrap);
              setTextureFailures((prev) => [...prev, entry.baseName]);
            }
          }

          const res = await fetch("/api/admin/products", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: safeStringify(prepared.payload),
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
    }

    setIsRunning(false);
    toast.success("انتهى استيراد المجموعة");
  }, [categoryId, entries, isRunning, onProductSaved]);

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
              <h2 className="text-lg font-bold">استيراد مجموعة ألعاب</h2>
              <p className="text-[11px] text-muted-foreground">
                ملف ZIP يحتوي ملفات TXT بنفس قالب اللعبة — تُحفظ كل لعبة كمنتج مخفي.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="rounded-full p-2 transition-colors hover:bg-muted disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".zip,application/zip"
              id="zip-import-file"
              className="hidden"
              disabled={isRunning}
              onChange={(event) => void handleFile(event)}
            />
            <label
              htmlFor="zip-import-file"
              className={`cursor-pointer rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-muted ${isRunning ? "pointer-events-none opacity-40" : ""}`}
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
                {textureFailures.join("، ")} — حُفظت الألعاب بدون صورة المجسم؛ أضفها يدوياً من محرر
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
            يتم الاستيراد لعبة بعد لعبة بالتتابع.
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="rounded-xl px-6 py-2 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={isRunning || entries.length === 0}
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
