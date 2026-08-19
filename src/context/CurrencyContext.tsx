import React, { createContext, useContext, useState, useEffect } from "react";

export interface CurrencyInfo {
  code: string;
  symbol: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  isPrimary?: boolean;
  decimals?: number;
}

export const KNOWN_CURRENCIES: CurrencyInfo[] = [
  {
    code: "IQD",
    symbol: "د.ع",
    nameAr: "دينار عراقي",
    nameEn: "Iraqi Dinar",
    flag: "🇮🇶",
    isPrimary: true,
    decimals: 0,
  },
  {
    code: "USD",
    symbol: "$",
    nameAr: "دولار أمريكي",
    nameEn: "US Dollar",
    flag: "🇺🇸",
    isPrimary: true,
    decimals: 2,
  },
  {
    code: "SAR",
    symbol: "ر.س",
    nameAr: "ريال سعودي",
    nameEn: "Saudi Riyal",
    flag: "🇸🇦",
    decimals: 2,
  },
  { code: "EUR", symbol: "€", nameAr: "يورو", nameEn: "Euro", flag: "🇪🇺", decimals: 2 },
  {
    code: "GBP",
    symbol: "£",
    nameAr: "جنيه إسترليني",
    nameEn: "British Pound",
    flag: "🇬🇧",
    decimals: 2,
  },
  {
    code: "AED",
    symbol: "د.إ",
    nameAr: "درهم إماراتي",
    nameEn: "UAE Dirham",
    flag: "🇦🇪",
    decimals: 2,
  },
  {
    code: "KWD",
    symbol: "د.ك",
    nameAr: "دينار كويتي",
    nameEn: "Kuwaiti Dinar",
    flag: "🇰🇼",
    decimals: 3,
  },
  {
    code: "BHD",
    symbol: "د.ب",
    nameAr: "دينار بحريني",
    nameEn: "Bahraini Dinar",
    flag: "🇧🇭",
    decimals: 3,
  },
  {
    code: "OMR",
    symbol: "ر.ع",
    nameAr: "ريال عماني",
    nameEn: "Omani Rial",
    flag: "🇴🇲",
    decimals: 3,
  },
  {
    code: "QAR",
    symbol: "ر.ق",
    nameAr: "ريال قطري",
    nameEn: "Qatari Riyal",
    flag: "🇶🇦",
    decimals: 2,
  },
  {
    code: "EGP",
    symbol: "ج.م",
    nameAr: "جنيه مصري",
    nameEn: "Egyptian Pound",
    flag: "🇪🇬",
    decimals: 2,
  },
  {
    code: "TRY",
    symbol: "₺",
    nameAr: "ليرة تركية",
    nameEn: "Turkish Lira",
    flag: "🇹🇷",
    decimals: 2,
  },
  {
    code: "JOD",
    symbol: "د.أ",
    nameAr: "دينار أردني",
    nameEn: "Jordanian Dinar",
    flag: "🇯🇴",
    decimals: 3,
  },
  {
    code: "CAD",
    symbol: "CA$",
    nameAr: "دولار كندي",
    nameEn: "Canadian Dollar",
    flag: "🇨🇦",
    decimals: 2,
  },
  {
    code: "AUD",
    symbol: "AU$",
    nameAr: "دولار أسترالي",
    nameEn: "Australian Dollar",
    flag: "🇦🇺",
    decimals: 2,
  },
  {
    code: "JPY",
    symbol: "¥",
    nameAr: "ين ياباني",
    nameEn: "Japanese Yen",
    flag: "🇯🇵",
    decimals: 0,
  },
];

const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  IQD: 1320,
  SAR: 3.75,
  EUR: 0.92,
  GBP: 0.78,
  AED: 3.67,
  KWD: 0.306,
  BHD: 0.376,
  OMR: 0.385,
  QAR: 3.64,
  EGP: 48.5,
  TRY: 32.8,
  JOD: 0.709,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

interface CurrencyContextType {
  currency: string;
  setCurrency: (code: string) => void;
  usdIqdRate: number;
  rates: Record<string, number>;
  currencies: CurrencyInfo[];
  convertFromIQD: (iqdAmount: number, targetCurrency?: string) => number;
  convertFromUSD: (usdAmount: number, targetCurrency?: string) => number;
  formatIQDPrice: (iqdAmount: number, targetCurrency?: string) => string;
  formatUSDPrice: (usdAmount: number, targetCurrency?: string) => string;
  formatGenericPrice: (price: number | string, targetCurrency?: string) => string;
  getCurrencyInfo: (code: string) => CurrencyInfo;
  loading: boolean;
  refreshRates: () => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>("IQD");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("app_currency");
      if (saved) setCurrencyState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const [usdIqdRate, setUsdIqdRate] = useState<number>(1320);
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
  const [loading, setLoading] = useState<boolean>(true);

  const setCurrency = (code: string) => {
    setCurrencyState(code);
    try {
      localStorage.setItem("app_currency", code);
    } catch {
      /* storage unavailable */
    }
  };

  const fetchExchangeRates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/exchange-rates");
      if (res.ok) {
        const data = await res.json();
        if (data.rates && typeof data.rates === "object") {
          setRates((prev) => ({ ...prev, ...data.rates }));
        }
        if (data.usdIqdRate && typeof data.usdIqdRate === "number") {
          setUsdIqdRate(data.usdIqdRate);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch exchange rates, using defaults:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExchangeRates();
  }, []);

  const getCurrencyInfo = (code: string): CurrencyInfo => {
    const found = KNOWN_CURRENCIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (found) return found;
    return {
      code,
      symbol: code,
      nameAr: code,
      nameEn: code,
      flag: "🌐",
      decimals: 2,
    };
  };

  const convertFromIQD = (iqdAmount: number, targetCurrency: string = currency): number => {
    const numericIqd = Number(iqdAmount) || 0;
    const effectiveIqdRate = rates["IQD"] || usdIqdRate || 1320;
    // Step 1: Convert IQD -> USD
    const usdAmount = numericIqd / effectiveIqdRate;

    if (targetCurrency.toUpperCase() === "USD") {
      return usdAmount;
    }

    // Step 2: Convert USD -> Target Currency
    const targetRate = rates[targetCurrency.toUpperCase()] || 1;
    return usdAmount * targetRate;
  };

  const convertFromUSD = (usdAmount: number, targetCurrency: string = currency): number => {
    const numericUsd = Number(usdAmount) || 0;
    if (targetCurrency.toUpperCase() === "USD") return numericUsd;

    const targetRate =
      rates[targetCurrency.toUpperCase()] ||
      (targetCurrency.toUpperCase() === "IQD" ? usdIqdRate : 1);
    return numericUsd * targetRate;
  };

  const formatIQDPrice = (iqdAmount: number, targetCurrency: string = currency): string => {
    const converted = convertFromIQD(iqdAmount, targetCurrency);
    const info = getCurrencyInfo(targetCurrency);

    if (info.code === "IQD") {
      return `${Math.round(converted).toLocaleString("en-US")} ${info.symbol}`;
    }

    const decimals = info.decimals !== undefined ? info.decimals : 2;
    const formattedNum = converted.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    if (info.code === "USD") {
      return `${info.symbol}${formattedNum}`;
    }

    return `${formattedNum} ${info.symbol}`;
  };

  const formatUSDPrice = (usdAmount: number, targetCurrency: string = currency): string => {
    const converted = convertFromUSD(usdAmount, targetCurrency);
    const info = getCurrencyInfo(targetCurrency);

    if (info.code === "IQD") {
      return `${Math.round(converted).toLocaleString("en-US")} ${info.symbol}`;
    }

    const decimals = info.decimals !== undefined ? info.decimals : 2;
    const formattedNum = converted.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    if (info.code === "USD") {
      return `${info.symbol}${formattedNum}`;
    }

    return `${formattedNum} ${info.symbol}`;
  };

  // Helper for prices that could be IQD or USD:
  // If price > 500, assume it's IQD. If < 500, assume it's USD (or convert appropriately).
  const formatGenericPrice = (
    priceVal: number | string,
    targetCurrency: string = currency,
  ): string => {
    const numeric = Number(priceVal) || 0;
    if (numeric <= 0) return formatIQDPrice(0, targetCurrency);

    if (numeric >= 500) {
      // IQD base price
      return formatIQDPrice(numeric, targetCurrency);
    } else {
      // USD base price -> Convert USD to IQD first if needed
      return formatUSDPrice(numeric, targetCurrency);
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        usdIqdRate,
        rates,
        currencies: KNOWN_CURRENCIES,
        convertFromIQD,
        convertFromUSD,
        formatIQDPrice,
        formatUSDPrice,
        formatGenericPrice,
        getCurrencyInfo,
        loading,
        refreshRates: fetchExchangeRates,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
};
