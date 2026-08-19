import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  Layers,
  Sparkles,
  ShieldCheck,
  Zap,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  Flame,
  Gamepad2,
  Wallet,
} from "lucide-react";

import AppShell from "@/components/AppShell";
import { BundleCard } from "@/components/BundleCard";
import { api } from "@/lib/api";
import type { AccountBundle, Product } from "@/lib/types";
import { playSound } from "@/utils/audio";

export const Route = createFileRoute("/bundles/")({
  head: () => ({
    meta: [
      { title: "حزم وبندلات الحسابات — بنانا ستور" },
      {
        name: "description",
        content:
          "وفر حتى 60% مع حزم ألعاب ننتندو سويتش. أكثر من لعبة في حساب واحد جاهز للتحميل المباشر مع تسليم فوري وضمان شامل.",
      },
      { property: "og:title", content: "حزم وبندلات الحسابات — بنانا ستور" },
      {
        property: "og:description",
        content: "مجموعات ألعاب كاملة في حساب واحد بتوفير استثنائي وتسليم فوري عبر محادثة الطلب.",
      },
    ],
  }),
  component: BundlesIndexPage,
});

function BundlesIndexPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price_asc" | "price_desc" | "savings">(
    "featured",
  );

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", "full"],
    queryFn: () => api.store(),
  });

  const products = (store?.products ?? []) as Product[];
  const bundles = (store?.bundles ?? []) as AccountBundle[];

  const filteredBundles = useMemo(() => {
    let list = bundles.filter((b) => b.isActive !== false);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((b) => {
        const titleMatch = (b.title || "").toLowerCase().includes(q);
        const titleEnMatch = (b.titleEn || "").toLowerCase().includes(q);
        const descMatch = (b.description || "").toLowerCase().includes(q);
        return titleMatch || titleEnMatch || descMatch;
      });
    }

    if (selectedType !== "all") {
      list = list.filter((b) => (b.accountType || "primary") === selectedType);
    }

    if (sortBy === "price_asc") {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === "savings") {
      list.sort((a, b) => {
        const saveA = (a.originalPrice || a.price) - a.price;
        const saveB = (b.originalPrice || b.price) - b.price;
        return saveB - saveA;
      });
    }

    return list;
  }, [bundles, searchQuery, selectedType, sortBy]);

  return (
    <AppShell currentView="store" onBack={() => navigate({ to: "/" })}>
      <div className="pb-16 bg-[var(--page)] min-h-screen">
        {/* Hero Header */}
        <div className="relative pt-8 pb-12 px-4 sm:px-8 bg-gradient-to-b from-red-600/15 via-red-500/5 to-transparent border-b border-border/40">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-4">
              <Link to="/" className="hover:text-foreground transition-colors">
                الرئيسية
              </Link>
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="text-foreground">حزم وبندلات الحسابات</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 text-xs font-black">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  أقوى العروض والتوفير
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight">
                  حزم ألعاب ننتندو سويتش (Account Bundles)
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  احصل على مجموعة من ألعاب السويتش الأسطورية بحساب رسمي واحد جاهز للتحميل من متجر
                  Nintendo eShop مع توفير هائل ودفع سريع من المحفظة وتسليم فوري.
                </p>
              </div>

              {/* Quick Perks / Value Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0">
                <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-1.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">تسليم فوري</span>
                  <span className="text-[10px] text-muted-foreground">بمحادثة الطلب</span>
                </div>

                <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-1.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">ضمان شامل</span>
                  <span className="text-[10px] text-muted-foreground">حسابات أصلية 100%</span>
                </div>

                <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex flex-col items-center text-center col-span-2 sm:col-span-1">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1.5">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">دفع بالمحفظة</span>
                  <span className="text-[10px] text-muted-foreground">بدون أي عنوان شحن</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Controls Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
          <div className="bg-card p-3 sm:p-4 rounded-2xl border border-border shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن بندل أو لعبة..."
                className="w-full pr-10 pl-4 py-2.5 text-xs sm:text-sm bg-muted/50 hover:bg-muted focus:bg-background rounded-xl border border-border focus:border-red-500 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[
                { id: "all", label: "جميع البندلات" },
                { id: "primary", label: "حساب رئيسي" },
                { id: "secondary", label: "حساب فرعي" },
                { id: "full", label: "حساب كامل" },
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setSelectedType(type.id);
                    playSound("switch_click", 0.6);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedType === type.id
                      ? "bg-red-500 text-white shadow-xs"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-muted/50 hover:bg-muted text-xs font-bold rounded-xl border border-border px-3 py-2 focus:outline-none focus:border-red-500 cursor-pointer"
              >
                <option value="featured">المميز أولاً</option>
                <option value="savings">الأعلى توفيراً</option>
                <option value="price_asc">الأقل سعراً</option>
                <option value="price_desc">الأعلى سعراً</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bundles Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-[380px] rounded-3xl bg-muted/20 animate-pulse animate-skeleton-shimmer border border-border/40"
                />
              ))}
            </div>
          ) : filteredBundles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBundles.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  products={products}
                  layout="grid"
                  onSelect={() =>
                    void navigate({ to: "/bundles/$bundleId", params: { bundleId: bundle.id } })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 bg-card rounded-3xl border border-border shadow-xs max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Layers className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">لا توجد حزم مطابقة</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                لم نتمكن من العثور على أي حزم حسابات تطابق خيارات البحث الحالية. جرب تغيير كلمات
                البحث أو الفلاتر.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedType("all");
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-600 transition-colors"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
