import {
  ShoppingBag,
  Heart,
  Gamepad,
  FileDigit,
  Calendar,
  Star,
  ShieldAlert,
  Play,
  ExternalLink,
  Tag,
  Users,
  Globe,
  Sparkles,
} from "lucide-react";

import { BananaIcon } from "./Icons";
import { getNintendoMedia, getNintendoMediaUrl } from "@/lib/nintendoImages";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { useI18n, tr } from "../i18n";
import { useCurrency } from "../context/CurrencyContext";
import GlobalPriceTracker from "./GlobalPriceTracker";
import { cdnImage } from "@/lib/img";

export default function DetailsView({ game }: { game: any }) {
  const { t } = useI18n();
  const { formatGenericPrice } = useCurrency();
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const title = game?.title || game?.name || "لعبة غير معنونة";
  const description =
    game?.description || game?.desc || "لا يوجد وصف تفصيلي متاح لهذه اللعبة حالياً.";
  // The detail page's primary cover has its own field. It is not the listing
  // box shot and not the square card, so it asks for its own role and shows the
  // detail placeholder when the product has no cover of its own.
  const coverImg = getNintendoMediaUrl(game, "detail-cover");

  // The hero is a promotional surface: banner artwork only. It used to fall
  // back to the cover, which is how a portrait box shot ended up stretched
  // across a landscape hero. With no banner the gradient stands alone.
  const resolvedBanner = getNintendoMedia(game, "banner");
  const bannerImages: string[] =
    Array.isArray(game?.bannerImages) && game.bannerImages.length > 0 && game.bannerImages[0] !== ""
      ? game.bannerImages
      : resolvedBanner.isPlaceholder
        ? []
        : [resolvedBanner.url];

  const trailerUrl = game?.youtubeTrailer || game?.trailer_url || "";

  // Get YouTube embed URL and watch URL
  const getEmbedAndWatchUrl = (url: string) => {
    if (!url) return { embed: null, watch: null };
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2] && match[2].length === 11) {
      const videoId = match[2];
      return {
        embed: `https://www.youtube.com/embed/${videoId}`,
        watch: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }
    if (url.startsWith("http")) {
      return { embed: null, watch: url };
    }
    return { embed: null, watch: null };
  };

  const { embed: embedTrailerUrl, watch: watchTrailerUrl } = getEmbedAndWatchUrl(trailerUrl);

  useEffect(() => {
    if (bannerImages.length > 1) {
      const interval = setInterval(() => {
        setCurrentBannerIndex((prev) => (prev + 1) % bannerImages.length);
      }, 4000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [bannerImages.length]);

  const platformText =
    game?.platform === "both"
      ? "Switch 1 & 2"
      : game?.platform === "switch2"
        ? "Nintendo Switch 2"
        : "Nintendo Switch";

  const rawPriceVal = game?.price || game?.types?.[0]?.price || 59.99;
  const priceText = formatGenericPrice(rawPriceVal);

  return (
    <div className="relative pb-12 bg-[var(--page)] min-h-full">
      {/* Hero Banner Carousel */}
      <div className="absolute top-0 left-0 right-0 h-[420px] -mt-[88px] z-0 overflow-hidden">
        {bannerImages.map((img: string, idx: number) => (
          <motion.img
            key={idx}
            src={cdnImage(img)}
            alt={title}
            className="w-full h-full object-cover absolute top-0 left-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: currentBannerIndex === idx ? 1 : 0 }}
            transition={{ duration: 0.8 }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[var(--page)]"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 pt-[260px] space-y-6 max-w-4xl mx-auto w-full px-4 sm:px-6">
        {/* Title & Platform Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--page)] rounded-t-[32px] px-6 pt-6 pb-2 shadow-[0_-15px_30px_rgba(244,241,232,0.95)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="px-3 py-1 bg-red-600 text-white font-bold text-xs rounded-full shadow-sm flex items-center gap-1">
              <Gamepad className="w-3.5 h-3.5" /> {platformText}
            </span>
            {game?.ageRating && (
              <span className="px-2.5 py-0.5 bg-foreground text-white font-bold text-xs rounded-md">
                {game.ageRating}
              </span>
            )}
          </div>
          <h1
            className="text-2xl sm:text-3xl font-black text-foreground leading-tight mb-2"
            dir="auto"
          >
            {title}
          </h1>
        </motion.div>

        {/* Cover & Description Card */}
        <div className="flex flex-col sm:flex-row gap-5 bg-card p-5 rounded-3xl shadow-sm border border-border/80">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full sm:w-1/3 aspect-[2/3] bg-muted rounded-2xl shadow-md border border-border overflow-hidden shrink-0 relative"
          >
            <div className="absolute top-0 w-full bg-red-600 text-white text-[9px] font-bold text-center py-0.5 z-10 flex items-center justify-center gap-1">
              <Gamepad className="w-2.5 h-2.5" /> Switch
            </div>
            <img src={cdnImage(coverImg)} className="w-full h-full object-cover pt-3" alt={title} />
          </motion.div>

          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {tr("نبذة عن اللعبة")}
              </h3>
              <p
                className="text-sm text-foreground font-medium leading-relaxed whitespace-pre-line"
                dir="auto"
              >
                {description}
              </p>
            </div>

            {/* Price & Purchase Actions */}
            <div className="pt-4 border-t border-border flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-muted-foreground font-semibold block">
                  {tr("السعر الأساسي")}
                </span>
                <span className="text-2xl font-black text-foreground">{priceText}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-12 px-6 bg-foreground text-white font-bold text-sm rounded-2xl flex items-center gap-2 hover:bg-black transition-colors shadow-lg shadow-slate-900/20">
                  <ShoppingBag className="w-4 h-4" />
                  <span>{tr("شراء الآن")}</span>
                </button>
                <button className="h-12 w-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-100 transition-colors shrink-0">
                  <Heart className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Game Metadata Features */}
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" /> {tr("مواصفات وبيانات اللعبة")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <Gamepad className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">{tr("الجهاز")}</span>
              <span className="text-xs font-bold text-foreground">{platformText}</span>
            </div>

            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <FileDigit className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {tr("حجم اللعبة")}
              </span>
              <span className="text-xs font-bold text-foreground">{game?.size || "غير محدد"}</span>
            </div>

            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {tr("عدد اللاعبين")}
              </span>
              <span className="text-xs font-bold text-foreground">
                {game?.players || game?.numberOfPlayers || "غير محدد"}
              </span>
            </div>

            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {tr("اللغات المدعومة")}
              </span>
              <span className="text-xs font-bold text-foreground">
                {game?.languages || game?.supportedLanguages || "غير محدد"}
              </span>
            </div>

            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {tr("تاريخ الإصدار")}
              </span>
              <span className="text-xs font-bold text-foreground">
                {new Date(game?.releaseDate).getTime() > Date.now()
                  ? `${tr("حجز مسبق")} (${game.releaseDate})`
                  : game.releaseDate || "غير محدد"}
              </span>
            </div>

            <div className="bg-muted rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 border border-border">
              <Star className="w-5 h-5 text-amber-500" />
              <span className="text-[11px] text-muted-foreground font-medium">Metacritic</span>
              <span className="text-xs font-bold text-foreground">
                {game?.metacriticScore || game?.metacriticRating
                  ? `${game.metacriticScore || game.metacriticRating} / 100`
                  : "غير متوفر"}
              </span>
            </div>
          </div>
        </div>

        {/* YouTube Trailer Section */}
        {watchTrailerUrl && (
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Play className="w-4 h-4 text-red-600 fill-current" />{" "}
                {tr("العرض الترويجي الرسمي (Trailer)")}
              </h3>
              <a
                href={watchTrailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 hover:underline"
              >
                <span>{tr("فتح في يوتيوب")}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {embedTrailerUrl ? (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-inner bg-black">
                <iframe
                  src={embedTrailerUrl}
                  title={`${title} Trailer`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            ) : (
              <a
                href={watchTrailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-sm border border-red-100 hover:bg-red-100 transition-colors"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{tr("انقر هنا لمشاهدة التريلر المباشر للعبة على يوتيوب")}</span>
              </a>
            )}
          </div>
        )}

        {/* Game Editions / Options */}
        {Array.isArray(game?.options) && game.options.length > 0 && (
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80">
            <h3 className="text-sm font-bold text-foreground mb-3">
              {tr("النسخ والإصدارات المتاحة")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {game.options.map((opt: any, i: number) => (
                <div
                  key={i}
                  className="p-3 bg-muted rounded-2xl border border-border flex items-center justify-between"
                >
                  <span className="font-semibold text-foreground text-xs">
                    {opt.name || opt.title || opt}
                  </span>
                  {opt.price && (
                    <span className="font-black text-foreground text-sm">
                      {formatGenericPrice(opt.price)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game Types (Physical/Digital) */}
        {Array.isArray(game?.types) && game.types.length > 0 && (
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80">
            <h3 className="text-sm font-bold text-foreground mb-3">{tr("نوع المنتج")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {game.types.map((typeObj: any, i: number) => (
                <div
                  key={i}
                  className="p-3 bg-muted rounded-2xl border border-border flex items-center justify-between"
                >
                  <span className="font-semibold text-foreground text-xs">
                    {typeObj.name || typeObj.title || typeObj}
                  </span>
                  {typeObj.price && (
                    <span className="font-black text-foreground text-sm">
                      {formatGenericPrice(typeObj.price)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Page Information */}
        {game?.features && (
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80">
            <h3 className="text-sm font-bold text-foreground mb-3">{tr("مميزات إضافية")}</h3>
            <div className="flex flex-wrap gap-2">
              {game.features.map((feature: string, i: number) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-muted rounded-full text-xs font-bold text-foreground border border-border"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Technical Specs & Switch 2 Enhancements */}
        {(game?.performance || game?.switch2) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {game?.performance && (
              <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <FileDigit className="w-4 h-4 text-muted-foreground" /> {tr("الأداء والرسوميات")}
                </h3>
                <div className="space-y-2 text-xs">
                  {game.performance.resolutionTv && (
                    <div className="flex justify-between border-b border-border pb-1">
                      <span className="text-muted-foreground">{tr("دقة التلفاز")}</span>
                      <span className="font-bold">{game.performance.resolutionTv}</span>
                    </div>
                  )}
                  {game.performance.fps && (
                    <div className="flex justify-between border-b border-border pb-1">
                      <span className="text-muted-foreground">{tr("معدل الإطارات")}</span>
                      <span className="font-bold">{game.performance.fps}</span>
                    </div>
                  )}
                  {game.performance.hdrSupport && (
                    <div className="flex justify-between border-b border-border pb-1">
                      <span className="text-muted-foreground">{tr("دعم HDR")}</span>
                      <span className="font-bold text-green-500">{tr("نعم")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {game?.switch2?.switch2Features && (
              <div className="bg-card rounded-3xl p-5 shadow-sm border border-border/80 border-yellow-500/30">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" /> {tr("تحسينات الجيل القادم")}
                </h3>
                <div className="space-y-2">
                  {game.switch2.switch2Features.map((f: any, i: number) => (
                    <div
                      key={i}
                      className="p-2 bg-yellow-500/5 rounded-xl border border-yellow-500/10 text-[11px]"
                    >
                      <div className="font-bold text-yellow-700">{f.title}</div>
                      <div className="text-muted-foreground">{f.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Price Tracker Section (pricesapi.io) */}
        {(game.categoryId === "cat_1" ||
          game.category === "cat_1" ||
          (game.category && game.category.toLowerCase().includes("game")) ||
          !game.category) && <GlobalPriceTracker productTitle={title} />}
      </div>
    </div>
  );
}
