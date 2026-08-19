/** Dial codes for the WhatsApp verification field. Iraq is the default. */
export interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "IQ", dial: "964", flag: "🇮🇶", name: "العراق" },
  { code: "SA", dial: "966", flag: "🇸🇦", name: "السعودية" },
  { code: "AE", dial: "971", flag: "🇦🇪", name: "الإمارات" },
  { code: "KW", dial: "965", flag: "🇰🇼", name: "الكويت" },
  { code: "QA", dial: "974", flag: "🇶🇦", name: "قطر" },
  { code: "BH", dial: "973", flag: "🇧🇭", name: "البحرين" },
  { code: "OM", dial: "968", flag: "🇴🇲", name: "عُمان" },
  { code: "JO", dial: "962", flag: "🇯🇴", name: "الأردن" },
  { code: "SY", dial: "963", flag: "🇸🇾", name: "سوريا" },
  { code: "LB", dial: "961", flag: "🇱🇧", name: "لبنان" },
  { code: "EG", dial: "20", flag: "🇪🇬", name: "مصر" },
  { code: "YE", dial: "967", flag: "🇾🇪", name: "اليمن" },
  { code: "PS", dial: "970", flag: "🇵🇸", name: "فلسطين" },
  { code: "LY", dial: "218", flag: "🇱🇾", name: "ليبيا" },
  { code: "SD", dial: "249", flag: "🇸🇩", name: "السودان" },
  { code: "TN", dial: "216", flag: "🇹🇳", name: "تونس" },
  { code: "DZ", dial: "213", flag: "🇩🇿", name: "الجزائر" },
  { code: "MA", dial: "212", flag: "🇲🇦", name: "المغرب" },
  { code: "TR", dial: "90", flag: "🇹🇷", name: "تركيا" },
  { code: "IR", dial: "98", flag: "🇮🇷", name: "إيران" },
  { code: "US", dial: "1", flag: "🇺🇸", name: "الولايات المتحدة" },
  { code: "GB", dial: "44", flag: "🇬🇧", name: "بريطانيا" },
  { code: "DE", dial: "49", flag: "🇩🇪", name: "ألمانيا" },
  { code: "SE", dial: "46", flag: "🇸🇪", name: "السويد" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]!;
