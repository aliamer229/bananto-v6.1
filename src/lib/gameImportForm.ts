/**
 * The single-game import pipeline, factored out of the product editor.
 *
 * The editor screen and the ZIP batch importer must produce byte-identical
 * products from the same template file, so the three steps between "the parser
 * returned this" and "the save endpoint receives that" live here rather than
 * inside a component: the blank form a new product starts from, the mapping of
 * parsed fields onto it, and the payload assembled at save time. The parser
 * itself is untouched — this module never reads a template.
 */
import { boxContentsToText } from "./boxContentsText";
import { toStepList } from "./stepsText";
import { safeRandomUUID } from "./polyfills";
import { parseGameImport } from "./gameImportParser";

/** The state a brand new product form starts with. */
export function createBlankProductForm(defaultCategoryId: string): Record<string, any> {
  return {
    title: "",
    titleEn: "",
    titleKu: "",
    slug: "",
    description: "",
    descriptionEn: "",
    descriptionKu: "",
    cartridgeImage: "",
    nintendoCardImage: "",
    coverHiResImage: "",
    coverImage: "",
    bannerImages: [""],
    gallery: [],
    youtubeTrailer: "",
    releaseDate: new Date().toISOString().split("T")[0],
    ageRating: "PEGI 7",
    metacriticRating: "85",
    genres: ["Adventure", "Action"],
    platform: "switch1",
    size: "8.5 GB",
    numberOfPlayers: "1 Player",
    supportedLanguages: "English, Japanese, French, Spanish, German",
    // Hardware — intentionally blank: these are real product specs, never demo text.
    hardwareModel: "",
    colorEdition: "",
    storageCapacity: "",
    screenSpecs: "",
    batteryLife: "",
    boxContents: [],
    boxContentsText: "",
    warrantyCondition: "",
    connectivity: "",
    // Amiibo
    characterName: "Link",
    amiiboSeries: "The Legend of Zelda",
    figureType: "figure",
    inGameUnlock: "فتح زي أسطوري وأسلحة نادرة داخل لعبة Tears of the Kingdom",
    compatibleGames: "Super Smash Bros. Ultimate, Zelda: Tears of the Kingdom, Mario Kart 8",
    boxCondition: "mib",
    releaseWave: "Wave 2 (Restock)",
    rarity: "standard",
    // Accessory
    accessoryType: "حقيبة حماية وتنقل Carry Case",
    compatibleDevices: "Nintendo Switch OLED / Switch V2 / Switch Lite",
    brand: "Nintendo Official",
    material: "Hard EVA Shockproof Shell",
    availableColors: "Black, Neon Red/Blue, White",
    keyFeatures: "مقاوم للصدمات والماء، يتسع لـ 10 أشرطة ألعاب، مقبض مريح",
    // Gift Card
    cardValue: "$20 eShop Balance",
    region: "US",
    cardType: "eshop",
    deliveryMethod: "instant_code",
    redemptionGuide: "",
    redemptionSteps: [],
    validity: "no_expiry",
    // Used
    usedType: "cartridge",
    conditionGrade: "like_new",
    packaging: "cib",
    guaranteeStatus: "tested_30days",
    conditionNotes: "تم الفحص والتعقيم 100%، عمل مثالي بدون أي خدوش أو مشاكل",
    // Bundle
    accountType: "primary",
    badge: "وفر 40%",
    bundleGamesSummary: "حزمة ألعاب مختارة بحساب كامل وجاهز",
    // Common
    price: 25000,
    cost: 18000,
    stock: 5,
    isInfiniteStock: false,
    // Visible to customers unless an admin (or the batch importer) hides it.
    isHidden: false,
    displayOrder: 0,
    category: defaultCategoryId,
    categoryId: defaultCategoryId,
    categoryEn: "",
    categoryKu: "",
    options: [],
    types: [],
    editions: [],
    dlcs: [],
    isActive: true,
    status: "نشط",
    kind: "account",
    // Trade & Store Bonus
    trade_value_iqd: 0,
    store_offer_bonus_iqd: 0,
    trade_enabled: true,
    trade_value_locked: false,
    id: `prd_${safeRandomUUID().replace(/-/g, "").slice(0, 16)}`,
  };
}

/**
 * Folds parsed template data onto a product form.
 *
 * Values the template did not carry are left alone, so importing into a
 * half-filled form only ever adds to it.
 */
export function applyGameImportToForm(
  prev: Record<string, any>,
  importedData: Record<string, any>,
): Record<string, any> {
  const newData: Record<string, any> = { ...prev };
  Object.entries(importedData).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      newData[key] = value;
    }
  });

  // Ensure options have unique ids
  if (Array.isArray(newData.options)) {
    newData.options = newData.options.filter(Boolean).map((opt: any, idx: number) => ({
      ...opt,
      id: opt.id && String(opt.id).trim() ? String(opt.id).trim() : `opt_${Date.now()}_${idx}`,
    }));
  }

  // An imported template fills `variants`; the panel edits `types`.
  if (
    (!Array.isArray(newData.types) || newData.types.length === 0) &&
    Array.isArray(newData.variants) &&
    newData.variants.length > 0
  ) {
    newData.types = newData.variants;
  }

  // Ensure types have unique ids
  if (Array.isArray(newData.types)) {
    newData.types = newData.types.filter(Boolean).map((t: any, idx: number) => ({
      ...t,
      id: t.id && String(t.id).trim() ? String(t.id).trim() : `typ_${Date.now()}_${idx}`,
    }));
  } else if (Array.isArray(newData.variants)) {
    newData.types = newData.variants.filter(Boolean).map((t: any, idx: number) => ({
      ...t,
      id: t.id && String(t.id).trim() ? String(t.id).trim() : `typ_${Date.now()}_${idx}`,
    }));
  }

  if (!newData.category || newData.category === "nintendo_switch_games") {
    newData.category = "cat_nintendo";
  }

  if (newData.boxContents !== undefined) {
    if (Array.isArray(newData.boxContents)) newData.boxContentsList = newData.boxContents;
    newData.boxContentsText = boxContentsToText(newData.boxContents);
  }
  const importedSteps = toStepList(newData.redemptionSteps ?? newData.redemptionGuide);
  if (importedSteps.length) {
    newData.redemptionSteps = importedSteps;
    newData.redemptionGuide = importedSteps.join("\n");
  }

  if (!newData.coverImage) {
    newData.coverImage = newData.cardArtwork || newData.mainImage || prev.coverImage || "";
  }
  // Front-cover sources only. A banner is never promoted here.
  if (!newData.cartridgeImage) {
    newData.cartridgeImage =
      newData.packagingFrontImage || newData.boxImage || prev.cartridgeImage || "";
  }

  return newData;
}

/** The product body the save endpoint expects, assembled from a filled form. */
export function buildProductSavePayload(
  formData: Record<string, any>,
  activeSchema?: { id?: string; kind?: string },
): Record<string, any> {
  const stableId = formData.id || `prd_${safeRandomUUID().replace(/-/g, "").slice(0, 16)}`;
  const selectedCategoryId = formData.categoryId || formData.category || "cat_nintendo";

  const cleanedData = { ...formData };
  
  // Remove UI state and massive fields
  const ignoreKeys = ["files", "previewData", "blob", "blobs", "file", "dataUrl"];
  for (const key of Object.keys(cleanedData)) {
    if (ignoreKeys.includes(key) || typeof cleanedData[key] === "function" || cleanedData[key] instanceof File) {
      delete cleanedData[key];
    } else if (typeof cleanedData[key] === "string" && (cleanedData[key].startsWith("data:image/") || cleanedData[key].startsWith("blob:"))) {
      delete cleanedData[key]; // Do not send base64 or blob strings!
    }
  }

  // Clean nested images in gallery or bannerImages
  if (Array.isArray(cleanedData.gallery)) {
    cleanedData.gallery = cleanedData.gallery.filter(
      (img: any) => typeof img === "string" && !img.startsWith("data:image/") && !img.startsWith("blob:")
    );
  }
  if (Array.isArray(cleanedData.bannerImages)) {
    cleanedData.bannerImages = cleanedData.bannerImages.filter(
      (img: any) => typeof img === "string" && !img.startsWith("data:image/") && !img.startsWith("blob:")
    );
  }

  return {
    ...cleanedData,
    id: stableId,
    category: selectedCategoryId,
    categoryId: selectedCategoryId,
    title: formData.titleEn || formData.title,
    titleEn: formData.titleEn || formData.title,
    description: formData.descriptionEn || formData.description || "",
    descriptionEn: formData.descriptionEn || formData.description || "",
    price: Number(formData.price) || 0,
    cost: Number(formData.cost) || 0,
    stock: formData.isInfiniteStock ? 999999 : Number(formData.stock) || 0,
    displayOrder: Number(formData.displayOrder) || 0,
    image: formData.coverImage || formData.cartridgeImage || formData.image || "",
    banner: formData.bannerImages?.[0] || formData.banner || "",
    nintendoCardImage: formData.nintendoCardImage || "",
    coverHiResImage: formData.coverHiResImage || "",
    // Records the section explicitly, so the storefront renders this product's
    // own details page instead of guessing from the category name.
    schemaId: activeSchema?.id ?? "",
    kind: formData.kind || activeSchema?.kind || "account",
  };
}

export type BatchGameImport =
  { ok: true; payload: Record<string, any> } | { ok: false; reason: string };

/**
 * One template file from a batch archive, ready for the save endpoint.
 *
 * Exactly the single-game import — same parser, same field mapping, same
 * payload — with two flags on top: the product is stored hidden, and the
 * endpoint is told this is a batch run so a taken slug produces a flagged copy
 * instead of a refusal.
 */
export function buildBatchGameImport(rawText: string, categoryId: string): BatchGameImport {
  const parsed = parseGameImport(rawText);
  const blocking = parsed.errors.filter((issue) => issue.severity === "error");
  if (blocking.length > 0) {
    const first = blocking[0]!;
    return { ok: false, reason: `${first.key}: ${first.message}` };
  }

  const form = applyGameImportToForm(createBlankProductForm(categoryId), parsed.data);
  if (!form["titleEn"] && !form["title"]) {
    return { ok: false, reason: "الملف لا يحتوي اسم اللعبة (name=)" };
  }

  return {
    ok: true,
    payload: {
      ...buildProductSavePayload(form),
      isHidden: true,
      batchImport: true,
    },
  };
}
