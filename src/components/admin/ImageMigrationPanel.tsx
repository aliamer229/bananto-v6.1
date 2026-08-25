import React, { useState, useEffect } from "react";
import {
  Image,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
  Database,
  Cloud,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface MigrationState {
  status: "idle" | "running" | "completed" | "error";
  lastRunAt: string;
  totalProducts: number;
  processedProducts: number;
  totalConverted: number;
  totalFailed: number;
  cursor: number;
  errors: string[];
}

export function ImageMigrationPanel() {
  const [loading, setLoading] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(25);
  const [data, setData] = useState<{
    state: MigrationState;
    totalProductsInStore: number;
    productsNeedingMigration: number;
    totalImagesNeedingMigration: number;
  } | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/migrate-images");
      if (!res.ok) throw new Error("فشل استرجاع حالة الترحيل");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const runBatch = async (reset = false) => {
    try {
      setRunningBatch(true);
      const res = await fetch("/api/admin/migrate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize, reset }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "فشل تنفيذ حزمة الترحيل");
      }

      const result = await res.json();
      toast.success(
        `تمت معالجة ${result.batchProcessed} منتج وتحويل ${result.batchConverted} صورة بنجاح.`
      );
      await fetchStatus();

      if (autoRun && !result.isComplete) {
        setTimeout(() => runBatch(false), 500);
      } else if (result.isComplete) {
        setAutoRun(false);
        toast.success("اكتمل ترحيل جميع صور المنتجات إلى WebP بنجاح!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "حدث خطأ أثناء معالجة الصور");
      setAutoRun(false);
    } finally {
      setRunningBatch(false);
    }
  };

  const state = data?.state;
  const progressPercent =
    data?.totalProductsInStore && state
      ? Math.min(100, Math.round((state.cursor / data.totalProductsInStore) * 100))
      : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Image className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                نظام صور المنتجات — ترحيل وتحويل شامل إلى WebP
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              معالجة دفعية مستمرة لكافة صور المتجر، تحويلها إلى WebP فائق الجودة، ورفعها مباشرة إلى
              Cloudflare R2 مع التحقق الآمن من المراجع ومنع التكرار.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchStatus()}
              disabled={loading || runningBatch}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث الحالة"}
            </button>
          </div>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>إجمالي منتجات المتجر</span>
              <Database className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-foreground">
              {data?.totalProductsInStore ?? 0}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>منتجات بانتظار التحويل</span>
              <Layers className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400">
              {data?.productsNeedingMigration ?? 0}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>صور تم تحويلها بنجاح</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {state?.totalConverted ?? 0}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>تخزين السحابة (R2)</span>
              <Cloud className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xs font-bold text-foreground pt-1">
              منع التكرار + فحص SHA-256
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>التقدم الإجمالي: {progressPercent}%</span>
            <span>
              تم فحص {state?.cursor ?? 0} من {data?.totalProductsInStore ?? 0} منتج
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>حجم الدفعة:</span>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground font-bold outline-none"
              >
                <option value={10}>10 منتجات</option>
                <option value={25}>25 منتج (موصى به)</option>
                <option value={50}>50 منتج</option>
                <option value={100}>100 منتج</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground font-bold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun(e.target.checked)}
                className="rounded border-border"
              />
              <span>تشغيل دفعي مستمر وتلقائي حتى الانتهاء</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runBatch(true)}
              disabled={runningBatch}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة البدء من الصفر</span>
            </button>

            <button
              onClick={() => runBatch(false)}
              disabled={runningBatch}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 transition-all shadow-xs"
            >
              {runningBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ المعالجة والتحويل...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>بدء / متابعة ترحيل الدفعة</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Safety & Protocol Guarantees */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          ضمانات الأمان وتسلسل الترحيل الذكي
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-500" />
              تسلسل: Convert → Upload → Verify
            </p>
            <p>
              يتم تحويل الصورة الأصلية ورفعها إلى R2 والتأكد من وجودها بنسبة 100% قبل تحديث قاعدة البيانات،
              ولا يتم حذف الملف الأصلي إلا بعد اكتمال التحقق المزدوج.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              فحص المراجع المتقاطعة
            </p>
            <p>
              إذا كانت هناك صورة قديمة مشتركة بين أكثر من منتج أو حقل، يتم التحقق أولاً من عدم استخدام أي
              منتج آخر لنفس الملف قبل تنفيذ عملية الحذف.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-purple-500" />
              منع التكرار بهش المحتوى
            </p>
            <p>
              يتم احتساب بصمة SHA-256 لمحتوى الصورة المعالجة. في حال تكرار نفس الصورة، تتم إعادة استخدام نفس
              الكائن في R2 دون استهلاك مساحة إضافية.
            </p>
          </div>
        </div>

        {/* Errors Log if any */}
        {state?.errors && state.errors.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span>ملاحظات المعالجة والتنبيهات غير الحرجة ({state.errors.length}):</span>
            </div>
            <ul className="text-[11px] font-mono text-muted-foreground space-y-1 max-h-36 overflow-y-auto" dir="ltr">
              {state.errors.map((err, i) => (
                <li key={i} className="truncate">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
