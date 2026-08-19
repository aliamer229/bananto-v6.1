import PageHeader from "@/components/PageHeader";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, HelpCircle, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import { loadSiteContent } from "@/lib/content.functions";

export const Route = createFileRoute("/faq")({
  loader: async () => await loadSiteContent(),
  component: FaqComponent,
});

function FaqComponent() {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const content = Route.useLoaderData();
  const faqs = content.faq?.filter((f) => f.published) || [];
  const categories =
    content.faqCategories?.filter((c) => c.published).sort((a, b) => a.sort_order - b.sort_order) ||
    [];

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const getLocalized = (obj: any, key: string) => {
    if (!obj) return "";
    return obj[`${key}_${lang}`] || obj[`${key}_ar`] || "";
  };

  const filtered = faqs
    .filter((f) => {
      if (activeCategory !== "all" && f.category_id !== activeCategory) return false;
      if (!search) return true;
      const q = getLocalized(f, "question").toLowerCase();
      const a = getLocalized(f, "answer").toLowerCase();
      const k = (f.keywords || "").toLowerCase();
      const term = search.toLowerCase();
      return q.includes(term) || a.includes(term) || k.includes(term);
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-background pb-24" dir={dir}>
      <PageHeader />
      <div className="bg-primary/5 py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <HelpCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-4xl font-black mb-4">{t("الأسئلة الشائعة")}</h1>
          <div className="relative max-w-xl mx-auto mt-8">
            <Search
              className={`absolute ${dir === "rtl" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5`}
            />
            <input
              type="text"
              placeholder={t("ابحث عن سؤال...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full bg-background border border-border rounded-full py-4 ${dir === "rtl" ? "pr-12 pl-4" : "pl-12 pr-4"} focus:outline-none focus:border-primary shadow-sm`}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-8">
        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}
          >
            {t("الكل")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}
            >
              {getLocalized(c, "name")}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("لم نجد أسئلة تطابق بحثك")}
            </div>
          ) : (
            filtered.map((f) => {
              const isOpen = openId === f.id;
              return (
                <div
                  key={f.id}
                  className="border border-border rounded-2xl bg-card overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : f.id)}
                    className="w-full text-start p-6 flex justify-between items-center focus:outline-none"
                  >
                    <h3 className="font-bold text-lg">{getLocalized(f, "question")}</h3>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-6 pt-0 text-muted-foreground whitespace-pre-wrap leading-relaxed border-t border-border mt-2">
                      {getLocalized(f, "answer")}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
