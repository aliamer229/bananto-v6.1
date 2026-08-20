import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { parseGameData } from "@/lib/gameData/parser";
import { validateGameData } from "@/lib/gameData/validator";
import { parseGameImport } from "@/lib/gameImportParser"; // Importing the unified parser
import { GAME_IMPORT_SCHEMA } from "@/lib/gameImportSchema";
import { getTextValue } from "@/lib/utils";
import {
  FileUp,
  Clipboard,
  CheckCircle,
  AlertTriangle,
  Info,
  Play,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";

export const Route = createFileRoute("/admin/import")({
  component: AdminImportPage,
});

function AdminImportPage() {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");

  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<"create" | "update" | "replace">("create");

  const handleValidate = () => {
    if (!inputText.trim()) {
      toast.error("الرجاء إدخال البيانات أولاً.");
      return;
    }
    setIsValidating(true);
    try {
      // Use the new deterministic parser for consistency with AdminImportModal
      const parsedImport = parseGameImport(inputText);

      // Still allow the legacy structured parser if it's in the old [SECTION] format
      // but prefer the field=value standard
      let parsed;
      if (inputText.includes("[GAME]")) {
        const legacyData = parseGameData(inputText);
        parsed = { data: legacyData, errors: [] };
      } else {
        // Map the new flat format to the legacy nested format expected by validateGameData and mapper.ts
        const flat = parsedImport.data;
        const legacyData = {
          IMPORT: { schema_version: 1 },
          GAME: {
            name: flat.title || flat.name,
            platform: flat.platform,
            release_status: flat.release_status || "RELEASED",
            edition: flat.edition,
            region: flat.region,
            publisher: flat.publisher,
            developer: flat.developer,
            release_date: flat.release_date,
            game_is_offline: flat.game_is_offline,
            game_is_online: flat.game_is_online,
            game_language_locked: flat.game_language_locked,
          },
          DESCRIPTION: {
            full: flat.description_en,
            ar: flat.description_ar,
            short: flat.description_short,
          },
          MEDIA: {
            box_front_url: flat.cover_front_url || flat.box_front_url,
            box_back_url: flat.cover_back_url || flat.box_back_url,
            trailer_url: flat.trailer_url,
          },
          TECHNICAL: {
            nsuid: flat.nsuid,
            title_id: flat.title_id,
            product_code: flat.product_code,
          },
        };
        parsed = { data: legacyData, errors: parsedImport.errors.map((e) => e.message) };
      }

      const validated = validateGameData(parsed.data);

      // Merge parser errors
      validated.errors = [
        ...parsed.errors.map((e: string | any) => ({
          section: "PARSER",
          message: typeof e === "string" ? e : e.message,
          severity: "error" as const,
        })),
        ...validated.errors,
      ];

      setValidationResult(validated);
      if (validated.valid) {
        toast.success("تم التحقق من البيانات بنجاح.");
      } else {
        toast.error("يوجد أخطاء في البيانات.");
      }
    } catch (e: any) {
      toast.error(`خطأ أثناء التحليل: ${e.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
      toast.success(`تم تحميل ملف: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!validationResult || !validationResult.valid) return;

    setIsImporting(true);
    try {
      const res = await adminApi.importGame(validationResult.data, importMode);
      if (res.success) {
        toast.success("تم استيراد اللعبة بنجاح!");
        // Clear or redirect
        void navigate({ to: `/admin` });
      } else {
        toast.error("فشل الاستيراد.");
      }
    } catch (e: any) {
      toast.error(`خطأ أثناء الاستيراد: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="w-full p-6 min-h-screen bg-background" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileUp className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            استيراد بيانات الألعاب (Deterministic)
          </h1>
        </div>
        <button
          onClick={() => navigate({ to: "/admin" })}
          className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input */}
        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold flex items-center gap-2">
                <Clipboard className="w-4 h-4" />
                لصق النص أو رفع ملف
              </label>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".txt,.md"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label
                  htmlFor="file-upload"
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  رفع ملف (.txt, .md)
                </label>
              </div>
            </div>
            <textarea
              className="w-full h-[500px] border rounded-lg p-3 text-xs font-mono bg-muted/30 focus:bg-background transition-colors outline-none focus:ring-2 ring-primary/20"
              placeholder="[IMPORT]&#10;schema_version=1&#10;&#10;[GAME]&#10;name=Splatoon Raiders&#10;platform=Nintendo Switch 2&#10;..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="mt-4 flex gap-3">
              <button
                disabled={isValidating}
                onClick={handleValidate}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                تحقق من البيانات (Validate)
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results & Preview */}
        <div className="space-y-4">
          {!validationResult ? (
            <div className="bg-card border border-dashed rounded-xl h-full flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Info className="w-12 h-12 mb-4 opacity-20" />
              <p>قم بلصق البيانات والضغط على تحقق للعرض.</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              {/* Stats Card */}
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  ملخص التحقق
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-muted/50 p-2 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase">الحالات</p>
                    <p
                      className={`text-lg font-bold ${validationResult.valid ? "text-green-500" : "text-red-500"}`}
                    >
                      {validationResult.valid ? "صالح" : "غير صالح"}
                    </p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase">الأقسام</p>
                    <p className="text-lg font-bold">{Object.keys(validationResult.data).length}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase">الأخطاء</p>
                    <p className="text-lg font-bold text-red-500">
                      {validationResult.errors.filter((e: any) => e.severity === "error").length}
                    </p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase">الحقول</p>
                    <p className="text-lg font-bold">...</p>
                  </div>
                </div>
              </div>

              {/* Errors List */}
              {validationResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <h3 className="text-red-700 font-bold mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    المشكلات المكتشفة ({validationResult.errors.length})
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {validationResult.errors.map((error: any, i: number) => (
                      <div
                        key={i}
                        className="text-xs bg-white/50 p-2 rounded border border-red-200"
                      >
                        <span className="font-bold">[{error.section}]</span>{" "}
                        {error.field ? `Field "${error.field}": ` : ""}
                        {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview List */}
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="font-bold mb-3">معاينة البيانات</h3>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {Object.entries(validationResult.data).map(([section, fields]: [string, any]) => (
                    <div key={section} className="border-b last:border-0 pb-4">
                      <h4 className="text-xs font-bold text-primary mb-2 uppercase">{section}</h4>
                      <div className="grid grid-cols-1 gap-1">
                        {Object.entries(fields).map(([key, val]: [string, any]) => {
                          let displayContent: React.ReactNode;
                          if (val == null) {
                            displayContent = "";
                          } else if (key === "sources" || key === "dataSources") {
                            const list = Array.isArray(val) ? val : [val];
                            displayContent = (
                              <span className="flex flex-wrap gap-1">
                                {list.map((item: any, idx: number) => {
                                  if (!item) return null;
                                  const name = getTextValue(
                                    item.name || item.source || item.title || item.label || item,
                                  );
                                  const url =
                                    typeof item === "object" && item.url ? String(item.url) : "";
                                  if (url) {
                                    return (
                                      <a
                                        key={idx}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-bold"
                                      >
                                        {name || url}
                                      </a>
                                    );
                                  }
                                  return <span key={idx}>{name}</span>;
                                })}
                              </span>
                            );
                          } else if (key === "dlc" || key === "dlcs") {
                            const list = Array.isArray(val) ? val : [val];
                            const filtered = list.filter((item: any) => {
                              if (!item) return false;
                              const title = getTextValue(item.name || item.title);
                              return Boolean(title && title.trim());
                            });
                            displayContent =
                              filtered.length > 0
                                ? filtered
                                    .map((item: any) => getTextValue(item.name || item.title))
                                    .join(", ")
                                : "-";
                          } else if (Array.isArray(val)) {
                            const texts = val
                              .map((item: any) => getTextValue(item))
                              .filter(Boolean);
                            displayContent = texts.join(", ");
                          } else if (typeof val === "object") {
                            displayContent = getTextValue(val);
                          } else {
                            displayContent = String(val);
                          }

                          return (
                            <div key={key} className="flex text-[11px] gap-2">
                              <span className="text-muted-foreground w-1/3 truncate">{key}:</span>
                              <span className="font-medium flex-1 truncate">{displayContent}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Import Action */}
              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-3">
                <div className="flex gap-2">
                  <select
                    className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as any)}
                  >
                    <option value="create">إنشاء لعبة جديدة (Create New)</option>
                    <option value="update">تحديث لعبة موجودة (Update Existing)</option>
                    <option value="replace">استبدال كامل للبيانات (Full Replace)</option>
                  </select>
                </div>
                <button
                  disabled={!validationResult.valid || isImporting}
                  onClick={handleImport}
                  className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50 shadow-lg shadow-green-900/10"
                >
                  {isImporting ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    "بدء الاستيراد النهائي (Import)"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
