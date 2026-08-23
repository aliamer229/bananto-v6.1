/**
 * Details page for the hardware / amiibo / accessory sections.
 *
 * Everything rendered here comes from `buildProductView`, which has already
 * resolved labels into the active language and dropped anything empty — so a
 * section that isn't present in the data isn't present on the page either.
 * Nintendo Switch Games keeps its own Game Hub page; this one never touches it.
 */

import {
  BadgeCheck,
  ExternalLink,
  FileText,
  Link2,
  Minus,
  Play,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { useCurrency } from "@/context/CurrencyContext";
import { useTranslation } from "@/i18n";
import { formatDate } from "@/lib/i18n";
import { buildProductView, type ProductView } from "@/lib/productImport/productView";
import type { ProductSchema } from "@/lib/productImport/types";
import { useCartStore } from "@/store/useCartStore";
import type { ProductKind } from "@/lib/types";
import { showAddToCartToast } from "@/utils/cart-toast";
import { resolvePurchaseImage } from "@/lib/nintendoImages";

import { ProductGallery } from "./ProductGallery";
import { HardwareProductDetails } from "./HardwareProductDetails";
import { BulletList, Section, SpecTable } from "./Section";

export function ProductDetails({
  product,
  schema,
}: {
  product: Record<string, unknown>;
  /** Section schema resolved by the caller; detected from the record otherwise. */
  schema?: ProductSchema | undefined;
}) {
  const { t, locale, dir } = useTranslation();
  const view = useMemo(() => buildProductView(product, locale, schema), [product, locale, schema]);
  if (!view) return null;
  if (view.schema.id === "hardware") {
    return <HardwareProductDetails product={product} schema={view.schema} />;
  }
  return (
    <DetailsBody
      product={product}
      view={view}
      t={t}
      locale={locale}
      dir={dir === "rtl" ? "rtl" : "ltr"}
    />
  );
}

function DetailsBody({
  product,
  view,
  t,
  locale,
  dir,
}: {
  product: Record<string, unknown>;
  view: ProductView;
  t: ReturnType<typeof useTranslation>["t"];
  locale: ReturnType<typeof useTranslation>["locale"];
  dir: "rtl" | "ltr";
}) {
  const { formatIQDPrice } = useCurrency();
  const addToCart = useCartStore((s) => s.add);
  const navigate = useNavigate();

  const [optionId, setOptionId] = useState(view.options[0]?.id ?? "");
  const [variantName, setVariantName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const selectedOption = view.options.find((o) => o.id === optionId);
  // Only variants belonging to the chosen option are offered, so the two
  // selectors can never combine into a variant that doesn't exist.
  const variantsForOption = view.variants.filter((v) => !v.optionId || v.optionId === optionId);
  const selectedVariant = variantsForOption.find((v) => v.name === variantName);

  const effectivePrice = selectedVariant?.price ?? selectedOption?.price ?? view.price;
  const effectiveStock = view.isInfiniteStock
    ? Number.POSITIVE_INFINITY
    : (selectedVariant?.stock ?? selectedOption?.stock ?? view.stock);
  const soldOut = effectiveStock <= 0;

  const handleAddToCart = () => {
    if (soldOut) {
      toast.error(t("errors.productOutOfStock"));
      return;
    }
    const labelParts = [selectedOption?.name, selectedVariant?.name].filter(Boolean);
    /*
      The variant / option picture is a genuine per-selection override; anything
      else has to be the product's canonical front cover. This used to fall
      through to `view.images[0]`, which is the first *gallery* frame — so a
      screenshot ended up in the cart line and in the toast.
    */
    const variantImage = selectedVariant?.image || selectedOption?.image || "";
    const itemImage = variantImage || resolvePurchaseImage(product).url;
    addToCart(
      {
        productId: String(product["id"] ?? ""),
        title: view.title,
        image: itemImage,
        price: effectivePrice,
        kind: (view.schema.kind as ProductKind) ?? "accessory",
        requiresAddress: true,
        ...(labelParts.length
          ? { offerKind: labelParts.join(" / "), offerLabel: labelParts.join(" / ") }
          : {}),
      },
      quantity,
    );
    showAddToCartToast({
      title: t("product.addedToCart") || "أُضيف إلى السلة",
      message: `${quantity > 1 ? `${quantity} × ` : ""}${view.title}${labelParts.length ? ` (${labelParts.join(" / ")})` : ""}`,
      product: variantImage ? { image: variantImage } : product,
      quantity,
      navigate,
    });
  };

  return (
    <div
      className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:pt-24 sm:px-6 lg:px-8 [overflow-wrap:anywhere]"
      dir={dir}
    >
      {/* ------------------------------ hero ------------------------------ */}
      <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-2 lg:gap-10">
        <ProductGallery images={view.images} alt={view.title} />

        <div className="space-y-5">
          <div className="space-y-2">
            {view.brand ? (
              <p className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                {view.brand}
              </p>
            ) : null}
            <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{view.title}</h1>
            {view.subtitle ? <p className="text-muted-foreground">{view.subtitle}</p> : null}
          </div>

          {/* Price */}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold" dir="ltr">
              {formatIQDPrice(effectivePrice)}
            </span>
            {view.originalPrice > effectivePrice ? (
              <span className="text-lg text-muted-foreground line-through" dir="ltr">
                {formatIQDPrice(view.originalPrice)}
              </span>
            ) : null}
            {view.discountPercent > 0 ? (
              <span className="rounded-full bg-[var(--bad-bg,#fee)] px-2 py-0.5 text-[12px] font-bold text-[var(--brand-red-dark,#c00)]">
                −{view.discountPercent}%
              </span>
            ) : null}
          </div>

          {/* Stock */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ${
                soldOut
                  ? "bg-[var(--bad-bg,#fee)] text-[var(--brand-red-dark,#c00)]"
                  : "bg-[var(--ok-bg,#e9f7ef)] text-[var(--ok-ink,#137a41)]"
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {soldOut ? t("product.outOfStock") : t("product.inStock")}
            </span>
            {view.availability && !soldOut ? (
              <span className="text-muted-foreground">
                {t(`enums.availability.${view.availability}` as never)}
              </span>
            ) : null}
          </div>

          {view.descriptionShort ? (
            <p className="leading-relaxed text-muted-foreground">{view.descriptionShort}</p>
          ) : null}

          {/* Options */}
          {view.options.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-bold">{t("product.selectOption")}</label>
              <div className="flex flex-wrap gap-2">
                {view.options.map((option) => {
                  const isSelected = option.id === optionId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setOptionId(option.id);
                        setVariantName("");
                      }}
                      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition text-start ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary shadow-2xs"
                          : "border-border hover:border-primary/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{option.name}</span>
                        {option.price != null && option.price > 0 && (
                          <span
                            className={`text-[11px] font-bold font-mono ${
                              isSelected ? "text-primary" : "text-emerald-600 dark:text-emerald-400"
                            }`}
                            dir="ltr"
                          >
                            ({formatIQDPrice(option.price)})
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Variants */}
          {variantsForOption.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-bold">{t("product.selectVariant")}</label>
              <div className="flex flex-wrap gap-2">
                {variantsForOption.map((variant) => {
                  const isSelected = variant.name === variantName;
                  return (
                    <button
                      key={variant.name}
                      type="button"
                      onClick={() =>
                        setVariantName(variant.name === variantName ? "" : variant.name)
                      }
                      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition text-start ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary shadow-2xs"
                          : "border-border hover:border-primary/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{variant.name}</span>
                        {variant.price != null && variant.price > 0 && (
                          <span
                            className={`text-[11px] font-bold font-mono ${
                              isSelected ? "text-primary" : "text-emerald-600 dark:text-emerald-400"
                            }`}
                            dir="ltr"
                          >
                            ({formatIQDPrice(variant.price)})
                          </span>
                        )}
                      </div>
                      {variant.description && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          {variant.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity + add to cart */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label={t("common.previous")}
                className="p-2.5 transition hover:bg-muted"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center text-[15px] font-bold" dir="ltr">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label={t("common.next")}
                className="p-2.5 transition hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={soldOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand-red,#e11d48)] px-6 py-3 font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              {t("product.addToCart")}
            </button>
          </div>

          {view.identity.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-[13px]">
              {view.identity.map((row) => (
                <div key={row.label} className="flex flex-col">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-semibold">
                    {row.label === t("product.releaseDate")
                      ? formatDate(locale, row.value) || row.value
                      : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* ---------------------------- sections ---------------------------- */}

      <Section
        id="overview"
        title={t("product.sections.overview")}
        when={Boolean(view.overview || view.descriptionFull)}
      >
        <div className="space-y-3 whitespace-pre-line leading-relaxed text-muted-foreground">
          {view.overview ? <p>{view.overview}</p> : null}
          {view.descriptionFull ? <p>{view.descriptionFull}</p> : null}
        </div>
      </Section>

      <Section id="features" title={t("product.sections.keyFeatures")} when={view.features.length}>
        <BulletList items={view.features} />
      </Section>

      <Section
        id="highlights"
        title={t("product.sections.highlights")}
        when={view.highlights.length}
      >
        <BulletList items={view.highlights} />
      </Section>

      <Section
        id="specs"
        title={t("product.sections.specifications")}
        when={view.specGroups.length}
      >
        <div className="space-y-6">
          {view.specGroups.map((group, index) => (
            <div key={`${group.label}-${index}`} className="space-y-2">
              {group.label ? (
                <h3 className="text-[15px] font-bold text-foreground">{group.label}</h3>
              ) : null}
              <SpecTable rows={group.specs} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="compatibility"
        title={t("product.sections.compatibility")}
        when={view.compatibility.length}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {view.compatibility.map((item, index) => (
            <div key={`${item.name}-${index}`} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{item.name}</span>
                {item.status ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      item.status === "compatible"
                        ? "bg-[var(--ok-bg,#e9f7ef)] text-[var(--ok-ink,#137a41)]"
                        : item.status === "incompatible"
                          ? "bg-[var(--bad-bg,#fee)] text-[var(--brand-red-dark,#c00)]"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t(`enums.compatibility.${item.status}` as never)}
                  </span>
                ) : null}
              </div>
              {item.notes ? (
                <p className="mt-1 text-[13px] text-muted-foreground">{item.notes}</p>
              ) : null}
              {item.productId ? (
                <a
                  href={`/product/${item.productId}`}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
                >
                  <Link2 className="h-3 w-3" />
                  {t("product.productDetails")}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="game-compatibility"
        title={t("product.sections.gameCompatibility")}
        when={view.gameCompatibility.length}
      >
        <div className="space-y-3">
          {view.gameCompatibility.map((entry, index) => (
            <div key={`${entry.game}-${index}`} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {/* Game titles are proper nouns — never translated. */}
                <h3 className="font-bold">{entry.game}</h3>
                {entry.platform ? (
                  <span className="text-[12px] text-muted-foreground">{entry.platform}</span>
                ) : null}
              </div>
              <dl className="mt-2 space-y-1 text-[13px]">
                {entry.function ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t("amiibo.inGameFunction")}:</dt>
                    <dd className="font-semibold">{entry.function}</dd>
                  </div>
                ) : null}
                {entry.reward ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t("amiibo.inGameReward")}:</dt>
                    <dd className="font-semibold">{entry.reward}</dd>
                  </div>
                ) : null}
              </dl>
              {entry.description ? (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {entry.description}
                </p>
              ) : null}
              {entry.sourceUrl ? (
                <a
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("common.source")}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section id="box" title={t("product.sections.boxContents")} when={view.boxContents.length}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {view.boxContents.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-[14px]"
            >
              <span>
                {item.name}
                {item.notes ? (
                  <span className="block text-[12px] text-muted-foreground">{item.notes}</span>
                ) : null}
              </span>
              {item.quantity ? (
                <span
                  className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-bold"
                  dir="ltr"
                >
                  ×{item.quantity}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="how-to-redeem"
        title={t("product.sections.howToRedeem")}
        when={view.usageSteps.length}
      >
        <ol className="space-y-2">
          {view.usageSteps.map((step, index) => (
            <li
              key={`${step}-${index}`}
              className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 text-[14px] leading-relaxed"
            >
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary"
                dir="ltr"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {view.usageUrl ? (
          <a
            href={view.usageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("product.officialSite")}
          </a>
        ) : null}
        {view.usageTerms ? (
          <p className="mt-3 whitespace-pre-line text-[13px] text-muted-foreground">
            {view.usageTerms}
          </p>
        ) : null}
      </Section>

      <Section id="gallery" title={t("product.sections.gallery")} when={view.gallery.length}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.gallery.map((item, index) => (
            <figure
              key={`${item.url}-${index}`}
              className="overflow-hidden rounded-xl border border-border"
            >
              <img
                src={item.url}
                alt={item.title ?? view.title}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              {item.title || item.description ? (
                <figcaption className="p-3 text-[13px]">
                  {item.title ? <span className="font-bold">{item.title}</span> : null}
                  {item.description ? (
                    <span className="block text-muted-foreground">{item.description}</span>
                  ) : null}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </Section>

      <Section id="videos" title={t("product.sections.videos")} when={view.videos.length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {view.videos.map((video, index) => (
            <a
              key={`${video.url}-${index}`}
              href={video.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Play className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{video.title || video.url}</span>
                {video.type ? (
                  <span className="text-[12px] text-muted-foreground">
                    {t(`enums.videoType.${video.type}` as never)}
                  </span>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      </Section>

      <Section id="docs" title={t("product.sections.documentation")} when={view.documents.length}>
        <ul className="space-y-2">
          {view.documents.map((doc, index) => (
            <li key={`${doc.url}-${index}`}>
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-[14px] transition hover:border-primary/50"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold">{doc.title || doc.url}</span>
                {doc.type ? (
                  <span className="ms-auto text-[12px] text-muted-foreground">
                    {t(`enums.documentType.${doc.type}` as never)}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="warranty" title={t("product.sections.warranty")} when={view.warranty.length}>
        <SpecTable rows={view.warranty} />
      </Section>

      <Section id="updates" title={t("product.sections.updates")} when={view.updates.length}>
        <ol className="space-y-3">
          {view.updates.map((update, index) => (
            <li key={`${update.version}-${index}`} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                {update.version ? (
                  <span className="font-bold" dir="ltr">
                    v{update.version}
                  </span>
                ) : null}
                {update.date ? (
                  <span className="text-[12px] text-muted-foreground">
                    {formatDate(locale, update.date) || update.date}
                  </span>
                ) : null}
              </div>
              {update.title ? <p className="mt-1 font-semibold">{update.title}</p> : null}
              {update.changes ? (
                <p className="mt-1 whitespace-pre-line text-[13px] text-muted-foreground">
                  {update.changes}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="reviews"
        title={t("product.sections.reviews")}
        when={view.externalReviews.length}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {view.externalReviews.map((review, index) => (
            <blockquote
              key={`${review.source}-${index}`}
              className="rounded-xl border border-border p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <cite className="font-bold not-italic">{review.source}</cite>
                {review.score ? (
                  <span className="font-bold text-primary" dir="ltr">
                    {review.score}
                  </span>
                ) : null}
              </div>
              {review.quote ? (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {review.quote}
                </p>
              ) : null}
            </blockquote>
          ))}
        </div>
      </Section>

      <Section
        id="pros-cons"
        title={t("product.sections.prosCons")}
        when={view.pros.length + view.cons.length}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {view.pros.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-bold">{t("product.sections.pros")}</h3>
              <BulletList items={view.pros} tone="good" />
            </div>
          )}
          {view.cons.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-bold">{t("product.sections.cons")}</h3>
              <BulletList items={view.cons} tone="bad" />
            </div>
          )}
        </div>
      </Section>

      <Section id="faq" title={t("product.sections.faq")} when={view.faq.length}>
        <div className="space-y-2">
          {view.faq.map((item, index) => (
            <details
              key={`${item.question}-${index}`}
              className="rounded-xl border border-border p-4"
            >
              <summary className="cursor-pointer font-semibold">{item.question}</summary>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="sources" title={t("product.sections.sources")} when={view.sources.length}>
        <ul className="space-y-2">
          {view.sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 text-[13px] text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="font-semibold">{source.name}</span>
                {source.type ? (
                  <span className="text-muted-foreground">
                    · {t(`enums.sourceType.${source.type}` as never)}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
