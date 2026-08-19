import React, { useEffect, useState, useCallback, useRef } from "react";
import { ExternalLink, X, RefreshCw, Newspaper, AlertCircle } from "lucide-react";
import { useI18n } from "../i18n";
import { motion, AnimatePresence } from "motion/react";

interface NewsItem {
  title: string;
  title_ar?: string;
  link: string;
  pubDate: string;
  img: string;
  timestamp: number;
}

export default function NintendoNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const { t, lang } = useI18n();
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const limit = 15;

  useEffect(() => {
    if (selectedNews) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedNews]);

  const fetchNews = useCallback(
    async (currentOffset: number, isInitial = false) => {
      if (loading) return;
      setLoading(true);
      setError(false);

      try {
        const res = await fetch(`/api/public/latest-news?offset=${currentOffset}&limit=${limit}`);
        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`);
        }
        const data = await res.json();

        if (Array.isArray(data)) {
          if (data.length < limit) {
            setHasMore(false);
          }

          setNews((prev) => {
            const combined = isInitial ? data : [...prev, ...data];
            const seen = new Set<string>();
            return combined.filter((item) => {
              const id = item.link || item.title;
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          });
        } else {
          setHasMore(false);
        }
      } catch (err) {
        console.error("Error fetching news:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [loading, limit],
  );

  const handleInitialLoad = useCallback(() => {
    setNews([]);
    setOffset(0);
    setHasMore(true);
    fetchNews(0, true);
  }, [fetchNews]);

  // Initial load
  useEffect(() => {
    handleInitialLoad();
  }, [lang]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !error && news.length > 0) {
          const nextOffset = offset + limit;
          setOffset(nextOffset);
          fetchNews(nextOffset, false);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, news.length, offset, fetchNews]);

  const formatDisplayDate = (pubDate: string) => {
    if (!pubDate) return "";
    try {
      const d = new Date(pubDate);
      const locale = lang === "ar" ? "ar-EG" : lang === "ku" ? "ku-IQ" : "en-US";
      return d.toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return pubDate;
    }
  };

  const getDisplayTitle = (item: NewsItem) => {
    if (lang === "ar" && item.title_ar) {
      return item.title_ar;
    }
    return item.title;
  };

  return (
    <>
      <div className="flex flex-col gap-3 px-4 sm:px-8">
        {/* Loading skeleton for initial load */}
        {news.length === 0 && loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex gap-4 bg-card rounded-2xl border border-border p-3 animate-pulse"
              >
                <div className="w-[90px] h-[90px] sm:w-[110px] sm:h-[110px] shrink-0 rounded-xl bg-muted/60" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-24 bg-muted/60 rounded" />
                  <div className="h-4 w-full bg-muted/60 rounded" />
                  <div className="h-4 w-3/4 bg-muted/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {news.length === 0 && !loading && error && (
          <div className="bg-card rounded-2xl border border-border p-8 text-center flex flex-col items-center justify-center gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-60" />
            <p className="text-sm font-bold text-muted-foreground">
              {t("تعذر تحميل الأخبار في الوقت الحالي")}
            </p>
            <button
              onClick={handleInitialLoad}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-bold text-xs rounded-xl hover:bg-primary/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("إعادة المحاولة")}
            </button>
          </div>
        )}

        {/* News items list */}
        {news.map((item, i) => {
          const displayTitle = getDisplayTitle(item);
          const displayDate = formatDisplayDate(item.pubDate);

          return (
            <div
              key={item.link || i}
              onClick={() => setSelectedNews(item)}
              className="flex gap-3 sm:gap-4 bg-card rounded-2xl overflow-hidden border border-border p-2.5 sm:p-3 hover:border-primary/40 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="w-[85px] h-[85px] sm:w-[110px] sm:h-[110px] shrink-0 rounded-xl overflow-hidden bg-muted relative">
                {item.img ? (
                  <img
                    src={item.img}
                    alt={displayTitle}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      // Fallback icon if image fails
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground font-bold">
                    <Newspaper className="w-6 h-6 opacity-40" />
                  </div>
                )}
              </div>

              <div className="flex flex-col py-0.5 pe-1 flex-1 justify-between min-w-0">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">{displayDate}</p>
                  <h4 className="font-bold text-foreground text-xs sm:text-sm line-clamp-2 leading-relaxed">
                    {displayTitle}
                  </h4>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-primary font-bold">
                  <span>{t("تفاصيل الخبر")}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          );
        })}

        {/* Bottom loader / End indicator */}
        <div ref={loaderRef} className="py-6 text-center">
          {loading && news.length > 0 && (
            <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground animate-pulse">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>{t("جاري تحميل المزيد...")}</span>
            </div>
          )}
          {!hasMore && news.length > 0 && (
            <p className="text-muted-foreground text-xs">{t("لا توجد المزيد من الأخبار")}</p>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedNews && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedNews(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative border border-border flex flex-col max-h-[85vh]"
            >
              <button
                onClick={() => setSelectedNews(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {selectedNews.img && (
                <div className="w-full relative bg-muted shrink-0 flex items-center justify-center max-h-[260px] overflow-hidden">
                  <img
                    src={selectedNews.img}
                    alt={getDisplayTitle(selectedNews)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDate(selectedNews.pubDate)}
                </p>
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug">
                  {getDisplayTitle(selectedNews)}
                </h3>
                {selectedNews.title_ar && selectedNews.title !== selectedNews.title_ar && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-3 dir-ltr text-left">
                    {selectedNews.title}
                  </p>
                )}

                <a
                  href={selectedNews.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-3 rounded-2xl font-bold hover:bg-primary/90 transition-colors text-sm shadow-md mt-4"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("قراءة الخبر من المصدر")}
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
