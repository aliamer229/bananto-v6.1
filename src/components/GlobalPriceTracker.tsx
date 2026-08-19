import React, { useState, useEffect } from "react";
import {
  Globe,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ShoppingCart,
  Tag,
  Check,
  Info,
} from "lucide-react";
import { motion } from "motion/react";
import { useCurrency } from "../context/CurrencyContext";

export interface GlobalPriceTrackerProps {
  productTitle: string;
  gameId?: string;
  compact?: boolean;
}

export interface StorePriceItem {
  storeName: string;
  country: string;
  flag: string;
  type: "digital" | "cartridge" | "code";
  nativePrice: string;
  priceUsd: number;
  priceSar: number;
  discountPercent?: number;
  isLowest?: boolean;
  storeUrl: string;
  inStock: boolean;
  lastUpdated: string;
}

export default function GlobalPriceTracker({
  productTitle,
  compact = false,
}: GlobalPriceTrackerProps) {
  const { formatUSDPrice, currency: activeCurrencyCode, getCurrencyInfo } = useCurrency();
  const activeCurrencyInfo = getCurrencyInfo(activeCurrencyCode);
  const [loading, setLoading] = useState<boolean>(false);
  const [currency, setCurrency] = useState<"SAR" | "USD">("SAR");
  const [pricesData, setPricesData] = useState<{
    stores: StorePriceItem[];
    lowestPriceSar: number;
    lowestPriceUsd: number;
    lowestStoreName: string;
    lowestFlag: string;
    hasLiveKey: boolean;
    query: string;
  } | null>(null);
  const [error, setError] = useState<string>("");

  const fetchPrices = async () => {
    if (!productTitle || !productTitle.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/price-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: productTitle.trim() }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error || errJson.message || "تعذر جلب أسعار المتاجر العالمية حالياً",
        );
      }

      const data = await res.json();
      if (data && typeof data === "object") {
        setPricesData(data);
      } else {
        throw new Error("استجابة غير صالحة من خادم الأسعار");
      }
    } catch (err: any) {
      console.warn("Price Tracker info:", err?.message || err);
      setError(typeof err === "string" ? err : err?.message || "فشل الاتصال بـ PricesAPI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, [productTitle]);

  if (!productTitle) return null;

  return (
    <div
      className={`bg-card rounded-3xl border border-border/80 shadow-sm overflow-hidden ${compact ? "p-4" : "p-6"}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">مقارنة الأسعار العالمية</h3>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                PricesAPI.io
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              متابعة أسعار eShop والمتاجر العالمية المباشرة
            </p>
          </div>
        </div>

        {/* Currency & Actions */}
        <div className="flex items-center gap-2">
          <div className="bg-muted p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
            <button
              onClick={() => setCurrency("SAR")}
              className={`px-3 py-1 rounded-lg transition-all ${currency === "SAR" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              ر.س (SAR)
            </button>
            <button
              onClick={() => setCurrency("USD")}
              className={`px-3 py-1 rounded-lg transition-all ${currency === "USD" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              $ (USD)
            </button>
          </div>

          <button
            onClick={fetchPrices}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
            title="تحديث الأسعار"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !pricesData && (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-foreground">
            جاري البحث في المتاجر العالمية ومزامنة الأسعار...
          </p>
          <span className="text-xs text-muted-foreground mt-1">الاستعلام عبر PricesAPI.io</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Prices Display */}
      {pricesData && (
        <div className="mt-4 space-y-4">
          {/* Best Deal Highlight Card */}
          {pricesData.lowestStoreName && (
            <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 shrink-0">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase text-emerald-700 tracking-wider block">
                    أقل سعر عالمي مكتشف حالياً
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-lg font-black text-foreground">
                      {pricesData.lowestFlag} {pricesData.lowestStoreName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-emerald-200">
                <span className="text-xs text-muted-foreground font-medium">
                  السعر المعادل ({activeCurrencyInfo.code})
                </span>
                <span className="text-xl font-black text-emerald-700">
                  {formatUSDPrice(Number(pricesData.lowestPriceUsd) || 0)}
                </span>
              </div>
            </div>
          )}

          {/* Price Table / Store Grid */}
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted text-muted-foreground font-bold border-b border-border">
                <tr>
                  <th className="py-3 px-4">المتجر والدولة</th>
                  <th className="py-3 px-4">نوع المنتج</th>
                  <th className="py-3 px-4">السعر الأصلي</th>
                  <th className="py-3 px-4">السعر بالسوق المحلي</th>
                  <th className="py-3 px-4 text-center">التوفر والتحديث</th>
                  <th className="py-3 px-4 text-center">الرابط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-foreground">
                {pricesData.stores.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-muted/80 transition-colors ${item.isLowest ? "bg-emerald-50/40" : ""}`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{item.flag}</span>
                        <div>
                          <span className="font-bold text-foreground block">{item.storeName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {item.country}
                          </span>
                        </div>
                        {item.isLowest && (
                          <span className="mr-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            أقل سعر
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          item.type === "digital"
                            ? "bg-purple-50 text-purple-700 border border-purple-100"
                            : item.type === "cartridge"
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}
                      >
                        {item.type === "digital"
                          ? "رقمي eShop"
                          : item.type === "cartridge"
                            ? "شريط فزيائي"
                            : "كود تفعيل"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-muted-foreground">
                      {item.nativePrice}
                      {item.discountPercent && item.discountPercent > 0 && (
                        <span className="mr-1.5 text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold">
                          -{item.discountPercent}%
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-black text-foreground">
                      {formatUSDPrice(Number(item.priceUsd) || 0)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold ${item.inStock ? "text-emerald-600" : "text-muted-foreground"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${item.inStock ? "bg-emerald-500" : "bg-muted"}`}
                        ></span>
                        {item.inStock ? "متوفر" : "غير متوفر"}
                      </span>
                      <span className="block text-[9px] text-muted-foreground mt-0.5">
                        {item.lastUpdated}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <a
                        href={item.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-2 rounded-xl bg-muted hover:bg-foreground hover:text-white text-foreground transition-colors"
                        title="فتح صفحة اللعبة"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer API Info notice */}
          <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-muted-foreground border-t border-border">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              {pricesData.hasLiveKey
                ? "مُتصل بـ API PricesAPI.io المباشر (بيانات أسعار فورية)"
                : "يتم استعلام أسعار eShop والمتاجر عبر مؤشر PricesAPI.io"}
            </span>
            <span className="font-mono text-[10px]">المصدر: pricesapi.io</span>
          </div>
        </div>
      )}
    </div>
  );
}
