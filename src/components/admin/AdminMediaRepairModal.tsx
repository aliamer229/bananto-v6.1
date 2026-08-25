import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  X,
  Play,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface MediaStatusResponse {
  success: boolean;
  totalProducts: number;
  productsWithExternalMedia: number;
  totalExternalImages: number;
  totalStoredImages: number;
  failedAuditRecords: number;
  pendingProducts: Array<{
    id: string;
    title: string;
    externalFields: string[];
  }>;
}

interface RepairLogItem {
  productId: string;
  title: string;
  successCount: number;
  failedCount: number;
}

interface AdminMediaRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshProducts?: () => void;
}

export function AdminMediaRepairModal({
  isOpen,
  onClose,
  onRefreshProducts,
}: AdminMediaRepairModalProps) {
  const [statusData, setStatusData] = useState<MediaStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairLogs, setRepairLogs] = useState<RepairLogItem[]>([]);
  const [repairedCount, setRepairedCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch("/api/admin/media/status", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusData(data);
      }
    } catch (err) {
      console.error("Failed to load media status:", err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setRepairLogs([]);
      setRepairedCount(0);
    }
  }, [isOpen, fetchStatus]);

  const handleStartRepair = async () => {
    setIsRepairing(true);
    let keepGoing = true;
    let totalDone = 0;

    try {
      while (keepGoing) {
        const res = await fetch("/api/admin/media/repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ batchSize: 8 }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error(data?.error || "حدث خطأ أثناء فحص وإصلاح الصور");
          break;
        }

        if (data.processed === 0 || !data.details || data.details.length === 0) {
          keepGoing = false;
          toast.success("تم الانتهاء من فحص وتخزين جميع الوسائط الخارجية بنجاح!");
          break;
        }

        totalDone += data.repaired;
        setRepairedCount(totalDone);
        setRepairLogs((prev) => [...data.details, ...prev].slice(0, 100));

        if (data.remaining === 0) {
          keepGoing = false;
          toast.success("اكتمل فحص وتخزين جميع الصور في السحابة!");
          break;
        }

        // Brief delay between batches to keep edge responsive
        await new Promise((r) => setTimeout(r, 400));
      }

      await fetchStatus();
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      toast.error(`فشل مسار الإصلاح: ${err?.message || err}`);
    } finally {
      setIsRepairing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-card text-card-foreground border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">فحص وإصلاح الوسائط الخارجية</h3>
              <p className="text-xs text-muted-foreground">
                تنزيل الصور الخارجية وحفظها كـ WebP دائم في التخزين السحابي (R2)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRepairing}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">المنتجات بروابط خارجية</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-black text-amber-500">
                  {isLoadingStatus ? "..." : statusData?.productsWithExternalMedia ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">منتج</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">صور مخزنة محلياً (R2)</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-black text-emerald-500">
                  {isLoadingStatus ? "..." : statusData?.totalStoredImages ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">صورة</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">إجمالي صور المنتجات</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-black text-foreground">
                  {isLoadingStatus
                    ? "..."
                    : (statusData?.totalStoredImages ?? 0) + (statusData?.totalExternalImages ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">صورة</span>
              </div>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground">عزل أخطاء الوسائط: </span>
              النظام يقوم بتنزيل الروابط الخارجية وتخزينها بصيغة WebP مع إعادة المحاولة التلقائية عند
              حدوث 503 أو قيود المزود. في حال تعذر تنزيل صورة معينة، يتم الحفاظ على بيانات اللعبة كاملة
              دون إلغاء استيرادها.
            </div>
          </div>

          {/* Pending Products List */}
          {statusData && statusData.pendingProducts.length > 0 && !isRepairing && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground">
                عينة من المنتجات التي تحتوي على روابط خارجية بحاجة لتخزين:
              </span>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border text-xs">
                {statusData.pendingProducts.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-muted/30">
                    <span className="font-medium truncate max-w-xs">{p.title}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {p.externalFields.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Repair Logs */}
          {repairLogs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span>سجل الإصلاح المباشر:</span>
                <span className="text-primary">{repairLogs.length} عملية</span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border text-xs bg-muted/20">
                {repairLogs.map((log, idx) => (
                  <div key={`${log.productId}-${idx}`} className="p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      {log.successCount > 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate">{log.title}</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                      تم حفظ: {log.successCount} | معلق: {log.failedCount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between">
          <button
            onClick={fetchStatus}
            disabled={isLoadingStatus || isRepairing}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? "animate-spin" : ""}`} />
            تحديث الإحصائيات
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isRepairing}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted transition-colors"
            >
              إغلاق
            </button>
            <button
              onClick={handleStartRepair}
              disabled={
                isRepairing ||
                isLoadingStatus ||
                (statusData?.productsWithExternalMedia ?? 0) === 0
              }
              className="px-5 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
            >
              {isRepairing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جارٍ التنزيل والتخزين السحابي...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  بدء إصلاح وتخزين الوسائط
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
