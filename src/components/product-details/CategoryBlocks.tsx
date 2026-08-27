/**
 * The blocks a category is actually sold on.
 *
 * A used console is bought on its condition grade and what the inspection
 * found; a bundle on what is in it and what that would cost separately; a gift
 * card on its region and how the code arrives; an amiibo on what it unlocks in
 * which game. Rendering any of those as rows in a generic specification table
 * is technically complete and practically useless, so each gets a shape here.
 *
 * Every component returns `null` when its data is absent — the section registry
 * has already decided the section exists, and this is the second line of
 * defence against a heading with nothing under it.
 */

import { useMemo } from "react";
import { BadgeCheck, CircleAlert, ExternalLink, Link2, ShieldCheck, Sparkles } from "lucide-react";

import { useTranslation } from "@/i18n";
import { useStoreData } from "@/hooks/useStoreData";
import { productImageUrl } from "@/lib/productImages";
import { formatDate } from "@/lib/i18n";
import type {
  AmiiboView,
  BundleView,
  ConditionView,
  GiftCardView,
  ProductView,
} from "@/lib/productImport/productView";

import { SpecTable } from "./Section";

/** A localized enum value, falling back to the stored value rather than a key. */
function useEnum() {
  const { t } = useTranslation();
  return (namespace: string, value: string) => {
    if (!value) return "";
    const label = t(`enums.${namespace}.${value}` as never);
    return label && !label.startsWith("enums.") ? label : value;
  };
}

/* --------------------------------- used ---------------------------------- */

/** Grades ordered best to worst, so the meter reads as a scale, not a badge. */
const GRADE_SCALE = ["like_new", "excellent", "very_good", "good", "acceptable", "for_parts"];

const GRADE_TONE: Record<string, string> = {
  like_new: "bg-emerald-500",
  excellent: "bg-emerald-500",
  very_good: "bg-lime-500",
  good: "bg-amber-500",
  acceptable: "bg-orange-500",
  for_parts: "bg-red-500",
};

export function ConditionBlock({ condition }: { condition: ConditionView }) {
  const { t, locale } = useTranslation();
  const label = useEnum();
  const gradeIndex = GRADE_SCALE.indexOf(condition.grade);

  const facts = [
    { label: t("used.itemType"), value: label("usedType", condition.usedType) },
    { label: t("used.packaging"), value: label("packaging", condition.packaging) },
    { label: t("used.guarantee"), value: label("guaranteeStatus", condition.guarantee) },
    {
      label: t("used.previousOwners"),
      value: condition.previousOwners != null ? String(condition.previousOwners) : "",
    },
    {
      label: t("used.usagePeriod"),
      value:
        condition.usagePeriodMonths != null
          ? `${condition.usagePeriodMonths} ${t("specs.usagePeriodMonths")}`
          : "",
    },
  ].filter((row) => row.value);

  return (
    <div className="space-y-4">
      {condition.grade ? (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold text-muted-foreground">{t("used.grade")}</span>
            <span className="text-lg font-bold">{label("conditionGrade", condition.grade)}</span>
          </div>
          {gradeIndex >= 0 ? (
            <div className="mt-3 flex gap-1" aria-hidden="true">
              {GRADE_SCALE.map((grade, index) => (
                <span
                  key={grade}
                  className={`h-1.5 flex-1 rounded-full ${
                    index <= gradeIndex ? (GRADE_TONE[condition.grade] ?? "bg-primary") : "bg-muted"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {facts.length > 0 ? <SpecTable rows={facts} /> : null}

      {condition.notes ? (
        <div className="rounded-2xl border border-border p-4">
          <h3 className="mb-1 text-[14px] font-bold">{t("used.conditionNotes")}</h3>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
            {condition.notes}
          </p>
        </div>
      ) : null}

      {/*
        A used listing that lists no defects is making a claim, so it says so in
        words. Silence here reads as "we didn't check".
      */}
      <div className="rounded-2xl border border-border p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
          <CircleAlert className="h-4 w-4 text-amber-500" />
          {t("used.defects")}
        </h3>
        {condition.defects.length > 0 ? (
          <ul className="space-y-1.5">
            {condition.defects.map((defect, index) => (
              <li key={`${defect}-${index}`} className="flex items-start gap-2 text-[14px]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{defect}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">{t("used.noDefects")}</p>
        )}
      </div>

      {condition.testedAt ? (
        <p className="text-[12px] text-muted-foreground">
          {t("used.testedAt")}: {formatDate(locale, condition.testedAt) || condition.testedAt}
        </p>
      ) : null}
    </div>
  );
}

export function InspectionBlock({ condition }: { condition: ConditionView }) {
  const { t, locale } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {condition.tested !== null ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${
              condition.tested
                ? "bg-[var(--ok-bg,#e9f7ef)] text-[var(--ok-ink,#137a41)]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            {condition.tested ? t("used.tested") : t("used.notTested")}
          </span>
        ) : null}
        {condition.cleaned ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-bg,#e9f7ef)] px-3 py-1 text-[13px] font-bold text-[var(--ok-ink,#137a41)]">
            <Sparkles className="h-4 w-4" />
            {t("used.cleaned")}
          </span>
        ) : null}
        {condition.testedAt ? (
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[13px] text-muted-foreground">
            {formatDate(locale, condition.testedAt) || condition.testedAt}
          </span>
        ) : null}
      </div>

      {condition.inspectionPoints.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {condition.inspectionPoints.map((point, index) => (
            <li
              key={`${point}-${index}`}
              className="flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-[14px]"
            >
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok-ink,#137a41)]" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------- bundle --------------------------------- */

export function BundleContentsBlock({
  bundle,
  formatPrice,
}: {
  bundle: BundleView;
  formatPrice: (value: number) => string;
}) {
  const { t } = useTranslation();
  const { data: store } = useStoreData();

  /*
    A bundle item carries a copy of the game's title, platform and cover so the
    row still renders for a title the store does not stock. When it *does* name
    a store product, the live record wins: the copy in the bundle was written
    the day the bundle was built, and a re-titled or re-shot product would
    otherwise keep showing its old identity here for as long as the bundle
    exists. `cover_url` stays the fallback the template calls it.
  */
  const live = useMemo(() => {
    const index = new Map<string, Record<string, unknown>>();
    for (const product of (store?.products ?? []) as Record<string, unknown>[]) {
      const id = String(product?.["id"] ?? "").trim();
      const slug = String(product?.["slug"] ?? "").trim();
      if (id) index.set(id.toLowerCase(), product);
      if (slug) index.set(slug.toLowerCase(), product);
    }
    return index;
  }, [store?.products]);

  return (
    <div className="space-y-4">
      {bundle.summary ? (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
          {bundle.summary}
        </p>
      ) : null}

      {/*
        Compact by design. A bundle card that gives each included title a
        full-width hero turns eight games into eight screens of scrolling; the
        list is what a buyer scans, so it stays a list.
      */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {bundle.items.map((item, index) => {
          const linked = item.productId ? live.get(item.productId.toLowerCase()) : undefined;
          const title =
            (linked &&
              String(linked["titleEn"] || linked["title"] || linked["english_name"] || "").trim()) ||
            item.title;
          const platform = (linked && String(linked["platform"] ?? "").trim()) || item.platform;
          const cover = linked ? productImageUrl(linked, "thumbnail") : item.coverUrl;
          // Slug is the public identity; the immutable id is the fallback link.
          const href = linked
            ? `/product/${String(linked["slug"] || linked["id"] || item.productId)}`
            : item.productId
              ? `/product/${item.productId}`
              : "";

          const content = (
            <>
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  className="h-14 w-10 shrink-0 rounded-md bg-muted object-contain"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                {/* Game titles are proper nouns — never translated. */}
                <span className="block truncate font-bold">{title}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {[platform, item.edition].filter(Boolean).join(" · ")}
                </span>
              </span>
              {item.value > 0 ? (
                <span
                  className="shrink-0 text-[12px] font-bold text-muted-foreground line-through"
                  dir="ltr"
                >
                  {formatPrice(item.value)}
                </span>
              ) : null}
            </>
          );

          const className =
            "flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-[14px] min-w-0";

          /*
            Linked by the store's own product id when the import provided one,
            so the title, cover and platform a customer clicks through to are
            the live product rather than the copy frozen into this bundle.
          */
          return (
            <li key={`${item.title}-${index}`} className="min-w-0">
              {href ? (
                <a href={href} className={`${className} transition hover:border-primary/50`}>
                  {content}
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                </a>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      {bundle.includedServices.length > 0 ? (
        <div>
          <h3 className="mb-2 text-[14px] font-bold">{t("bundle.includedServices")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {bundle.includedServices.map((service, index) => (
              <li
                key={`${service}-${index}`}
                className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold"
              >
                {service}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------- gift card -------------------------------- */

export function CardDetailsBlock({ card }: { card: GiftCardView }) {
  const { t, locale } = useTranslation();
  const label = useEnum();

  const rows = [
    { label: t("giftCard.value"), value: [card.value, card.currency].filter(Boolean).join(" ") },
    { label: t("giftCard.region"), value: card.region },
    { label: t("giftCard.platform"), value: card.platform },
    { label: t("giftCard.validity"), value: label("validity", card.validity) },
    {
      label: t("giftCard.expiry"),
      value: card.expiryDate ? formatDate(locale, card.expiryDate) || card.expiryDate : "",
    },
    { label: t("giftCard.codeLength"), value: card.codeLength },
  ].filter((row) => row.value);

  return (
    <div className="space-y-4">
      {rows.length > 0 ? <SpecTable rows={rows} /> : null}

      {/*
        The single most common reason a code fails, stated before purchase
        rather than in a support thread afterwards.
      */}
      {card.regionLocked ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[13px]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <b className="block">{t("giftCard.regionCompatibility")}</b>
            {t("giftCard.regionWarning")}
          </span>
        </div>
      ) : card.regionLocked === false ? (
        <p className="text-[13px] text-muted-foreground">{t("giftCard.regionFree")}</p>
      ) : null}

      {card.regionBanner ? (
        <img
          src={card.regionBanner}
          alt=""
          loading="lazy"
          className="w-full max-w-full rounded-xl object-contain"
        />
      ) : null}
    </div>
  );
}

export function DeliveryBlock({ view }: { view: ProductView }) {
  const { t } = useTranslation();
  const label = useEnum();
  const rows = [
    {
      label: t("giftCard.deliveryMethod"),
      value: view.giftCard ? label("deliveryMethod", view.giftCard.deliveryMethod) : "",
    },
    {
      label: t("giftCard.deliveryTime"),
      value: view.giftCard?.deliveryTime || view.bundle?.deliveryTime || "",
    },
  ].filter((row) => row.value);
  if (rows.length === 0) return null;
  return <SpecTable rows={rows} />;
}

/* --------------------------------- amiibo --------------------------------- */

export function AmiiboFunctionalityBlock({ amiibo }: { amiibo: AmiiboView }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {amiibo.functionality ? (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
          {amiibo.functionality}
        </p>
      ) : null}

      {amiibo.nfcSupport !== null ? (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${
            amiibo.nfcSupport
              ? "bg-[var(--ok-bg,#e9f7ef)] text-[var(--ok-ink,#137a41)]"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          NFC
        </span>
      ) : null}

      {amiibo.compatibleConsoles.length > 0 ? (
        <div>
          <h3 className="mb-2 text-[14px] font-bold">{t("amiibo.compatibleConsoles")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {amiibo.compatibleConsoles.map((console, index) => (
              <li
                key={`${console}-${index}`}
                className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold"
              >
                {/* Console names are proper nouns — never translated. */}
                {console}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CollectorBlock({ amiibo }: { amiibo: AmiiboView }) {
  const { t } = useTranslation();
  const label = useEnum();
  const rows = [
    { label: t("amiibo.edition"), value: label("edition", amiibo.edition) },
    { label: t("amiibo.rarity"), value: label("rarity", amiibo.rarity) },
    { label: t("amiibo.productionStatus"), value: label("productionStatus", amiibo.productionStatus) },
    ...amiibo.collection,
  ].filter((row) => row.value);

  return (
    <div className="space-y-3">
      {rows.length > 0 ? <SpecTable rows={rows} /> : null}
      {amiibo.collectorNotes ? (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
          {amiibo.collectorNotes}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------- shared: game compatibility ---------------------- */

export function GameCompatibilityBlock({ view }: { view: ProductView }) {
  const { t } = useTranslation();
  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[36rem] text-start text-[13px]">
        <thead className="bg-muted/50 text-[12px] font-bold">
          <tr>
            <th className="px-3 py-2 text-start">{t("amiibo.compatibleGames")}</th>
            <th className="px-3 py-2 text-start">{t("giftCard.platform")}</th>
            <th className="px-3 py-2 text-start">{t("amiibo.inGameFunction")}</th>
            <th className="px-3 py-2 text-start">{t("amiibo.inGameReward")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {view.gameCompatibility.map((entry, index) => (
            <tr key={`${entry.game}-${index}`} className="align-top odd:bg-muted/20">
              <td className="px-3 py-2 font-bold">
                {/* Game titles are proper nouns — never translated. */}
                {entry.game}
                {entry.description ? (
                  <span className="mt-1 block font-normal text-muted-foreground">
                    {entry.description}
                  </span>
                ) : null}
                {entry.sourceUrl ? (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("common.source")}
                  </a>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{entry.platform || "—"}</td>
              <td className="px-3 py-2">{entry.function || "—"}</td>
              <td className="px-3 py-2">{entry.reward || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
