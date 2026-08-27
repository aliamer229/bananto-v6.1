/**
 * Which sections a product page is made of, and in what order.
 *
 * The details page used to be a fixed sequence of `<Section>` elements, each
 * deciding for itself whether it had anything to show. That worked, but two
 * things could not be built on top of it: the sticky navigation had no way to
 * know which sections would actually render (so it either listed sections that
 * did not exist or had to duplicate every emptiness check), and every category
 * got the same running order — a used console led with "Overview" and buried
 * its condition grade under the specification tables.
 *
 * So the shape of the page is data now. Each entry below names:
 *
 *  - **who it belongs to** — `schemas`, the sections a category actually has;
 *  - **where it goes** — `order`, the shared information architecture;
 *  - **whether it exists** — `has(view)`, read from the built view model.
 *
 * `resolveSections` runs those three questions once, and both the page body and
 * the navigation are rendered from its answer. A section that returns false is
 * not rendered, does not reserve height, and does not appear in the nav — which
 * is the whole of the "no empty space" rule, enforced in one place instead of
 * twenty.
 */

import type { ProductView } from "./productView";

export type SectionId =
  | "keyFacts"
  | "condition"
  | "inspection"
  | "bundleContents"
  | "cardDetails"
  | "amiiboFunctionality"
  | "aboutCharacter"
  | "figureDetails"
  | "overview"
  | "features"
  | "highlights"
  | "compatibility"
  | "gameCompatibility"
  | "specs"
  | "boxContents"
  | "howToRedeem"
  | "requirements"
  | "delivery"
  | "gallery"
  | "videos"
  | "documentation"
  | "warranty"
  | "collector"
  | "updates"
  | "prosCons"
  | "reviews"
  | "faq"
  | "sources";

export interface SectionDef {
  id: SectionId;
  /** Key under `product.sections.*`, so headings follow the UI language. */
  titleKey: string;
  /** Position in the shared information architecture. Lower renders first. */
  order: number;
  /** Schema ids this section belongs to; omitted means every category. */
  schemas?: readonly string[];
  /** Does this product carry anything for it? */
  has: (view: ProductView) => boolean;
  /**
   * Sections dense enough to be worth jumping to. A two-line "Key facts" strip
   * is rendered but not listed, because a nav entry per paragraph is the
   * over-long tab bar this replaces.
   */
  nav?: boolean;
}

const text = (value: string | undefined | null) => Boolean(value && value.trim());

/**
 * The catalogue of sections.
 *
 * Order follows the shared architecture: identity and purchase (rendered by the
 * page itself), then the category's own headline section, then the general
 * content, then the supporting material. Each category simply drops what it
 * does not have.
 */
export const PRODUCT_SECTIONS: SectionDef[] = [
  {
    id: "keyFacts",
    titleKey: "product.sections.keyFacts",
    order: 10,
    has: (v) =>
      v.identity.length > 0 ||
      Boolean(v.giftCard) ||
      Boolean(v.condition) ||
      Boolean(v.bundle) ||
      Boolean(v.amiibo),
  },

  /* ------------------------ the category's headline ------------------------ */
  {
    id: "condition",
    titleKey: "product.sections.condition",
    order: 20,
    schemas: ["used"],
    nav: true,
    has: (v) =>
      Boolean(
        v.condition &&
          (text(v.condition.grade) ||
            text(v.condition.notes) ||
            text(v.condition.packaging) ||
            text(v.condition.guarantee) ||
            v.condition.defects.length > 0),
      ),
  },
  {
    id: "inspection",
    titleKey: "product.sections.inspection",
    order: 25,
    schemas: ["used"],
    nav: true,
    has: (v) =>
      Boolean(
        v.condition &&
          (v.condition.inspectionPoints.length > 0 ||
            v.condition.tested !== null ||
            text(v.condition.testedAt)),
      ),
  },
  {
    id: "bundleContents",
    titleKey: "product.sections.bundleContents",
    order: 20,
    schemas: ["bundle"],
    nav: true,
    has: (v) => Boolean(v.bundle && v.bundle.items.length > 0),
  },
  {
    id: "cardDetails",
    titleKey: "product.sections.cardDetails",
    order: 20,
    schemas: ["gift_card"],
    nav: true,
    has: (v) =>
      Boolean(
        v.giftCard &&
          (text(v.giftCard.region) || text(v.giftCard.validity) || text(v.giftCard.platform)),
      ),
  },
  {
    id: "aboutCharacter",
    titleKey: "product.sections.aboutCharacter",
    order: 20,
    schemas: ["amiibo"],
    nav: true,
    has: (v) => Boolean(v.amiibo && text(v.amiibo.characterDescription)),
  },
  {
    id: "amiiboFunctionality",
    titleKey: "product.sections.amiiboFunctionality",
    order: 22,
    schemas: ["amiibo"],
    nav: true,
    has: (v) =>
      Boolean(
        v.amiibo &&
          (text(v.amiibo.functionality) ||
            v.amiibo.nfcSupport !== null ||
            v.amiibo.compatibleConsoles.length > 0),
      ),
  },

  /* ------------------------------- shared body ----------------------------- */
  {
    id: "overview",
    titleKey: "product.sections.overview",
    order: 30,
    nav: true,
    has: (v) => text(v.overview) || text(v.descriptionFull),
  },
  {
    id: "features",
    titleKey: "product.sections.keyFeatures",
    order: 35,
    nav: true,
    has: (v) => v.features.length > 0,
  },
  {
    id: "highlights",
    titleKey: "product.sections.highlights",
    order: 36,
    has: (v) => v.highlights.length > 0,
  },
  {
    id: "gameCompatibility",
    titleKey: "product.sections.gameCompatibility",
    order: 40,
    schemas: ["amiibo"],
    nav: true,
    has: (v) => v.gameCompatibility.length > 0,
  },
  {
    id: "compatibility",
    titleKey: "product.sections.compatibility",
    order: 42,
    nav: true,
    has: (v) => v.compatibility.length > 0,
  },
  {
    id: "figureDetails",
    titleKey: "product.sections.figureDetails",
    order: 44,
    schemas: ["amiibo"],
    has: (v) => v.specGroups.length > 0,
  },
  {
    id: "specs",
    titleKey: "product.sections.specifications",
    order: 45,
    // amiibo renders the same tables under "Figure details"; printing both
    // would show one product's measurements twice.
    schemas: ["used", "accessory", "gift_card", "bundle", "hardware"],
    nav: true,
    has: (v) => v.specGroups.length > 0,
  },
  {
    id: "boxContents",
    titleKey: "product.sections.boxContents",
    order: 50,
    nav: true,
    has: (v) => v.boxContents.length > 0,
  },
  {
    id: "howToRedeem",
    titleKey: "product.sections.howToRedeem",
    order: 55,
    nav: true,
    has: (v) => v.usageSteps.length > 0 || text(v.usageUrl) || text(v.usageTerms),
  },
  {
    id: "requirements",
    titleKey: "product.sections.requirements",
    order: 57,
    has: (v) => v.requirements.length > 0,
  },
  {
    id: "delivery",
    titleKey: "product.sections.delivery",
    order: 58,
    schemas: ["gift_card", "bundle"],
    has: (v) =>
      Boolean(
        (v.giftCard && (text(v.giftCard.deliveryMethod) || text(v.giftCard.deliveryTime))) ||
          (v.bundle && text(v.bundle.deliveryTime)),
      ),
  },
  {
    id: "gallery",
    titleKey: "product.sections.gallery",
    order: 60,
    nav: true,
    has: (v) => v.gallery.length > 0,
  },
  {
    id: "videos",
    titleKey: "product.sections.videos",
    order: 62,
    has: (v) => v.videos.length > 0,
  },
  {
    id: "documentation",
    titleKey: "product.sections.documentation",
    order: 64,
    has: (v) => v.documents.length > 0,
  },
  {
    id: "collector",
    titleKey: "product.sections.collector",
    order: 66,
    schemas: ["amiibo"],
    nav: true,
    has: (v) =>
      Boolean(v.amiibo && (v.amiibo.collection.length > 0 || text(v.amiibo.collectorNotes))),
  },
  {
    id: "warranty",
    titleKey: "product.sections.warranty",
    order: 70,
    nav: true,
    has: (v) => v.warranty.length > 0 || text(v.refundPolicy),
  },
  {
    id: "updates",
    titleKey: "product.sections.updates",
    order: 72,
    has: (v) => v.updates.length > 0,
  },
  {
    id: "prosCons",
    titleKey: "product.sections.prosCons",
    order: 74,
    has: (v) => v.pros.length + v.cons.length > 0,
  },
  {
    id: "reviews",
    titleKey: "product.sections.reviews",
    order: 76,
    has: (v) => v.externalReviews.length > 0,
  },
  {
    id: "faq",
    titleKey: "product.sections.faq",
    order: 80,
    nav: true,
    has: (v) => v.faq.length > 0,
  },
  {
    id: "sources",
    titleKey: "product.sections.sources",
    order: 90,
    has: (v) => v.sources.length > 0,
  },
];

/**
 * The sections this particular product actually has, in render order.
 *
 * The page maps over the result and the navigation lists the `nav` ones, so the
 * two can never disagree about what is on the page.
 */
export function resolveSections(view: ProductView): SectionDef[] {
  const schemaId = view.schema.id;
  return PRODUCT_SECTIONS.filter(
    (section) =>
      (!section.schemas || section.schemas.includes(schemaId)) && section.has(view),
  ).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The subset worth a jump link. */
export function navSections(sections: SectionDef[]): SectionDef[] {
  return sections.filter((section) => section.nav);
}
