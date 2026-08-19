import React, { useEffect } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../i18n";
import { useAuth } from "../hooks/useAuth";
import { type Lang } from "../lib/prefs";
import { playSound } from "../utils/audio";
import { X, Check, Globe, Coins } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LanguageCurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LanguageOption {
  code: Lang;
  nativeName: string;
  englishName: string;
  flag: string;
  dir: "rtl" | "ltr";
}

const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    flag: "🇮🇶",
    dir: "rtl",
  },
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    flag: "🇺🇸",
    dir: "ltr",
  },
  {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    flag: "🇹🇷",
    dir: "ltr",
  },
  {
    code: "ku",
    nativeName: "کوردی",
    englishName: "Kurdish",
    flag: "☀️",
    dir: "rtl",
  },
];

export default function LanguageCurrencyModal({ isOpen, onClose }: LanguageCurrencyModalProps) {
  const { currency, setCurrency, currencies } = useCurrency();
  const { t, lang, setLang } = useI18n();
  const { user, updateProfile } = useAuth();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const bottomNav = document.getElementById("app-bottom-nav");
      if (bottomNav) bottomNav.style.display = "none";
    } else {
      document.body.style.overflow = "";
      const bottomNav = document.getElementById("app-bottom-nav");
      if (bottomNav) bottomNav.style.display = "";
    }
    return () => {
      document.body.style.overflow = "";
      const bottomNav = document.getElementById("app-bottom-nav");
      if (bottomNav) bottomNav.style.display = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectLang = (code: Lang) => {
    playSound("bumper_end", 0.6);
    setLang(code);
    if (user) {
      updateProfile.mutate({ settings: { language: code } });
    }
  };

  const handleSelectCurrency = (code: string) => {
    playSound("bumper_end", 0.6);
    setCurrency(code);
  };

  // Only show explicitly defined supported currencies
  const supportedCurrencies = currencies.filter((c) => c.code === "IQD" || c.code === "USD");

  return (
    <AnimatePresence>
      <div
        id="language-currency-modal-backdrop"
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            playSound("bumper_end", 0.4);
            onClose();
          }
        }}
      >
        <motion.div
          id="language-currency-modal-content"
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="bg-card text-card-foreground rounded-t-[32px] sm:rounded-[32px] w-full max-w-lg shadow-2xl flex flex-col border border-border/50 max-h-[90vh] sm:max-h-[85vh] relative overflow-hidden"
          dir={lang === "en" ? "ltr" : "rtl"}
        >
          {/* Header */}
          <div className="relative pt-8 pb-6 px-6 sm:px-8 border-b border-border/40 shrink-0">
            <button
              onClick={() => {
                playSound("bumper_end", 0.4);
                onClose();
              }}
              className="absolute top-6 start-6 w-10 h-10 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors active:scale-95"
              aria-label={t("إغلاق")}
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-foreground/5 flex items-center justify-center text-foreground">
                <Globe className="w-6 h-6 opacity-80" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {t("اللغة والعملة")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("اختر التفضيلات الخاصة بك")}
                </p>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 space-y-8 no-scrollbar">
            {/* Language Section */}
            <section aria-labelledby="lang-section-title">
              <div className="flex items-center gap-2 mb-4 px-1">
                <h3 id="lang-section-title" className="text-base font-bold text-foreground">
                  {t("اللغة")}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUPPORTED_LANGUAGES.map((item) => {
                  const isSelected = lang === item.code;
                  return (
                    <button
                      key={item.code}
                      id={`lang-btn-${item.code}`}
                      type="button"
                      onClick={() => handleSelectLang(item.code)}
                      aria-pressed={isSelected}
                      className={`min-h-[68px] px-5 rounded-[20px] border transition-all flex items-center justify-between text-start active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 ${
                        isSelected
                          ? "bg-foreground text-background border-foreground shadow-lg"
                          : "bg-card hover:bg-muted/40 text-foreground border-border/80 hover:border-foreground/30 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-3xl shrink-0 leading-none">{item.flag}</span>
                        <div className="truncate">
                          <div
                            className={`text-base font-bold leading-snug truncate ${isSelected ? "text-background" : "text-foreground"}`}
                          >
                            {item.nativeName}
                          </div>
                          <div
                            className={`text-xs font-medium truncate ${
                              isSelected ? "text-background/70" : "text-muted-foreground"
                            }`}
                          >
                            {item.englishName}
                          </div>
                        </div>
                      </div>
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-background/20 text-background flex items-center justify-center shrink-0 ms-2">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0 ms-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Currency Section */}
            <section aria-labelledby="currency-section-title">
              <div className="flex items-center gap-2 mb-4 px-1">
                <h3 id="currency-section-title" className="text-base font-bold text-foreground">
                  {t("العملة")}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {supportedCurrencies.map((c) => {
                  const isSelected = currency === c.code;
                  return (
                    <button
                      key={c.code}
                      id={`currency-primary-btn-${c.code}`}
                      type="button"
                      onClick={() => handleSelectCurrency(c.code)}
                      aria-pressed={isSelected}
                      className={`min-h-[72px] px-5 rounded-[20px] border transition-all flex items-center justify-between text-start active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 ${
                        isSelected
                          ? "bg-foreground text-background border-foreground shadow-lg"
                          : "bg-card hover:bg-muted/40 text-foreground border-border/80 hover:border-foreground/30 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isSelected ? "bg-background/10" : "bg-muted text-foreground"}`}
                        >
                          <Coins
                            className={`w-6 h-6 ${isSelected ? "text-background" : "text-muted-foreground"}`}
                          />
                        </div>
                        <div className="truncate">
                          <div
                            className={`text-base font-bold leading-snug truncate ${isSelected ? "text-background" : "text-foreground"}`}
                          >
                            {t(c.nameAr)}
                          </div>
                          <div
                            className={`text-xs font-mono mt-0.5 font-medium truncate ${
                              isSelected ? "text-background/70" : "text-muted-foreground"
                            }`}
                          >
                            {c.code}
                          </div>
                        </div>
                      </div>
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-background/20 text-background flex items-center justify-center shrink-0 ms-2">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0 ms-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
