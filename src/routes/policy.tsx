import PageHeader from "@/components/PageHeader";
import { useI18n } from "@/i18n";
import { loadSiteContent } from "@/lib/content.functions";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, FileText, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/policy")({
  loader: async () => await loadSiteContent(),
  component: PolicyComponent,
});

function PolicyComponent() {
  const t = useI18n((state) => state.t);
  const lang = useI18n((state) => state.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const content = Route.useLoaderData();
  const policy = content.policy;

  const getLocalized = (value: Record<string, unknown> | null | undefined, key: string) => {
    if (!value) return "";
    return String(value[`${key}_${lang}`] || value[`${key}_ar`] || "");
  };

  const sections = [...(policy.sections || [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-background pb-24" dir={dir}>
      <PageHeader />

      <header className="border-b border-border bg-card px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <FileText className="mx-auto mb-6 h-12 w-12 text-primary opacity-80" />
          <h1 className="mb-4 text-4xl font-black text-foreground">
            {getLocalized(policy as unknown as Record<string, unknown>, "title")}
          </h1>
          <p className="mb-6 text-lg text-muted-foreground">
            {getLocalized(policy as unknown as Record<string, unknown>, "subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              {t("الإصدار:")} {policy.version}
            </div>
            {policy.effective_date ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t("سارية منذ:")} {policy.effective_date}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-12 px-4 lg:grid-cols-12">
        <aside className="hidden lg:col-span-4 lg:block">
          <nav className="sticky top-24 space-y-2 border-l-2 border-border pl-6 rtl:border-r-2 rtl:border-l-0 rtl:pr-6 rtl:pl-0">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("المحتويات")}
            </h2>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-1 text-sm text-foreground/80 transition-colors hover:text-primary"
              >
                {getLocalized(section as unknown as Record<string, unknown>, "title")}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-16 lg:col-span-8">
          {policy.important_notices ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <ShieldAlert className="h-5 w-5" /> {t("ملاحظات هامة")}
              </h2>
              <p className="text-sm leading-relaxed">{policy.important_notices}</p>
            </div>
          ) : null}

          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={`scroll-mt-24 ${
                section.highlight ? "rounded-3xl border border-primary/20 bg-primary/5 p-6" : ""
              }`}
            >
              <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-foreground">
                {getLocalized(section as unknown as Record<string, unknown>, "title")}
              </h2>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-muted-foreground dark:prose-invert md:prose-base leading-loose">
                {getLocalized(section as unknown as Record<string, unknown>, "body")}
              </div>
            </section>
          ))}

          {policy.contact_note ? (
            <div className="mt-12 border-t border-border pt-12 text-center text-muted-foreground">
              <p>{policy.contact_note}</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
