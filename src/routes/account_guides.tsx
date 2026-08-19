import PageHeader from "@/components/PageHeader";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ChevronRight, BookOpen, Video, ArrowRight, PlayCircle } from "lucide-react";
import { useI18n } from "@/i18n";
import { loadSiteContent } from "@/lib/content.functions";

export const Route = createFileRoute("/account_guides")({
  loader: async () => await loadSiteContent(),
  head: () => ({
    meta: [{ title: "دليل الحسابات والألعاب — بنانا ستور" }],
  }),
  component: GuidesComponent,
});

function GuidesComponent() {
  const t = useI18n((state) => state.t);
  const lang = useI18n((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const content = Route.useLoaderData();
  const guides =
    content.guides?.filter((g) => g.published).sort((a, b) => a.sort_order - b.sort_order) || [];

  const [search, setSearch] = useState("");
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const getLocalized = (obj: any, key: string) => {
    if (!obj) return "";
    return obj[`${key}_${lang}`] || obj[`${key}_ar`] || "";
  };

  const filteredGuides = guides.filter((guide) => {
    const term = search.toLowerCase();
    const title = getLocalized(guide, "title").toLowerCase();
    const desc = getLocalized(guide, "description").toLowerCase();
    return title.includes(term) || desc.includes(term);
  });

  const activeGuide = guides.find((g) => g.id === activeGuideId);

  return (
    <div className="min-h-screen bg-background pb-24" dir={dir}>
      <PageHeader />
      <div className="bg-primary/5 py-16 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold mb-4">
              <BookOpen className="w-4 h-4" />
              {t("التعليمات والإرشادات")}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground mb-4">
              {t("كل ما تحتاجه للبدء باللعب")}
            </h1>
            <p className="text-muted-foreground text-lg mb-8 max-w-lg leading-relaxed">
              {t(
                "أدلة مصورة خطوة بخطوة لشرح طريقة إضافة الحسابات، تحميل الألعاب، وحل المشاكل الشائعة.",
              )}
            </p>
            <div className="relative max-w-md">
              <Search
                className={`absolute ${dir === "rtl" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground`}
              />
              <input
                type="text"
                placeholder={t("ابحث في الدليل...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full bg-card border border-border rounded-full py-3 ${dir === "rtl" ? "pr-12 pl-4" : "pl-12 pr-4"} focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGuides.map((guide) => (
            <div
              key={guide.id}
              className="group bg-card border border-border rounded-3xl overflow-hidden hover:shadow-xl hover:border-primary/50 transition-all flex flex-col"
            >
              {guide.cover_image && (
                <div className="w-full h-48 bg-muted relative overflow-hidden">
                  <img
                    src={guide.cover_image}
                    alt={getLocalized(guide, "title")}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {getLocalized(guide, "title")}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
                  {getLocalized(guide, "description")}
                </p>
                <div className="flex items-center justify-between text-sm font-bold pt-4 border-t border-border">
                  <span className="text-muted-foreground">
                    {guide.steps?.length || 0} {t("خطوات")}
                  </span>
                  <button
                    onClick={() => {
                      setActiveGuideId(guide.id);
                      setCurrentStep(0);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="text-primary flex items-center gap-1 group-hover:gap-2 transition-all"
                  >
                    {t("ابدأ الدليل")}{" "}
                    <ArrowRight className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredGuides.length === 0 && (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">
              {t("لم يتم العثور على نتائج")}
            </h3>
            <p className="text-muted-foreground">{t("جرب كلمات بحث مختلفة")}</p>
          </div>
        )}
      </div>

      {activeGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setActiveGuideId(null)}
          />
          <div className="relative bg-card w-full max-w-2xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-6 border-b border-border flex justify-between items-center bg-muted/30">
              <div>
                <h2 className="text-xl font-bold">{getLocalized(activeGuide, "title")}</h2>
                <div className="text-sm text-muted-foreground mt-1">
                  {t("الخطوة")} {currentStep + 1} {t("من")} {activeGuide.steps?.length || 0}
                </div>
              </div>
              <button
                onClick={() => setActiveGuideId(null)}
                className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {activeGuide.steps &&
                activeGuide.steps[currentStep] &&
                (() => {
                  const step = activeGuide.steps[currentStep];
                  return (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-black mb-2">{getLocalized(step, "title")}</h3>
                        <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-wrap">
                          {getLocalized(step, "description")}
                        </p>
                      </div>
                      {step.image && (
                        <div className="rounded-2xl overflow-hidden border border-border bg-muted">
                          <img src={step.image} alt="" className="w-full h-auto" />
                        </div>
                      )}
                      {step.video && (
                        <div className="rounded-2xl overflow-hidden border border-border bg-muted relative aspect-video">
                          <video src={step.video} controls className="w-full h-full object-cover" />
                        </div>
                      )}
                      {step.note_ar && (
                        <div className="bg-primary/10 text-primary p-4 rounded-xl text-sm border border-primary/20">
                          {getLocalized(step, "note")}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
            <div className="p-4 sm:p-6 border-t border-border flex justify-between gap-4 bg-background">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="flex-1 py-3 rounded-xl font-bold text-foreground bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("السابق")}
              </button>
              {activeGuide.steps && currentStep < activeGuide.steps.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className="flex-1 py-3 rounded-xl font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  {t("التالي")}
                </button>
              ) : (
                <button
                  onClick={() => setActiveGuideId(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  {t("إنهاء الدليل")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
