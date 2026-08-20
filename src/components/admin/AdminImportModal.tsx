import React, { useState } from "react";
import {
  FileUp,
  Clipboard,
  CheckCircle,
  AlertTriangle,
  X,
  Play,
  Loader2,
  Download,
  Eye,
  Table,
  Layers,
} from "lucide-react";
import { parseGameImport } from "../../lib/gameImportParser";
import { downloadTemplateFile } from "@/lib/downloadTemplate";
import { GAME_IMPORT_SCHEMA } from "../../lib/gameImportSchema";
import { getTextValue } from "../../lib/utils";
import { toast } from "sonner";
import { useTranslation } from "../../i18n";
import { cn } from "@/lib/utils";

interface AdminImportModalProps {
  onClose: () => void;
  onImport: (data: any, batch?: any[]) => void;
}

export default function AdminImportModal({ onClose, onImport }: AdminImportModalProps) {
  const { t, dir } = useTranslation();
  const [inputText, setInputText] = useState("");
  const [parseResult, setParseResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [viewMode, setViewMode] = useState<"status" | "preview" | "batch">("status");
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);

  const handleValidate = () => {
    if (!inputText.trim()) {
      toast.error(t("admin.import.emptyInput"));
      return;
    }
    setIsValidating(true);
    // Use setTimeout to allow UI to show loader
    setTimeout(() => {
      try {
        const result = parseGameImport(inputText);
        setParseResult(result);
        if (result.errors.filter((e: any) => e.severity === "error").length === 0) {
          toast.success(t("admin.import.allValid"));
          setViewMode("preview");
        } else {
          toast.error(t("admin.import.failed"));
          setViewMode("status");
        }
      } catch (e: any) {
        toast.error(`${t("admin.import.parseError")}: ${e.message}`);
      } finally {
        setIsValidating(false);
      }
    }, 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
      toast.success(`${t("admin.import.fileLoaded")}: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const renderImportFieldValue = (key: string, value: any): React.ReactNode => {
    if (value == null) return "";
    if (key === "sources" || key === "dataSources") {
      const list = Array.isArray(value) ? value : [value];
      return (
        <div className="flex flex-wrap gap-1">
          {list.map((item, idx) => {
            if (!item) return null;
            const name = getTextValue(item.name || item.source || item.title || item.label || item);
            const url = typeof item === "object" && item.url ? String(item.url) : "";
            if (url) {
              return (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-bold inline-flex items-center gap-0.5"
                >
                  {name || url}
                </a>
              );
            }
            return <span key={idx}>{name}</span>;
          })}
        </div>
      );
    }

    if (key === "dlc" || key === "dlcs") {
      const list = Array.isArray(value) ? value : [value];
      const filtered = list.filter((item) => {
        if (!item) return false;
        const title = getTextValue(item.name || item.title);
        return Boolean(title && title.trim());
      });
      if (filtered.length === 0) return <span className="text-muted-foreground">-</span>;
      return filtered.map((item) => getTextValue(item.name || item.title)).join(", ");
    }

    if (Array.isArray(value)) {
      const texts = value.map((item) => getTextValue(item)).filter(Boolean);
      return texts.join(", ");
    }

    if (typeof value === "object") {
      return getTextValue(value);
    }

    return String(value);
  };

  const totalFields = GAME_IMPORT_SCHEMA.length;
  const detectedFields = parseResult
    ? Object.keys(parseResult.data).length + parseResult.unknownFields.length
    : 0;
  const errors = parseResult?.errors.filter((e: any) => e.severity === "error") || [];
  const warnings = parseResult?.errors.filter((e: any) => e.severity === "warning") || [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-transparent"
      dir={dir}
    >
      <div className="bg-background w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col border border-border animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-lg">
              <FileUp className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold">{t("admin.import.title")}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Input Section */}
          <div className="w-full lg:w-1/2 p-6 border-l border-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Clipboard className="w-3.5 h-3.5" />
                {t("admin.import.pasteOrUpload")}
              </label>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".txt,.md"
                  id="modal-file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label
                  htmlFor="modal-file-upload"
                  className="text-[10px] bg-muted hover:bg-muted/80 px-2 py-1 rounded font-bold cursor-pointer transition-colors"
                >
                  {t("common.uploadFile")}
                </label>
                <button
                  type="button"
                  onClick={() => void downloadTemplateFile("bulk-import-template.txt")}
                  className="text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 px-2 py-1 rounded font-bold cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Download className="w-2.5 h-2.5" />
                  تحميل قالب الدفعة (Batch)
                </button>
                <button
                  type="button"
                  onClick={() => void downloadTemplateFile("nintendo-switch-game-template.txt")}
                  className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded font-bold cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Download className="w-2.5 h-2.5" />
                  قالب منتج واحد
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <textarea
                className="flex-1 w-full border border-border rounded-xl p-3 text-[11px] font-mono bg-muted/20 focus:bg-background outline-none focus:ring-2 ring-primary/20 transition-all resize-none"
                placeholder="[SHARED]&#10;price=25000&#10;platform=switch&#10;&#10;[[PRODUCT]]&#10;name=Game Title&#10;..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <p className="text-[9px] text-muted-foreground leading-tight italic">
                يمكنك استخدام [SHARED] للقيم المشتركة و [[PRODUCT]] للفصل بين الألعاب المتعددة.
              </p>
            </div>
            <button
              disabled={isValidating}
              onClick={handleValidate}
              className="w-full bg-primary text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t("admin.import.validate")}
            </button>
          </div>

          {/* Result Section */}
          <div className="w-full lg:w-1/2 p-6 bg-muted/5 flex flex-col gap-4 overflow-hidden">
            {parseResult ? (
              <>
                <div className="flex gap-2 border-b border-border pb-2">
                  <button
                    onClick={() => setViewMode("status")}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors ${viewMode === "status" ? "bg-primary text-white" : "hover:bg-muted"}`}
                  >
                    <Table className="w-3.5 h-3.5" /> {t("admin.import.dataStatus")}
                  </button>
                  {parseResult.batch && parseResult.batch.length > 1 && (
                    <button
                      onClick={() => setViewMode("batch")}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors ${viewMode === "batch" ? "bg-primary text-white" : "hover:bg-muted"}`}
                    >
                      <Layers className="w-3.5 h-3.5" /> معاينة الدفعة ({parseResult.batch.length})
                    </button>
                  )}
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors ${viewMode === "preview" ? "bg-primary text-white" : "hover:bg-muted"}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> {t("admin.import.fieldPreview")}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {viewMode === "status" ? (
                    <div className="space-y-4">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-background border border-border p-3 rounded-xl shadow-sm">
                          <div className="text-[10px] text-muted-foreground font-bold mb-1 uppercase">
                            {parseResult.batch && parseResult.batch.length > 1
                              ? "عدد الألعاب المكتشفة"
                              : t("admin.import.detectedFields")}
                          </div>
                          <div className="text-xl font-bold">
                            {parseResult.batch && parseResult.batch.length > 1
                              ? parseResult.batch.length
                              : detectedFields}
                          </div>
                        </div>
                        <div className="bg-background border border-border p-3 rounded-xl shadow-sm">
                          <div className="text-[10px] text-muted-foreground font-bold mb-1 uppercase">
                            {t("admin.import.unknownFields")}
                          </div>
                          <div
                            className={`text-xl font-bold ${parseResult.unknownFields.length > 0 ? "text-amber-600" : "text-green-600"}`}
                          >
                            {parseResult.unknownFields.length}
                          </div>
                        </div>
                      </div>

                      {/* Status Messages */}
                      {errors.length > 0 && (
                        <div className="bg-red-50 border border-red-100 p-3 rounded-xl">
                          <h3 className="text-[11px] font-bold text-red-700 flex items-center gap-1.5 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" />{" "}
                            {t("admin.import.errorsTitle")} ({errors.length})
                          </h3>
                          <div className="space-y-1">
                            {errors.map((err: any, idx: number) => (
                              <div key={idx} className="text-[10px] text-red-600 flex gap-1">
                                <span className="font-bold shrink-0">{err.key}:</span>
                                <span>{err.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                          <h3 className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" />{" "}
                            {t("admin.import.warningsTitle")} ({warnings.length})
                          </h3>
                          <div className="space-y-1">
                            {warnings.map((err: any, idx: number) => (
                              <div key={idx} className="text-[10px] text-amber-600 flex gap-1">
                                <span className="font-bold shrink-0">{err.key}:</span>
                                <span>{err.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {parseResult.unknownFields.length > 0 && (
                        <div className="bg-muted p-3 rounded-xl">
                          <h3 className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 mb-2 uppercase">
                            {t("admin.import.unknownFieldsHint")}
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {parseResult.unknownFields.map((f: string, idx: number) => (
                              <span
                                key={idx}
                                className="bg-background px-1.5 py-0.5 rounded border border-border text-[9px] font-mono"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {errors.length === 0 &&
                        warnings.length === 0 &&
                        parseResult.unknownFields.length === 0 && (
                          <div className="bg-green-50 border border-green-100 p-8 rounded-xl flex flex-col items-center justify-center text-center">
                            <CheckCircle className="w-10 h-10 text-green-500 mb-2 opacity-50" />
                            <div className="text-sm font-bold text-green-700">
                              {t("admin.import.allValid")}
                            </div>
                            <p className="text-[10px] text-green-600">
                              {t("admin.import.allValidHint")}
                            </p>
                          </div>
                        )}
                    </div>
                  ) : viewMode === "batch" && parseResult.batch ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-2">
                        {parseResult.batch.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                              selectedBatchIndex === idx
                                ? "bg-primary/5 border-primary shadow-sm"
                                : "bg-background border-border hover:bg-muted/50"
                            )}
                            onClick={() => {
                              setSelectedBatchIndex(idx);
                              setParseResult({ ...parseResult, data: item });
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-xs">
                                {idx + 1}
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-primary truncate max-w-[200px]">
                                  {item.title || "بدون اسم"}
                                </div>
                                <div className="text-[9px] text-muted-foreground font-mono">
                                  {item.price ? `${item.price} IQD` : "بدون سعر"} • {item.game_id ? "مرتبط بالمقايضة" : "غير مرتبط"}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <div className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[8px] font-bold">
                                {item.kind || "account"}
                              </div>
                              {selectedBatchIndex === idx && (
                                <CheckCircle className="w-4 h-4 text-primary" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-background border border-border rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-start text-[10px]">
                        <thead className="bg-muted text-muted-foreground font-bold">
                          <tr>
                            <th className="px-3 py-2 border-b">{t("common.name")}</th>
                            <th className="px-3 py-2 border-b">{t("common.value")}</th>
                            <th className="px-3 py-2 border-b">{t("admin.import.schema")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {Object.entries(parseResult.data).map(([key, value]: [string, any]) => {
                            const fieldDef = GAME_IMPORT_SCHEMA.find((f) => f.target === key);
                            return (
                              <tr key={key} className="hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2 font-bold text-primary">
                                  {fieldDef?.key || key}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[250px] truncate">
                                  {renderImportFieldValue(key, value)}
                                </td>
                                <td className="px-3 py-2 font-mono text-muted-foreground opacity-70">
                                  {key}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full border border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-8 text-muted-foreground text-center">
                <div className="bg-muted p-4 rounded-full mb-4">
                  <Clipboard className="w-10 h-10 opacity-20" />
                </div>
                <h3 className="font-bold text-sm mb-1">{t("admin.import.ready")}</h3>
                <p className="text-[10px] max-w-[200px]">{t("admin.import.readyHint")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30 flex justify-between items-center px-6">
          <div className="text-[10px] text-muted-foreground font-bold">
            {parseResult &&
              (parseResult.batch && parseResult.batch.length > 1
                ? `تم اكتشاف ${parseResult.batch.length} منتج في الدفعة`
                : `${t("admin.import.detectedFields")}: ${Object.keys(parseResult.data).length}`)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl text-sm font-bold hover:bg-muted transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              disabled={!parseResult || errors.length > 0}
              onClick={() => onImport(parseResult.data, parseResult.batch)}
              className="px-8 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-900/10"
            >
              {parseResult?.batch && parseResult.batch.length > 1
                ? "استيراد كافة المنتجات"
                : t("admin.import.importToForm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
