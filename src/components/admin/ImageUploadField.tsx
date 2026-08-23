import React, { useRef, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Link as LinkIcon,
  Check,
  AlertTriangle,
} from "lucide-react";
import { adminApi, fileToDataUrl } from "@/lib/api";
import { cdnImage } from "@/lib/img";
import { validateImageUrlShape } from "@/lib/imageValidation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  placeholder?: string;
  helperText?: string;
  aspect?: "square" | "video" | "cartridge" | "banner" | "auto";
  required?: boolean;
  className?: string;
}

export function ImageUploadField({
  label,
  value,
  onChange,
  folder = "uploads",
  placeholder = "https://... أو اختر صورة من جهازك",
  helperText,
  aspect = "auto",
  required = false,
  className,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
    Is the stored value something a browser can even try to load?

    A field holding `?`, `[object Object]` or a bare filename used to be handed
    straight to `<img src>`. A relative junk value resolves against the current
    page, so the browser fetched the HTML document, failed to decode it as an
    image, and painted its broken-image glyph — the mysterious "?" in all four
    image boxes. The value was never shown, so there was no way to tell a
    broken link from a corrupt one.

    Each field decides this for itself: one bad URL must not affect the other
    three.
  */
  const shape = validateImageUrlShape(value);
  const hasValue = Boolean(value && String(value).trim());
  const canPreview = hasValue && shape.ok && !previewFailed;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error("حجم الصورة كبير جداً (الحد الأقصى 15 ميجابايت)");
      return;
    }

    try {
      setUploading(true);
      const dataUrl = await fileToDataUrl(file);

      // Upload to server storage
      try {
        const res = await adminApi.upload(dataUrl, folder);
        if (res?.url) {
          onChange(res.url);
          toast.success("تم رفع الصورة وتخزينها بنجاح");
        } else {
          // Fallback to data URL if direct upload returns no url
          onChange(dataUrl);
          toast.success("تم تجهيز الصورة بنجاح");
        }
      } catch (uploadErr) {
        console.warn("Server upload fallback to data url:", uploadErr);
        onChange(dataUrl);
        toast.success("تم حفظ الصورة محلياً بنجاح");
      }
    } catch (err) {
      console.error("File read error:", err);
      toast.error("تعذر قراءة ملف الصورة المحدد");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

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
          {showUrlInput ? "إخفاء إدخال الرابط" : "إدخال رابط مباشر"}
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
      />

      <div className="flex flex-wrap items-start gap-3">
        {/* Image Preview & Upload Button */}
        {canPreview ? (
          <div className="relative group rounded-xl overflow-hidden border-2 border-border bg-muted/30 shrink-0">
            <div
              className={cn(
                "overflow-hidden bg-black/5 flex items-center justify-center",
                getAspectClass(),
              )}
            >
              <img
                src={cdnImage(value)}
                alt={label}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  /*
                    Try the raw URL once — `cdnImage` mirrors remote hosts and
                    the mirror can be the thing that is down. Assigning `value`
                    unconditionally, as this used to, re-fired `onError` against
                    the same failing URL forever; the guard makes it one retry,
                    and a second failure switches to the notice below instead of
                    leaving a broken-image glyph on screen.
                  */
                  const img = e.target as HTMLImageElement;
                  const direct = value;
                  if (img.getAttribute("data-retried") !== "1" && img.src !== direct) {
                    img.setAttribute("data-retried", "1");
                    img.src = direct;
                    return;
                  }
                  setPreviewFailed(true);
                }}
              />
            </div>

            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="تغيير الصورة من التخزين"
                className="p-1.5 bg-background/90 text-foreground rounded-lg hover:bg-background transition-colors text-xs font-bold"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
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
        <div className="flex-1 min-w-[200px] space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border bg-background hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ الرفع والتخزين...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {value ? "استبدال الصورة من التخزين" : "رفع صورة من التخزين / الجهاز"}
                  </span>
                </>
              )}
            </button>
            {canPreview && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                <Check className="w-3.5 h-3.5" /> تم تحديد صورة
              </span>
            )}
          </div>

          {/*
            Say what is wrong and show the value, rather than a glyph. The
            offending text is what an admin needs to recognise a bad import
            cell; clearing it is one press.
          */}
          {hasValue && !canPreview && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 space-y-1">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {shape.ok
                  ? "تعذر تحميل الصورة من هذا الرابط"
                  : (shape.issue?.message ?? "قيمة صورة غير صالحة")}
              </p>
              <p
                className="text-[10px] font-mono text-muted-foreground break-all"
                dir="ltr"
                title={String(value)}
              >
                {String(value).slice(0, 160)}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPreviewFailed(false);
                  onChange("");
                }}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
              >
                مسح هذه القيمة
              </button>
            </div>
          )}

          {(showUrlInput || !canPreview) && (
            <div className="relative">
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  setPreviewFailed(false);
                  onChange(e.target.value);
                }}
                placeholder={placeholder}
                className="w-full border border-border focus:border-foreground rounded-lg px-3 py-1.5 text-xs outline-none bg-background text-foreground transition-all"
                dir="ltr"
              />
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
