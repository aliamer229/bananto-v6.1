import { tr } from "@/i18n";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hub/hooks/useMediaQuery";
import { useState, useRef } from "react";
import { Zap, Gift, CreditCard, Coins, Image as ImageIcon, Copy } from "lucide-react";
import BinanceTopUpSection from "@/components/BinanceTopUpSection";
import { toast } from "sonner";
import { api, fileToDataUrl } from "@/lib/api";

const METHOD_DETAILS: Record<string, { label: string; icon: any; color: string }> = {
  binance: { label: "Binance Pay (فوري)", icon: Zap, color: "bg-amber-400 text-black font-black" },
  banan_code: { label: "كود بنانتو", icon: Gift, color: "bg-emerald-500" },
  zain_cash: { label: "زين كاش", icon: CreditCard, color: "bg-red-600" },
  rafidain: { label: "ماستركارد الرافدين", icon: CreditCard, color: "bg-blue-600" },
  crypto: { label: "عملات رقمية", icon: Coins, color: "bg-amber-500" },
  eshop_card: { label: "Nintendo Gift Card", icon: Gift, color: "bg-red-500" },
};

interface TopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  settings: Record<string, any>;
  onRecharge: (payload: any) => void;
  onConsumeBanan: (code: string) => void;
  isPending: boolean;
}

export function TopUpModal({
  open,
  onOpenChange,
  onSuccess,
  settings,
  onRecharge,
  onConsumeBanan,
  isPending,
}: TopUpModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [method, setMethod] = useState("binance");
  const [amount, setAmount] = useState("");
  const [bananCode, setBananCode] = useState("");
  const [eshopCode, setEshopCode] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nintendoBonusEnabled = settings?.["nintendoBonusEnabled"] !== false;
  const nintendoBonusPercent = Number(settings?.["nintendoBonusPercent"] || 15);
  const usdIqdRate = Number(settings?.["usdExchangeRate"] || 1500);

  const calculateBonus = (usdAmount: number) => {
    if (method !== "eshop_card" || !nintendoBonusEnabled) return 0;
    return (usdAmount * nintendoBonusPercent) / 100;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await api.upload(dataUrl, "wallet-proofs");
      setProofUrl(res.url);
      toast.success("تم رفع صورة الإثبات");
    } catch (err) {
      toast.error("فشل رفع الصورة");
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ للمحفظة");
  };

  const renderContent = () => (
    <div className="p-4 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {Object.entries(METHOD_DETAILS).map(([key, details]) => (
          <button
            key={key}
            onClick={() => setMethod(key)}
            className={`flex flex-col items-center justify-center min-w-[90px] aspect-square rounded-2xl transition-all border-2 ${method === key ? "bg-zinc-900 border-zinc-900 text-white" : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"}`}
          >
            <details.icon
              className={`w-5 h-5 mb-1 ${method === key ? "text-white" : "text-muted-foreground"}`}
            />
            <span className="text-[10px] font-bold text-center px-1">{tr(details.label)}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {method === "binance" ? (
          <BinanceTopUpSection onBalanceUpdated={onSuccess} />
        ) : method === "banan_code" ? (
          <div className="space-y-4">
            <input
              value={bananCode}
              onChange={(e) => setBananCode(e.target.value)}
              placeholder={tr("أدخل كود بنانتو (تعبئة فورية)")}
              className="w-full rounded-xl border border-border px-4 py-3 outline-none focus:ring-2 ring-zinc-900/10 font-mono font-bold"
            />
            <button
              onClick={() => onConsumeBanan(bananCode)}
              disabled={isPending || !bananCode}
              className="w-full bg-zinc-900 text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isPending ? "جاري التفعيل..." : tr("تفعيل الشحن الفوري")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Transfer Info */}
            <div className="bg-muted/30 rounded-2xl p-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">
                  {tr("بيانات التحويل")}
                </span>
                <button
                  onClick={() => {
                    const text =
                      method === "zain_cash"
                        ? settings["zainCashNumber"]
                        : method === "rafidain"
                          ? settings["rafidainNumber"]
                          : settings["cryptoID"];
                    if (text) copyToClipboard(String(text));
                  }}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors text-zinc-900"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="font-mono font-bold text-lg text-center tracking-wider">
                {method === "zain_cash"
                  ? settings["zainCashNumber"]
                  : method === "rafidain"
                    ? settings["rafidainNumber"]
                    : settings["cryptoID"] || "—"}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-bold px-1">
                {method === "zain_cash" || method === "rafidain"
                  ? tr("المبلغ المطلوب شحنه (د.ع)")
                  : tr("المبلغ المطلوب شحنه ($)")}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={method === "zain_cash" || method === "rafidain" ? "25000" : "10.00"}
                className="w-full rounded-xl border border-border px-4 py-3 outline-none focus:ring-2 ring-zinc-900/10 font-black text-xl"
              />
              {method === "eshop_card" && amount && nintendoBonusEnabled && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-600">
                    <span>{tr("عرض خاص: بونص نينتندو")}</span>
                    <span>+{nintendoBonusPercent}%</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground font-bold">
                        {tr("الرصيد الكلي")}
                      </span>
                      <span className="text-sm font-black text-zinc-900">
                        ${(Number(amount) + calculateBonus(Number(amount))).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[9px] text-muted-foreground font-bold">
                        {tr("بالدينار العراقي")}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        {(
                          (Number(amount) + calculateBonus(Number(amount))) *
                          usdIqdRate
                        ).toLocaleString("en-US")}{" "}
                        {tr("IQD")}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {method === "eshop_card" && (
              <div className="space-y-2">
                <label className="text-[12px] font-bold px-1">{tr("كود التفعيل")}</label>
                <input
                  value={eshopCode}
                  onChange={(e) => setEshopCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full rounded-xl border border-border px-4 py-3 outline-none focus:ring-2 ring-zinc-900/10 font-mono font-bold"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[12px] font-bold px-1">
                {tr("إثبات الدفع (صورة التحويل)")}
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-all relative overflow-hidden"
              >
                {proofUrl ? (
                  <img src={proofUrl} alt="Proof" className="w-full h-full object-cover" />
                ) : (
                  <>
                    {isUploading ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-3 border-zinc-900 border-t-transparent" />
                    ) : (
                      <>
                        <ImageIcon className="w-8 h-8 text-muted-foreground mb-1" />
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {tr("اضغط لرفع صورة التحويل")}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
            </div>

            <button
              onClick={() => onRecharge({ amount: Number(amount), method, proofUrl, eshopCode })}
              disabled={isPending || !amount || (method !== "eshop_card" && !proofUrl)}
              className="w-full bg-zinc-900 text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isPending ? "جاري الإرسال..." : tr("إرسال للمراجعة")}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-[2rem]">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-black">{tr("شحن المحفظة")}</DialogTitle>
            <DialogDescription>{tr("اختر طريقة الشحن المناسبة لك")}</DialogDescription>
          </DialogHeader>
          {renderContent()}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[2rem]">
        <DrawerHeader className="text-right p-6 pb-2">
          <DrawerTitle className="text-xl font-black">{tr("شحن المحفظة")}</DrawerTitle>
          <DrawerDescription>{tr("اختر طريقة الشحن المناسبة لك")}</DrawerDescription>
        </DrawerHeader>
        {renderContent()}
      </DrawerContent>
    </Drawer>
  );
}
