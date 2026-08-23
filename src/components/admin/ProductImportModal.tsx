/**
 * Schema-driven import dialog for the hardware / amiibo / accessory sections.
 *
 * Deliberately mirrors the Nintendo Switch Games importer's flow — paste or
 * upload, validate, review, import into the form — but takes the schema as a
 * prop instead of hard-coding one, so all three sections (and any future one)
 * share a single implementation. Every string goes through `t()`.
 */

import { downloadTemplateFile } from "@/lib/downloadTemplate";
import {
  AlertTriangle,
  CheckCircle,
  Clipboard,
  Download,
  Eye,
  FileUp,
  Loader2,
  Play,
  Table,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "@/i18n";
import { countSchemaFields } from "@/lib/productImport/generator";
import { parseProductImport } from "@/lib/productImport/parser";
import type { ParseResult, ProductSchema } from "@/lib/productImport/types";

interface Props {
  schema: ProductSchema;
  onClose: () => void;
  onImport: (result: ParseResult) => void;
}

export default function ProductImportModal({ schema, onClose, onImport }: Props) {
  const { t, dir } = useTranslation();
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [view, setView] = useState<"status" | "preview">("status");

  const totalFields = useMemo(() => countSchemaFields(schema), [schema]);
  const errors = result?.errors.filter((e) => e.severity === "error") ?? [];
  const warnings = result?.errors.filter((e) => e.severity === "warning") ?? [];

  const handleValidate = () => {
    if (!inputText.trim()) {
      toast.error(t("admin.import.emptyInput"));
      return;
    }
    setIsValidating(true);
    // Yield a frame so the spinner paints before parsing a large file.
    setTimeout(() => {
      try {
        const parsed = parseProductImport(inputText, schema);
        setResult(parsed);
        const blocking = parsed.errors.filter((e) => e.severity === "error");
        if (blocking.length === 0) {
          toast.success(t("admin.import.allValid"));
          setView("preview");
        } else {
          toast.error(t("admin.import.failed"));
          setView("status");
        }
      } catch (error) {
        toast.error(`${t("admin.import.parseError")}: ${(error as Error).message}`);
      } finally {
        setIsValidating(false);
      }
    }, 50);
  };

  const handleDirectImport = () => {
    if (!inputText.trim()) {
      toast.error(t("admin.import.emptyInput"));
      return;
    }
    try {
      const parsed = result || parseProductImport(inputText, schema);
      setResult(parsed);
      const blocking = parsed.errors.filter((e) => e.severity === "error");
      if (blocking.length > 0) {
        toast.error(t("admin.import.failed"));
        setView("status");
        return;
      }
      onImport(parsed);
    } catch (error) {
      toast.error(`${t("admin.import.parseError")}: ${(error as Error).message}`);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setInputText(String(e.target?.result ?? ""));
      toast.success(`${t("admin.import.fileLoaded")}: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const stats = result?.stats;
  const statCards: { label: string; value: number }[] = stats
    ? [
        { label: t("admin.import.detectedFields"), value: stats.fields },
        { label: t("admin.import.specGroups"), value: stats.specGroups },
        { label: t("admin.import.specs"), value: stats.specs },
        { label: t("admin.import.mediaCount"), value: stats.media },
        { label: t("admin.import.videosCount"), value: stats.videos },
        { label: t("admin.import.optionsCount"), value: stats.options },
        { label: t("admin.import.variantsCount"), value: stats.variants },
        { label: t("admin.import.compatibilityCount"), value: stats.compatibility },
        { label: t("admin.import.faqCount"), value: stats.faq },
        { label: t("admin.import.sourcesCount"), value: stats.sources },
      ]
    : [];
  const previewGroups = useMemo(() => {
    if (!result) return [];
    const groups = new Map<string, Array<[string, unknown]>>();
    for (const [key, value] of Object.entries(result.data)) {
      const field = schema.fields.find((candidate) => candidate.target === key);
      const group = field?.group || "Basic Info";
      const entries = groups.get(group) || [];
      entries.push([field?.description || key, value]);
      groups.set(group, entries);
    }
    return [...groups.entries()].map(([name, entries]) => ({ name, entries }));
  }, [result, schema.fields]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      dir={dir}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("admin.import.title")}</h2>
              <p className="text-[11px] text-muted-foreground">
                {schema.label} · {t("admin.import.schema")} v{schema.version} · {totalFields}{" "}
                {t("admin.specifications")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-2 transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Input */}
          <div className="flex w-full flex-col gap-4 border-border p-6 lg:w-1/2 lg:border-e">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                <Clipboard className="h-3.5 w-3.5" />
                {t("admin.import.pasteOrUpload")}
              </label>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".txt,.md"
                  id={`import-file-${schema.id}`}
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label
                  htmlFor={`import-file-${schema.id}`}
                  className="cursor-pointer rounded bg-muted px-2 py-1 text-[10px] font-bold transition-colors hover:bg-muted/80"
                >
                  {t("common.uploadFile")}
                </label>
                <button
                  type="button"
                  onClick={() => void downloadTemplateFile(schema.templateFile, schema)}
                  className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/20"
                >
                  <Download className="h-2.5 w-2.5" />
                  {t("admin.import.downloadTemplate")}
                </button>
              </div>
            </div>

            <textarea
              dir="ltr"
              className="min-h-[300px] w-full flex-1 resize-none rounded-xl border border-border bg-muted/20 p-3 text-start font-mono text-[11px] outline-none transition-all focus:bg-background focus:ring-2 ring-primary/20"
              placeholder={`name=...\n${schema.conditionalOn ? `${schema.conditionalOn}=...\n` : ""}price=...\ndescription_full<<EOF\n...\nEOF`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t("admin.import.updateNotice")}
            </p>

            <button
              type="button"
              disabled={isValidating}
              onClick={handleValidate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t("admin.import.validate")}
            </button>
          </div>

          {/* Result */}
          <div className="flex w-full flex-col gap-4 overflow-hidden bg-muted/5 p-6 lg:w-1/2">
            {result ? (
              <>
                <div className="flex gap-2 border-b border-border pb-2">
                  <TabButton
                    active={view === "status"}
                    onClick={() => setView("status")}
                    icon={<Table className="h-3.5 w-3.5" />}
                  >
                    {t("admin.import.dataStatus")}
                  </TabButton>
                  <TabButton
                    active={view === "preview"}
                    onClick={() => setView("preview")}
                    icon={<Eye className="h-3.5 w-3.5" />}
                  >
                    {t("admin.import.fieldPreview")}
                  </TabButton>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {view === "status" ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {statCards
                          .filter((card, index) => index < 2 || card.value > 0)
                          .map((card) => (
                            <div
                              key={card.label}
                              className="rounded-xl border border-border bg-background p-3 shadow-sm"
                            >
                              <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                                {card.label}
                              </div>
                              <div className="text-xl font-bold" dir="ltr">
                                {card.value}
                              </div>
                            </div>
                          ))}
                      </div>

                      {errors.length > 0 && (
                        <IssueList
                          tone="error"
                          title={`${t("admin.import.errorsTitle")} (${errors.length})`}
                          issues={errors}
                        />
                      )}

                      {warnings.length > 0 && (
                        <IssueList
                          tone="warning"
                          title={`${t("admin.import.warningsTitle")} (${warnings.length})`}
                          issues={warnings}
                        />
                      )}

                      {result.unknownFields.length > 0 && (
                        <div className="rounded-xl bg-muted p-3">
                          <h3 className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">
                            {t("admin.import.unknownFieldsHint")}
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {result.unknownFields.map((field) => (
                              <span
                                key={field}
                                dir="ltr"
                                className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px]"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {errors.length === 0 &&
                        warnings.length === 0 &&
                        result.unknownFields.length === 0 && (
                          <div className="flex flex-col items-center justify-center rounded-xl border border-green-100 bg-green-50 p-8 text-center dark:border-green-900/40 dark:bg-green-950/30">
                            <CheckCircle className="mb-2 h-10 w-10 text-green-500 opacity-60" />
                            <div className="text-sm font-bold text-green-700 dark:text-green-400">
                              {t("admin.import.allValid")}
                            </div>
                            <p className="text-[10px] text-green-600 dark:text-green-500">
                              {t("admin.import.allValidHint")}
                            </p>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {previewGroups.map((group) => (
                        <section
                          key={group.name}
                          className="overflow-hidden rounded-xl border border-border bg-background shadow-sm"
                        >
                          <h3 className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-bold">
                            {group.name}
                          </h3>
                          <dl className="divide-y divide-border/60">
                            {group.entries.map(([label, value], index) => (
                              <div
                                key={`${label}-${index}`}
                                className="grid min-w-0 gap-1 px-4 py-3 sm:grid-cols-[minmax(120px,2fr)_minmax(0,3fr)]"
                              >
                                <dt className="text-[10px] font-bold text-primary [overflow-wrap:anywhere]">
                                  {label}
                                </dt>
                                <dd className="min-w-0 text-[10px] text-muted-foreground [overflow-wrap:anywhere]">
                                  <PreviewValue value={value} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <Clipboard className="h-10 w-10 opacity-20" />
                </div>
                <h3 className="mb-1 text-sm font-bold">{t("admin.import.ready")}</h3>
                <p className="max-w-[220px] text-[10px]">{t("admin.import.readyHint")}</p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
          <div className="text-[10px] font-bold text-muted-foreground">
            {result ? `${Object.keys(result.data).length} / ${totalFields}` : ""}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-6 py-2 text-sm font-bold transition-colors hover:bg-muted"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!inputText.trim() || (errors.length > 0 && result !== null)}
              onClick={handleDirectImport}
              className="rounded-xl bg-primary px-8 py-2 text-sm font-bold text-white shadow-lg transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {t("admin.import.importToForm")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-bold transition-colors ${
        active ? "bg-primary text-white" : "hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function IssueList({
  tone,
  title,
  issues,
}: {
  tone: "error" | "warning";
  title: string;
  issues: { key: string; message: string }[];
}) {
  const styles =
    tone === "error"
      ? "border-red-100 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
      : "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400";

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold">
        <AlertTriangle className="h-3.5 w-3.5" />
        {title}
      </h3>
      <div className="space-y-1">
        {issues.map((issue, index) => (
          <div key={`${issue.key}-${index}`} className="flex gap-1 text-[10px]">
            <span className="shrink-0 font-mono font-bold" dir="ltr">
              {issue.key}:
            </span>
            <span>{issue.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewValue({ value }: { value: unknown }): React.ReactNode {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-2">
            <span className="mb-1 block text-[9px] font-bold text-muted-foreground">
              #{index + 1}
            </span>
            <PreviewValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <dl className="space-y-1.5">
        {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
          <div key={key} className="grid min-w-0 grid-cols-[minmax(90px,1fr)_minmax(0,2fr)] gap-2">
            <dt className="font-mono font-bold text-foreground">{key}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              <PreviewValue value={nested} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (typeof value === "boolean") return value ? "Yes / Supported" : "No / Not Supported";
  return String(value ?? "");
}
