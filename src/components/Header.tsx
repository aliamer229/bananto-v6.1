import { useEffect, useState, useMemo } from "react";
import { playSound } from "../utils/audio";
import {
  Search,
  ChevronRight,
  Shield,
  Globe,
  Wallet,
  User,
  Palette,
  MapPin,
  Moon,
  Sun,
  Music,
  Volume2,
  VolumeX,
  History,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "../i18n";
import { useAuth } from "../hooks/useAuth";
import LanguageCurrencyModal from "./LanguageCurrencyModal";
import FlowerMenu from "./FlowerMenu";
import { cdnImage } from "@/lib/img";
import { useSettingsStore } from "../store/useSettingsStore";
import { THEME_COOKIE, writeCookie } from "../lib/prefs";

export default function Header({
  currentView,
  onBack,
  onNavigate,
  products = [],
}: {
  currentView: string;
  onBack: () => void;
  onNavigate: (view: string) => void;
  products?: any[];
}) {
  const isHome = currentView === "home";
  // The profile / settings menu belongs on every screen, not just a few.
  const showProfile = true;

  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user, updateProfile } = useAuth();
  const [isLangCurrencyOpen, setIsLangCurrencyOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { soundEnabled, musicEnabled, setSoundEnabled, setMusicEnabled } = useSettingsStore();

  const handleSelectTheme = (themeId: string, isDark: boolean) => {
    playSound("bumper_end", 0.6);
    writeCookie(THEME_COOKIE, themeId);
    if (typeof document !== "undefined") {
      document.documentElement.dataset["theme"] = themeId;
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    }
    if (user && updateProfile) {
      updateProfile.mutate({ settings: { theme: themeId } });
    }
  };

  // persisted language only after hydration — avoids SSR/client text mismatch
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products
      .filter((p) => {
        const title = (p.title || "").toLowerCase();
        const titleEn = (p.titleEn || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        return title.includes(q) || titleEn.includes(q) || desc.includes(q);
      })
      .slice(0, 5);
  }, [searchQuery, products]);

  const defaultAddress = user?.addresses?.find((a) => a.isDefault) ?? user?.addresses?.[0];

  const menuItems = [
    {
      label: t("اللغة والعملة"),
      icon: <Globe className="w-5 h-5" />,
      onClick: () => {
        playSound("bumper_end", 0.6);
        setIsLangCurrencyOpen(true);
      },
    },
    {
      label: t("المحفظة"),
      icon: <Wallet className="w-5 h-5" />,
      onClick: () => {
        playSound("bumper_end", 0.6);
        onNavigate("wallet");
      },
    },
    {
      label: t("الملف الشخصي"),
      icon: <User className="w-5 h-5" />,
      onClick: () => {
        playSound("user", 0.6);
        onNavigate("profile");
      },
    },
    {
      label: t("لون الخلفية والتخصيص"),
      icon: <Palette className="w-5 h-5" />,
      onClick: () => {
        playSound("bumper_end", 0.6);
      },
      subItems: [
        {
          label: musicEnabled ? t("إيقاف الموسيقى") : t("تشغيل الموسيقى"),
          icon: <Music className={`w-5 h-5 ${!musicEnabled ? "opacity-50" : ""}`} />,
          onClick: () => {
            setMusicEnabled(!musicEnabled);
            if (soundEnabled) playSound("switch_click", 0.6);
          },
        },
        {
          label: soundEnabled ? t("إيقاف أصوات النظام") : t("تشغيل أصوات النظام"),
          icon: soundEnabled ? (
            <Volume2 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5 opacity-50" />
          ),
          onClick: () => {
            setSoundEnabled(!soundEnabled);
            if (!soundEnabled) playSound("turn_on", 0.6);
          },
        },
        {
          label: t("الوضع الداكن"),
          icon: <Moon className="w-5 h-5" />,
          onClick: () => handleSelectTheme("midnight", true),
        },
        {
          label: t("الوضع الفاتح"),
          icon: <Sun className="w-5 h-5" />,
          onClick: () => handleSelectTheme("cream", false),
        },
      ],
    },
    {
      label: t("العنوان"),
      icon: <MapPin className="w-5 h-5" />,
      onClick: () => {
        playSound("bumper_end", 0.6);
        onNavigate("profile");
      },
      subItems: [
        {
          label: defaultAddress
            ? `${defaultAddress.label} — ${defaultAddress.city}`
            : t("العنوان الافتراضي"),
          icon: <span className="text-xs font-bold">🏠</span>,
          onClick: () => {
            playSound("bumper_end", 0.6);
            void navigate({ to: "/profile" });
          },
        },
        {
          label: t("اضافة عنوان"),
          icon: <span className="text-xs font-bold">+</span>,
          onClick: () => {
            playSound("bumper_end", 0.6);
            void navigate({ to: "/profile" });
          },
        },
      ],
    },
  ];

  return (
    <>
      {/* The header floats over page content, so the bar itself must not eat
          pointer events — only its actual controls do. */}
      <header
        dir="rtl"
        className={`z-50 fixed top-0 w-full transition-all duration-300 transform-gpu ${
          isMenuOpen ? "bottom-0 pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div className="px-4 pt-6 pb-4 flex items-center gap-2 w-full [&>*]:pointer-events-auto relative">
          {!isHome && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playSound("bumper_end", 0.6);
                onBack();
              }}
              className="p-2 rounded-full bg-black/20 text-white backdrop-blur-md shadow-sm border border-white/20 active:scale-95 transition-transform"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {showProfile && (
            <FlowerMenu
              className="z-[60]"
              menuItems={menuItems}
              startAngle={90}
              endAngle={180}
              togglerSize={52}
              itemSize={44}
              petalGap={30}
              backgroundColor="rgba(0, 0, 0, 0.55)"
              iconColor="white"
              onOpenChange={(isOpen) => {
                setIsMenuOpen(isOpen);
                if (isOpen) playSound("bumper_end", 0.6);
              }}
            >
              <div className="w-[52px] h-[52px] rounded-full overflow-hidden border-2 border-white/25 shrink-0 bg-foreground shadow-md relative group flex items-center justify-center">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "Profile"}
                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                  />
                ) : (
                  <User className="w-6 h-6 text-white/50" />
                )}

                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white uppercase">
                    {hydrated ? lang : ""}
                  </span>
                </div>
              </div>
            </FlowerMenu>
          )}

          {isHome && (
            <>
              {user?.isAdmin && (
                <button
                  onPointerDown={() => {
                    playSound("bumper_end", 0.6);
                    navigate({ to: "/admin" });
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-black/20 text-white backdrop-blur-md shadow-sm border border-white/20 hover:bg-black/30 transition-colors shrink-0"
                  title={t("لوحة الإدارة")}
                >
                  <Shield className="w-5 h-5" />
                </button>
              )}
              <div
                className={`flex-1 relative transition-all duration-300 z-0 ${isMenuOpen ? "opacity-30 blur-sm !pointer-events-none [&_*]:!pointer-events-none" : "opacity-100"}`}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  placeholder={t("بحث ذكي عن الألعاب...")}
                  className="w-full h-10 rounded-full outline-none px-4 pe-10 text-sm transition-all bg-black/20 border border-white/20 text-white backdrop-blur-md placeholder-white/70 focus:border-white focus:bg-black/40 shadow-sm"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />

                {isSearchFocused && searchResults.length > 0 && (
                  <div className="absolute top-full mt-2 left-0 right-0 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          playSound("hover_s", 0.6);
                          onNavigate(`product/${p.id}`);
                          setSearchQuery("");
                        }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 text-right"
                      >
                        <img
                          src={cdnImage(p.image || p.coverImage || p.cartridgeImage)}
                          className="w-10 h-10 rounded-lg object-cover bg-white/10"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold text-sm truncate">{p.title}</div>
                          {p.titleEn && (
                            <div className="text-white/50 text-xs truncate uppercase tracking-wider">
                              {p.titleEn}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <LanguageCurrencyModal
        isOpen={isLangCurrencyOpen}
        onClose={() => setIsLangCurrencyOpen(false)}
      />
    </>
  );
}
