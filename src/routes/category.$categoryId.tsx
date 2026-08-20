import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { useState, useMemo, useEffect } from "react";
import { useI18n } from "@/i18n";
import { motion, AnimatePresence } from "motion/react";
import { Filter, SortAsc, Calendar, Star, Tag, ChevronDown } from "lucide-react";
import { cdnImage } from "@/lib/img";


export const Route = createFileRoute("/category/$categoryId")({
  component: CategoryPage,
});

type SortOption = "newest" | "price_asc" | "price_desc" | "rating" | "release_date";
type PlatformOption = "all" | "switch1" | "switch2";

function CategoryPage() {
  const { categoryId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [platform, setPlatform] = useState<PlatformOption>("all");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const { data: store, isLoading } = useQuery({
    queryKey: ["store"],
    queryFn: api.store,
  });

  const categoryInfo = useMemo(() => getCategoryInfo(categoryId, t), [categoryId, t]);

  const products = useMemo(() => {
    if (!store?.products) return [];
    
    let filtered = store.products.filter((p: any) => {
      // Basic active check
      if (p.status === "غير نشط" || p.isActive === false) return false;
      
      // Category check
      const pCat = String(p.category || p.categoryId || "").toLowerCase();
      const targetCat = categoryId.toLowerCase();
      if (pCat !== targetCat && p.kind !== targetCat && categoryId !== "all") return false;

      // Platform filter
      if (platform !== "all") {
        const pPlat = String(p.platform || "").toLowerCase();
        if (platform === "switch1") {
          if (pPlat !== "switch1" && pPlat !== "switch" && pPlat !== "both" && pPlat !== "") return false;
        } else if (platform === "switch2") {
          if (pPlat !== "switch2" && pPlat !== "both") return false;
        }
      }

      // Genre filter
      if (selectedGenre !== "all") {
        const pGenre = String(p.genre || "").toLowerCase();
        if (!pGenre.includes(selectedGenre.toLowerCase())) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case "price_asc":
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case "price_desc":
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case "rating":
          return (Number(b.metacriticRating) || 0) - (Number(a.metacriticRating) || 0);
        case "release_date": {
          const dateA = new Date(a.releaseDate || a.release_date || 0).getTime();
          const dateB = new Date(b.releaseDate || b.release_date || 0).getTime();
          return dateB - dateA;
        }
        case "newest":
        default: {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        }
      }
    });

    return filtered;
  }, [store?.products, categoryId, sortBy, platform, selectedGenre]);

  const genres = useMemo(() => {
    if (!store?.products) return [];
    const genreSet = new Set<string>();
    
    // Get all products that belong to this category to extract relevant genres
    const categoryProducts = store.products.filter((p: any) => {
      const pCat = String(p.category || p.categoryId || "").toLowerCase();
      const targetCat = categoryId.toLowerCase();
      return pCat === targetCat || p.kind === targetCat || categoryId === "all";
    });

    categoryProducts.forEach((p: any) => {
      // Check for genre field
      if (p.genre) {
        const parts = typeof p.genre === 'string' ? p.genre.split(',') : (Array.isArray(p.genre) ? p.genre : []);
        parts.forEach((g: string) => {
          const trimmed = g.trim();
          if (trimmed) genreSet.add(trimmed);
        });
      }
      
      // We no longer use p.kind as a genre filter because it often includes non-genre values like "account"
    });
    
    return Array.from(genreSet).filter(g => g.toLowerCase() !== 'account').sort();
  }, [store?.products, categoryId]);

  const isNintendoGames = categoryId === "nintendo-switch-games" || categoryId === "cat_nintendo" || categoryId === "nintendo_games" || categoryId === "cat_1";

  const productBanners = useMemo(() => {
    if (!products || products.length === 0) return [];
    const bannerSet = new Set<string>();
    products.forEach((p: any) => {
      const b = p.banner || p.bannerImage || p.heroImage;
      if (b && typeof b === 'string' && b.trim()) {
        bannerSet.add(b.trim());
      }
    });
    return Array.from(bannerSet);
  }, [products]);

  useEffect(() => {
    if (productBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % productBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [productBanners.length]);

  return (
    <AppShell currentView="store" onBack={() => navigate({ to: "/" })}>
      <div className="pb-24 bg-[var(--page)] min-h-screen" dir="rtl">
        {/* Header Section */}
        <div className={`relative pt-24 pb-12 px-6 overflow-hidden min-h-[320px] flex items-center justify-center ${categoryInfo.bgColor}`}>
           {/* Background Slideshow */}
           <div className="absolute inset-0 z-0">
             {productBanners.length > 0 ? (
               <AnimatePresence mode="wait">
                 <motion.div
                   key={productBanners[currentBannerIndex]}
                   initial={{ opacity: 0, scale: 1.1 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.95 }}
                   transition={{ duration: 1.2, ease: "easeInOut" }}
                   className="absolute inset-0"
                 >
                   <img 
                     src={cdnImage(productBanners[currentBannerIndex])} 
                     alt="Category Banner"
                     className="w-full h-full object-cover"
                   />
                   <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                 </motion.div>
               </AnimatePresence>
             ) : (
               <div className="absolute inset-0 opacity-10 pointer-events-none">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent" />
               </div>
             )}
           </div>
           
           <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center text-center">
             {/* Text elements removed as per user request */}
           </div>
        </div>

        {/* Toolbar Section */}
        <div className="sticky top-0 z-30 bg-[var(--page)]/80 backdrop-blur-xl border-b border-border px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border ${showFilters ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'}`}
              >
                <Filter className="w-4 h-4" />
                {t("تصفية")}
                <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              
              <div className="h-6 w-px bg-border mx-1 shrink-0" />
              
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-card text-foreground border border-border rounded-full px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20 appearance-none cursor-pointer"
              >
                <option value="newest">{t("الأحدث")}</option>
                <option value="release_date">{t("تاريخ الإصدار")}</option>
                <option value="price_asc">{t("السعر: من الأقل")}</option>
                <option value="price_desc">{t("السعر: من الأعلى")}</option>
                <option value="rating">{t("التقييم")}</option>
              </select>
            </div>
            
            <div className="hidden md:block text-xs font-bold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              {products.length} {t("منتج")}
            </div>
          </div>
          
          {/* Expanded Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="max-w-7xl mx-auto pt-4 pb-2 border-t border-border mt-3 flex flex-wrap gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase px-2">{t("الجهاز")}</span>
                    <div className="flex gap-2">
                      {[
                        { id: "all", label: t("الكل") },
                        { id: "switch1", label: "Switch 1" },
                        { id: "switch2", label: "Switch 2" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPlatform(p.id as PlatformOption)}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${platform === p.id ? 'bg-red-500 text-white border-red-600 shadow-sm shadow-red-500/20' : 'bg-card text-muted-foreground border-border hover:border-foreground/30'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Product Grid and Sidebar Filter */}
        <div className="px-4 py-8 max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
          {/* Desktop Sidebar Filter */}
          <div className="hidden md:block w-64 shrink-0 space-y-6">
            <div>
              <h3 className="text-sm font-black text-muted-foreground uppercase mb-4 px-2 tracking-wider">
                {t("التصنيفات")}
              </h3>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setSelectedGenre("all")}
                  className={`w-full text-right px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedGenre === "all" ? 'bg-red-500 text-white shadow-md shadow-red-500/20' : 'text-foreground hover:bg-card hover:translate-x-[-4px]'}`}
                >
                  {t("الكل")}
                </button>
                {genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre)}
                    className={`w-full text-right px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedGenre === genre ? 'bg-red-500 text-white shadow-md shadow-red-500/20' : 'text-foreground hover:bg-card hover:translate-x-[-4px]'}`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-sm font-black text-muted-foreground uppercase mb-4 px-2 tracking-wider">
                {t("الجهاز")}
              </h3>
              <div className="flex flex-col gap-1">
                {[
                  { id: "all", label: t("الكل") },
                  { id: "switch1", label: "Switch 1" },
                  { id: "switch2", label: "Switch 2" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id as PlatformOption)}
                    className={`w-full text-right px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${platform === p.id ? 'bg-foreground text-background shadow-md' : 'text-foreground hover:bg-card hover:translate-x-[-4px]'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Genre Filter (Horizontal Scroll) */}
          <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
             <button
              onClick={() => setSelectedGenre("all")}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all ${selectedGenre === "all" ? 'bg-red-500 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
            >
              {t("الكل")}
            </button>
            {genres.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all ${selectedGenre === genre ? 'bg-red-500 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
              >
                {genre}
              </button>
            ))}
          </div>

          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="aspect-[3/4] bg-muted/20 rounded-2xl animate-pulse animate-skeleton-shimmer" />
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {products.map((p: any) => (
                    <motion.div 
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                    >
                      <ProductCard product={p} forceStandardImage={isNintendoGames} />
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-24 bg-card rounded-3xl border border-dashed border-border">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-foreground mb-1">{t("لا توجد منتجات")}</h3>
                <p className="text-muted-foreground">{t("جرب تغيير خيارات التصفية")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getCategoryInfo(id: string, t: (k: string) => string) {
  const base = {
    title: t(id) || id,
    description: t("تصفح أحدث المنتجات"),
    bgColor: "bg-gradient-to-br from-gray-800 to-black",
    icon: "🎮",
  };

  switch (id) {
    case "nintendo-switch-games":
    case "cat_nintendo":
    case "nintendo_games":
      return {
        ...base,
        title: t("ألعاب نينتندو سويتش"),
        description: t("مجموعة واسعة من الألعاب الرقمية والفيزيائية"),
        bgColor: "bg-gradient-to-br from-[#E60012] to-[#8B0000]",
        icon: "🎰",
      };
    case "hardware":
      return {
        ...base,
        title: t("أجهزة الهاردوير وملحقاتها"),
        description: t("أحدث أجهزة نينتندو وملحقاتها الأصلية"),
        bgColor: "bg-gradient-to-br from-[#2D3436] to-[#000000]",
        icon: "🎮",
      };
    case "amiibo":
      return {
        ...base,
        title: t("مجسمات amiibo"),
        description: t("شخصياتك المفضلة بلمسة سحرية"),
        bgColor: "bg-gradient-to-br from-[#00B894] to-[#006266]",
        icon: "👾",
      };
    case "accessories":
      return {
        ...base,
        title: t("الإكسسوارات"),
        description: t("حقائب، حافظات، وكل ما يحتاجه جهازك"),
        bgColor: "bg-gradient-to-br from-[#FAB1A0] to-[#E17055]",
        icon: "🎧",
      };
    case "gift-cards":
      return {
        ...base,
        title: t("كروت التعبئة"),
        description: t("بطاقات هدايا لمختلف المتاجر العالمية"),
        bgColor: "bg-gradient-to-br from-[#0984E3] to-[#4834D4]",
        icon: "💳",
      };
    case "used":
      return {
        ...base,
        title: t("القطع والألعاب المستخدمة"),
        description: t("ألعاب وقطع بحالة ممتازة وبأسعار توفيرية"),
        bgColor: "bg-gradient-to-br from-[#6C5CE7] to-[#2D3436]",
        icon: "♻️",
      };
    default:
      return base;
  }
}

