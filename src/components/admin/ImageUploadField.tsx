import React, { useRef, useState, useEffect } from "react";
import {
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Link as LinkIcon,
  Check,
  AlertTriangle,
  DownloadCloud,
  ExternalLink,
  RefreshCw,
  CloudCheck,
  Globe,
} from "lucide-react";
import { cdnImage } from "@/lib/img";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  productId?: string;
  imageType?: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  placeholder?: string;
  helperText?: string;
  aspect?: "square" | "video" | "cartridge" | "banner" | "auto";
  required?: boolean;
  className?: string;
  error?: string;
  errorDetail?: string;
}

export function ImageUploadField({
  productId,
  imageType,
  label,
  value,
  onChange,
  folder = "products",
  placeholder = "https://... أو اختر صورة من جهازك",
  helperText,
  aspect = "auto",
  required = false,
  className,
  error: externalError,
  errorDetail: externalErrorDetail,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [importingRemote, setImportingRemote] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [browserImgError, setBrowserImgError] = useState(false);
  const [localImportError, setLocalImportError] = useState<string | null>(null);
  const [lastImportedUrl, setLastImportedUrl] = useState<string | null>(null);
  const [justImported, setJustImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanVal = (value || "").trim();
  const hasValue = Boolean(cleanVal);
  const isStoredUrl = hasValue && (cleanVal.startsWith("/api/files/") || cleanVal.includes("/files/"));
  const isRemoteUrl = hasValue && (cleanVal.startsWith("http://") || cleanVal.startsWith("https://"));

  // Reset browser image error state when value changes
  useEffect(() => {
    setBrowserImgError(false);
    setLocalImportError(null);
    setJustImported(false);
  }, [value]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setLocalImportError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);
      if (productId) formData.append("productId", productId);
      if (imageType) formData.append("imageType", imageType);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "فشل رفع الصورة إلى التخزين السحابي");
      }

      const res = await response.json();
      if (res?.url) {
        onChange(res.url);
        setBrowserImgError(false);
        setLocalImportError(null);
        setJustImported(true);
        toast.success("تم رفع الصورة وتحويلها إلى WebP بنجاح");
      } else {
        toast.error("فشل رفع الصورة: لم يتم إرجاع رابط.");
      }
    } catch (err: any) {
      console.error("File upload error:", err);
      const msg = err?.message || "تعذر إكمال الرفع";
      setLocalImportError(msg);
      toast.error("فشل رفع الصورة: " + msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImportRemoteUrl = React.useCallback(async (urlToImport: string) => {
    if (!urlToImport || urlToImport.startsWith("/api/files/") || urlToImport.includes("/files/")) return;
    try {
      setImportingRemote(true);
      setLocalImportError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: urlToImport,
          folder,
          productId,
          imageType,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const res = await response.json().catch(() => ({}));

      if (!response.ok || !res?.url) {
        const errMsg = res?.error || "تعذر تنزيل الصورة وتحويلها إلى WebP من المصدر الخارجي";
        setLocalImportError(errMsg);
        toast.error(`فشل استيراد الرابط: ${errMsg}`);
        return;
      }

      // Success: update value to the permanent R2 stored URL
      onChange(res.url);
      setBrowserImgError(false);
      setLocalImportError(null);
      setJustImported(true);
      toast.success("تم استيراد الصورة وتحويلها إلى WebP وحفظها في التخزين السحابي (R2)");
    } catch (err: any) {
      console.error("Remote import error:", err);
      const errMsg = err?.name === "AbortError" ? "انتهت مهلة الاتصال بالخادم الخارجي (Timeout)" : (err?.message || "حدث خطأ أثناء الاتصال بالخادم");
      setLocalImportError(errMsg);
      toast.error(`فشل استيراد الرابط: ${errMsg}`);
    } finally {
      setImportingRemote(false);
    }
  }, [folder, productId, imageType, onChange]);

  useEffect(() => {
    if (isRemoteUrl && !isStoredUrl && cleanVal !== lastImportedUrl && !importingRemote && !justImported && !localImportError) {
      const timer = setTimeout(() => {
        setLastImportedUrl(cleanVal);
        handleImportRemoteUrl(cleanVal);
      }, 750);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [cleanVal, isRemoteUrl, isStoredUrl, importingRemote, justImported, localImportError, lastImportedUrl, handleImportRemoteUrl]);

  const getAspectClass = () => {
    switch (aspect) {
      case "square":
        return "aspect-square w-28";
      case "cartridge":
        return "aspect-[3/4] w-24";
      case "banner":
        return "aspect-[21/9] w-full max-w-sm";
      case "video":
        return "aspect-video w-48";
      default:
        return "w-28 h-28";
    }
  };

  const displayError = localImportError || externalError;
  const displayErrorDetail = externalErrorDetail;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-foreground">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <LinkIcon className="w-3 h-3" />
          {showUrlInput ? "إخفاء إدخال الرابط" : "إدخال / تعديل الرابط"}
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,.heic,.heif,.avif,.webp,.png,.jpg,.jpeg,.bmp,.tiff"
        className="hidden"
      />

      <div className="flex flex-wrap items-start gap-3">
        {/* Image Preview & Upload Button */}
        {hasValue ? (
          <div className="relative group rounded-xl overflow-hidden border-2 border-border bg-muted/30 shrink-0">
            <div
              className={cn(
                "overflow-hidden bg-black/5 flex items-center justify-center relative",
                getAspectClass(),
              )}
            >
              {!browserImgError ? (
                <img
                  src={cdnImage(cleanVal)}
                  alt={label}
                  className={cn("w-full h-full object-contain", importingRemote && "opacity-50")}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.getAttribute("data-retried") !== "1" && img.src !== cleanVal) {
                      img.setAttribute("data-retried", "1");
                      img.src = cleanVal;
                      return;
                    }
                    // External CDN may block direct hotlinking in browser iframe; do not break field value!
                    setBrowserImgError(true);
                  }}
                />
              ) : importingRemote ? (
                <div className="p-3 text-center flex flex-col items-center justify-center gap-1 text-muted-foreground h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="p-3 text-center flex flex-col items-center justify-center gap-1 text-muted-foreground h-full">
                  <Globe className="w-6 h-6 text-muted-foreground/60" />
                  <span className="text-[10px] font-medium leading-tight">
                    رابط خارجي
                  </span>
                  <span className="text-[9px] text-muted-foreground/80 leading-tight">
                    {localImportError ? "فشل الاستيراد" : "(جار الاستيراد...)"}
                  </span>
                </div>
              )}
              {importingRemote && !browserImgError && (
                 <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px]">
                   <Loader2 className="w-6 h-6 animate-spin text-blue-600 drop-shadow-md" />
                 </div>
              )}
            </div>

            {/* Hover Actions Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="تغيير الصورة من الجهاز"
                className="p-1.5 bg-background/90 text-foreground rounded-lg hover:bg-background transition-colors text-xs font-bold"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setLocalImportError(null);
                  setBrowserImgError(false);
                }}
                title="حذف الصورة"
                className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "border-2 border-dashed border-border hover:border-foreground/50 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-all bg-muted/20 hover:bg-muted/40 p-4 shrink-0 cursor-pointer",
              getAspectClass(),
            )}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-foreground" />
            ) : (
              <>
                <div className="p-2 rounded-full bg-background border border-border shadow-xs">
                  <Upload className="w-4 h-4 text-foreground" />
                </div>
                <span className="text-[11px] font-bold text-center leading-tight">
                  رفع من الجهاز
                </span>
              </>
            )}
          </button>
        )}

        {/* Upload Status / Quick Actions */}
        <div className="flex-1 min-w-[220px] space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border bg-background hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ الرفع والتحويل إلى WebP...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {hasValue ? "استبدال الصورة من الجهاز" : "رفع من الجهاز (WebP تلقائي)"}
                  </span>
                </>
              )}
            </button>

            {isRemoteUrl && (
              <button
                type="button"
                onClick={() => handleImportRemoteUrl(cleanVal)}
                disabled={importingRemote}
                title="تنزيل الصورة بالسيرفر وتحويلها لـ WebP وتخزينها في R2 بشكل دائم"
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-500/40 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                {importingRemote ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جارٍ الاستيراد إلى السحابة...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-3.5 h-3.5" />
                    <span>استيراد إلى السحابة (WebP)</span>
                  </>
                )}
              </button>
            )}

            {isStoredUrl && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md border border-emerald-500/20">
                <Check className="w-3.5 h-3.5" />
                سحابي R2 {cleanVal.endsWith(".webp") && "(WebP)"}
              </span>
            )}

            {isRemoteUrl && !isStoredUrl && (
              <span className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md border border-blue-500/20">
                <Globe className="w-3 h-3" />
                رابط خارجي
              </span>
            )}
          </div>

          {/* Diagnostic Error Box (shown only when import/upload actually fails) */}
          {displayError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 space-y-1.5">
              <p className="text-[11px] font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{displayError}</span>
              </p>
              {displayErrorDetail && (
                <p
                  className="text-[10px] font-mono text-muted-foreground break-all"
                  dir="ltr"
                  title={displayErrorDetail}
                >
                  {displayErrorDetail}
                </p>
              )}
              {isRemoteUrl && (
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleImportRemoteUrl(cleanVal)}
                    disabled={importingRemote}
                    className="text-[11px] font-bold text-red-700 dark:text-red-300 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    إعادة محاولة الاستيراد
                  </button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setLocalImportError(null);
                    }}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    مسح الرابط
                  </button>
                </div>
              )}
            </div>
          )}

          {/* URL Input Box */}
          {(showUrlInput || !hasValue || isRemoteUrl) && (
            <div className="relative space-y-1">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setLastImportedUrl(null);
                    setLocalImportError(null);
                    setBrowserImgError(false);
                    onChange(e.target.value);
                  }}
                  placeholder={placeholder}
                  className="w-full border border-border focus:border-foreground rounded-lg px-3 py-1.5 text-xs outline-none bg-background text-foreground transition-all pr-8"
                  dir="ltr"
                />
                {hasValue && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setLocalImportError(null);
                      setBrowserImgError(false);
                    }}
                    className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5"
                    title="مسح"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {helperText && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{helperText}</p>
          )}
        </div>
      </div>
    </div>
  );
}

