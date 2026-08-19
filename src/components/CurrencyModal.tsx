import React, { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../i18n";
import { X, Search, Check, Globe, RefreshCw, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CurrencyModal({ isOpen, onClose }: CurrencyModalProps) {
  const { currency, setCurrency, currencies, usdIqdRate, rates, refreshRates, loading } =
    useCurrency();
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");

  if (!isOpen) return null;

  const filteredCurrencies = currencies.filter(
    (c) =>
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nameAr.includes(searchTerm) ||
      c.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.symbol.includes(searchTerm),
  );

  const primaryCurrencies = currencies.filter((c) => c.isPrimary);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in duration-200">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="bg-card rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-border flex flex-col max-h-[90vh]"
          dir="rtl"
        >
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-card/10 rounded-xl">
                <Globe className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{t("اختيار العملة")}</h2>
                <p className="text-xs text-muted-foreground">{t("اختر عملة العرض المناسبة لك")}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-card/10 text-muted-foreground hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Primary Toggle (IQD & USD) */}
          <div className="p-4 bg-muted border-b border-border shrink-0">
            <span className="text-xs font-bold text-muted-foreground block mb-2">
              {t("العملتان الرئيسيتان:")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {primaryCurrencies.map((c) => {
                const isSelected = currency === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => {
                      setCurrency(c.code);
                      onClose();
                    }}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? "bg-foreground text-white border-border shadow-md ring-2 ring-foreground/20"
                        : "bg-card text-foreground border-border hover:border-border hover:bg-muted/80"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{c.flag}</span>
                      <div className="text-right">
                        <div className="font-bold text-sm leading-tight">{t(c.nameAr)}</div>
                        <div
                          className={`text-[11px] font-mono ${isSelected ? "text-muted-foreground" : "text-muted-foreground"}`}
                        >
                          1$ = {c.code === "IQD" ? `${usdIqdRate.toLocaleString()} د.ع` : "$1.00"}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search bar & Refresh */}
          <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("ابحث عن أي عملة عالمية (SAR, EUR, GBP, ...)")}
                className="w-full bg-muted text-foreground text-xs font-medium rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
              />
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <button
              onClick={refreshRates}
              disabled={loading}
              title="تحديث أسعار الصرف العالمية"
              className="p-2.5 bg-muted text-muted-foreground hover:bg-muted rounded-xl transition-colors shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-foreground" : ""}`} />
            </button>
          </div>

          {/* All Global Currencies List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5 no-scrollbar">
            <span className="text-[11px] font-bold text-muted-foreground block px-1 mb-1">
              {t("جميع العملات العالمية:")}
            </span>
            {filteredCurrencies.map((c) => {
              const isSelected = currency === c.code;
              const rateVsUsd = rates[c.code] || 1;
              return (
                <button
                  key={c.code}
                  onClick={() => {
                    setCurrency(c.code);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-foreground text-white border-border shadow-sm"
                      : "bg-card text-foreground border-border hover:bg-muted hover:border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{c.flag}</span>
                    <div className="text-right">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>{t(c.nameAr)}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSelected ? "bg-foreground text-muted-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {c.code}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] font-mono mt-0.5 ${isSelected ? "text-muted-foreground" : "text-muted-foreground"}`}
                      >
                        {c.code === "IQD"
                          ? `1$ = ${usdIqdRate.toLocaleString()} د.ع`
                          : `1$ = ${rateVsUsd.toFixed(2)} ${c.symbol}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold text-xs ${isSelected ? "text-amber-300" : "text-muted-foreground"}`}
                    >
                      {c.symbol}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                </button>
              );
            })}

            {filteredCurrencies.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {t("لم يتم العثور على عملة بهذه المواصفات")}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="p-3 bg-muted border-t border-border text-center text-[11px] text-muted-foreground shrink-0 flex items-center justify-center gap-1.5 font-mono">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {t("سعر الصرف العراقي الأساسي:")} 1$ = {usdIqdRate.toLocaleString()} {t("د.ع")}
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
