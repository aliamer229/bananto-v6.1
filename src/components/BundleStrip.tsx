import React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Layers, ChevronLeft, Sparkles, ArrowLeft } from "lucide-react";
import type { AccountBundle, Product } from "@/lib/types";
import { BundleCard } from "./BundleCard";
import { playSound } from "@/utils/audio";

interface BundleStripProps {
  bundles: AccountBundle[];
  products: Product[];
  onSelectBundle?: (bundle: AccountBundle) => void;
}

export function BundleStrip({ bundles, products, onSelectBundle }: BundleStripProps) {
  const navigate = useNavigate();

  if (!bundles || bundles.length === 0) {
    return null;
  }

  const activeBundles = bundles.filter((b) => b.isActive !== false);

  if (activeBundles.length === 0) {
    return null;
  }

  return (
    <section className="py-4 sm:py-5 space-y-2.5 sm:space-y-3 w-full">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-red-600 to-rose-400 text-white flex items-center justify-center shadow-xs">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground tracking-tight">
                حزم الحسابات (Bundles)
              </h3>
              <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <Sparkles className="w-2.5 h-2.5 fill-current" />
                توفير حتى 60%
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
              مجموعات ألعاب كاملة في حساب واحد جاهز للتحميل
            </p>
          </div>
        </div>

        {/* View All Button */}
        <Link
          to="/bundles"
          onClick={() => playSound("switch_click", 0.7)}
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors group px-2.5 py-1 rounded-lg hover:bg-red-500/10 shrink-0"
        >
          <span>عرض الكل</span>
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180 transition-transform group-hover:-translate-x-0.5" />
        </Link>
      </div>

      {/* Horizontal Strip */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 snap-x px-4 sm:px-8 w-full max-w-full">
        {activeBundles.map((bundle) => (
          <div key={bundle.id} className="snap-start shrink-0">
            <BundleCard
              bundle={bundle}
              products={products}
              layout="compact"
              onSelect={
                onSelectBundle
                  ? () => onSelectBundle(bundle)
                  : () =>
                      void navigate({ to: "/bundles/$bundleId", params: { bundleId: bundle.id } })
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
