/**
 * Maps our own product record (as saved by the admin panel, see
 * `src/lib/hub-schema.ts` for the exact field keys) onto the reference Game
 * Hub model (`src/hub/types.ts`).
 */

import {
  lines,
  rows,
  youtubeEmbed,
  readOffers,
  type ListRow,
  str,
  slugify,
  num,
  bool,
  getTextValue,
} from "@/lib/hub";
import { resolveNintendoImage, resolveCaseSleeve } from "@/lib/nintendoImages";
import { buildFitFor, buildFeatures } from "./mappers";
import { toAmount } from "@/lib/purchasable";
import { gb } from "@/hub/utils/format";
import { getDevicePerformanceList } from "@/lib/devicePerformance";
import type {
  Game,
  GameImage,
  GameVideo,
  GameEdition,
  GameplayPillar,
  GameplayPillarId,
  StorySection,
  FeatureTag,
  PerformanceProfile,
  StorageInfo,
  LanguageSupport,
  MultiplayerInfo,
  Dlc,
  Guide,
  CompletionInfo,
  FaqItem,
  TimelineEvent,
  PatchNote,
  Soundtrack,
  GameSeries,
  NintendoDetail,
  PlayMode,
  Switch2Enhancement,
  EditorVerdict,
  StoreOffer,
  Money,
  PlatformId,
  Fact,
} from "@/hub/types";

export function localizedValue(
  p: Record<string, unknown>,
  arKey: string,
  enKey: string,
  locale: "ar" | "en",
) {
  if (locale === "ar") {
    return str(p[arKey]) || str(p[enKey]);
  }
  return str(p[enKey]) || str(p[arKey]);
}

const hasNum = (v: unknown) => str(v) !== "" && Number.isFinite(toAmount(v)) && toAmount(v) !== 0;

const confirmed = <T>(value: T, source = "لوحة الإدارة"): Fact<T> => ({
  value,
  status: "confirmed",
  source,
});

function buildCore(p: Record<string, unknown>, locale: "ar" | "en") {
  const title = str(p["titleEn"]) || str(p["english_name"]) || str(p["title"]);

  const desc =
    locale === "en"
      ? str(p["descriptionEn"]) || str(p["description"])
      : str(p["descriptionAr"]) || str(p["description"]) || str(p["descriptionEn"]);

  const tag =
    locale === "en"
      ? str(p["taglineEn"]) || str(p["tagline"])
      : str(p["tagline"]) || str(p["taglineEn"]);

  return {
    title: title || "Product",
    description: desc || undefined,
    tagline: tag || undefined,
  };
}

function buildMedia(p: Record<string, unknown>, locale: "ar" | "en") {
  // The hub used to read `coverImage → image → cartridgeImage`, while the home
  // strips read the same three fields in the opposite order — so one product
  // legitimately showed two different covers. Both now ask the resolver.
  const front = resolveNintendoImage(p, "front-cover");
  const coverUrl = front.isPlaceholder ? undefined : front.url;
  const banner = resolveNintendoImage(p, "banner");
  const keyArtUrl = banner.isPlaceholder ? undefined : banner.url;
  const texture = resolveNintendoImage(p, "3d-texture");

  const productTitleEng = str(p["titleEn"]) || str(p["english_name"]) || str(p["title"]);

  const galleryRows = rows(p["galleryImages"]);
  const legacyGallery = Array.isArray(p["gallery"])
    ? (p["gallery"] as unknown[]).map(str).filter(Boolean)
    : [];
  const images: GameImage[] = [
    ...rows(p["galleryImages"]).map((row, i) => ({
      id: `img-${i}`,
      url: str(row["url"]),
      alt: localizedValue(row, "alt", "altEn", locale) || productTitleEng || "",
    })),
    ...legacyGallery.map((url, i) => ({
      id: `legacy-img-${i}`,
      url,
      alt: productTitleEng || "",
    })),
  ].filter((img) => img.url);

  const videoRows = rows(p["videos"]);
  const trailerUrl = str(p["trailerUrl"]);
  const videos: GameVideo[] = [
    ...(trailerUrl
      ? [
          {
            id: "trailer",
            kind: "trailer" as const,
            title: locale === "en" ? "Official Trailer" : "الإعلان الرسمي",
            embedUrl: youtubeEmbed(trailerUrl) ?? trailerUrl,
          },
        ]
      : []),
    ...videoRows.reduce<GameVideo[]>((acc, row, i) => {
      const embedUrl = youtubeEmbed(row["url"]);
      if (!embedUrl) return acc;
      acc.push({
        id: `video-${i}`,
        kind: "gameplay" as const,
        title:
          localizedValue(row, "title", "titleEn", locale) || (locale === "en" ? "Video" : "فيديو"),
        embedUrl,
      });
      return acc;
    }, []),
  ];

  const caseSleeve = resolveCaseSleeve(p);

  return {
    coverUrl,
    keyArtUrl,
    caseSleeve,
    /** Highest-resolution front cover available; what the 3D sleeve should sample. */
    coverTextureUrl: texture.isPlaceholder ? undefined : texture.url,
    /** Stored crop for `coverUrl`, when the catalogue carries one. */
    coverTrim: front.trim,
    images: images.length ? images : undefined,
    videos: videos.length ? videos : undefined,
  };
}

function buildGenres(p: Record<string, unknown>): string[] | undefined {
  const genres = Array.isArray(p["genres"])
    ? (p["genres"] as unknown[])
        .map((r) =>
          getTextValue(typeof r === "object" && r !== null && "value" in r ? (r as any).value : r),
        )
        .filter(Boolean)
    : lines(p["genre"]);
  return genres.length ? genres : undefined;
}

function buildAgeRating(p: Record<string, unknown>): Game["ageRating"] | undefined {
  const raw = str(p["ageRating"]);
  if (!raw) return undefined;

  // Catalogue entries usually already name the system ("ESRB E10+ ..."), and
  // prefixing another one produced "ESRB ESRB E10+" on the page. Take the
  // system from the value when it carries one.
  const match = /^\s*(ESRB|PEGI|CERO|USK)\b[\s:.-]*/i.exec(raw);
  if (match) {
    const system = match[1]!.toUpperCase() as NonNullable<Game["ageRating"]>["system"];
    const label = raw.slice(match[0].length).trim();
    return { system, label: label || raw.trim() };
  }
  return { system: "ESRB", label: raw };
}

function buildNintendo(
  p: Record<string, unknown>,
  locale: "ar" | "en",
): NintendoDetail | undefined {
  const platform = str(p["platform"]);
  const switch2Enhanced = bool(p["switch2Enhanced"]);
  const isSwitch2Only = platform === "switch2" && !switch2Enhanced;

  const runsOn: NintendoDetail["runsOn"] = isSwitch2Only ? ["switch2"] : ["switch", "switch2"];

  const playModesText = str(p["nintendoPlayModes"]);
  const playModes: PlayMode[] | undefined = playModesText
    ? (["tv", "handheld", "tabletop"] as PlayMode[]).filter((mode) => {
        const kw: Record<PlayMode, RegExp> = {
          tv: /تلفاز|tv|dock/i,
          handheld: /محمول|handheld/i,
          tabletop: /طاولة|tabletop/i,
        };
        return kw[mode].test(playModesText);
      })
    : undefined;

  const features: NintendoDetail["features"] = [];
  if ("nintendoCloudSaves" in p) {
    features.push({ id: "cloud-saves", supported: bool(p["nintendoCloudSaves"]) });
  }

  const enhancementLines = rows(p["switch2Features"])
    .map((r) => {
      const v = locale === "en" && r["valueEn"] ? r["valueEn"] : r["value"];
      return getTextValue(v !== undefined ? v : r);
    })
    .filter(Boolean);
  const enhancementMatchers: Array<{ id: Switch2Enhancement["id"]; re: RegExp }> = [
    { id: "resolution", re: /دقة|resolution|4k|1080|1440/i },
    { id: "framerate", re: /إطار|fps|frame ?rate|60|120/i },
    { id: "hdr", re: /hdr/i },
    { id: "loading", re: /تحميل|loading/i },
    { id: "textures", re: /نسيج|texture/i },
    { id: "ray-tracing", re: /ray.?tracing|إضاءة/i },
    { id: "mouse-controls", re: /ماوس|mouse/i },
    { id: "gamechat", re: /gamechat|دردشة/i },
  ];
  const enhancements: Switch2Enhancement[] = enhancementLines.map((label, i) => {
    const match = enhancementMatchers.find((m) => m.re.test(label));
    return { id: match?.id ?? "effects", label };
  });

  const detail: NintendoDetail = {
    runsOn,
    ...(isSwitch2Only ? { switch2Only: true } : {}),
    ...(switch2Enhanced
      ? { switch2Enhanced: { available: true, ...(enhancements.length ? { enhancements } : {}) } }
      : {}),
    ...(playModes && playModes.length ? { playModes } : {}),
    ...(features.length ? { features } : {}),
    ...("nintendoGameKeyCard" in p
      ? { gameKeyCard: confirmed(bool(p["nintendoGameKeyCard"])) }
      : {}),
    ...("nintendoPhysicalNeedsDownload" in p
      ? { physicalRequiresDownload: confirmed(bool(p["nintendoPhysicalNeedsDownload"])) }
      : {}),
    ...("nintendoOnlineRequired" in p
      ? { switchOnline: { requiredForOnlinePlay: confirmed(bool(p["nintendoOnlineRequired"])) } }
      : {}),
  };

  const hasAnyData =
    detail.switch2Only ||
    detail.switch2Enhanced ||
    detail.playModes ||
    detail.features?.length ||
    detail.gameKeyCard ||
    detail.physicalRequiresDownload ||
    detail.switchOnline;
  return hasAnyData ? detail : undefined;
}

function buildPerformance(
  p: Record<string, unknown>,
  platform: PlatformId,
  _locale: "ar" | "en",
): PerformanceProfile[] | undefined {
  const records = getDevicePerformanceList(p);
  if (!records.length) return undefined;

  return records.map((record) => {
    const status =
      record.verificationStatus === "technical_analysis"
        ? "measured"
        : record.verificationStatus === "unverified"
          ? "unconfirmed"
          : "confirmed";
    const source = record.sourceName || record.sourceUrl || "Game performance record";
    const fact = <T>(value: T): Fact<T> => ({
      value,
      status,
      source,
      ...(record.verifiedAt ? { capturedAt: record.verifiedAt } : {}),
    });
    const mapMode = (
      mode: "handheld" | "tv",
      values: typeof record.handheld,
    ): NonNullable<PerformanceProfile["modes"]>[number] | undefined => {
      if (!values) return undefined;
      const resolution = values.outputResolution || values.resolution || values.resolutionDynamic;
      return {
        mode,
        ...(values.supported !== undefined ? { supported: values.supported } : {}),
        ...(resolution ? { resolution: fact(resolution) } : {}),
        ...(values.renderingResolution
          ? { renderingResolution: fact(values.renderingResolution) }
          : {}),
        ...(values.outputResolution ? { outputResolution: fact(values.outputResolution) } : {}),
        ...(values.fps ? { frameRate: fact(values.fps) } : {}),
        ...(values.fpsMin ? { frameRateMin: fact(values.fpsMin) } : {}),
        ...(values.fpsMax ? { frameRateMax: fact(values.fpsMax) } : {}),
        ...(values.refreshRate ? { refreshRate: fact(values.refreshRate) } : {}),
        ...(values.hdr !== undefined ? { hdr: fact(values.hdr) } : {}),
        ...(values.vrr !== undefined ? { vrr: fact(values.vrr) } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      };
    };
    const modes = [mapMode("handheld", record.handheld), mapMode("tv", record.tv)].filter(
      Boolean,
    ) as NonNullable<PerformanceProfile["modes"]>;
    const mappedPlatform: PlatformId =
      record.deviceSlug === "nintendo-switch-2"
        ? "switch2"
        : record.deviceSlug === "nintendo-switch"
          ? "switch"
          : platform;

    return {
      platform: mappedPlatform,
      deviceName: record.device,
      deviceSlug: record.deviceSlug,
      ...(record.deviceModel ? { deviceModel: record.deviceModel } : {}),
      ...(record.hardwareId ? { hardwareId: record.hardwareId } : {}),
      ...(record.informationStatus ? { informationStatus: record.informationStatus } : {}),
      ...(record.unavailableReason ? { unavailableReason: record.unavailableReason } : {}),
      ...(modes.length ? { modes } : {}),
      ...(record.modes?.length ? { performanceModes: record.modes } : {}),
      ...(record.loadingTime ? { loadingTime: fact(record.loadingTime) } : {}),
      ...(record.handheld?.hdr !== undefined || record.tv?.hdr !== undefined
        ? { hdr: fact(record.handheld?.hdr === true || record.tv?.hdr === true) }
        : {}),
      ...(record.upscaling ? { upscaling: record.upscaling } : {}),
      ...(record.rayTracing !== undefined ? { rayTracing: record.rayTracing } : {}),
      ...(record.rayTracingMode ? { rayTracingMode: record.rayTracingMode } : {}),
      ...(record.gameVersion ? { gameVersion: record.gameVersion } : {}),
      ...(record.patchVersion ? { patchVersion: record.patchVersion } : {}),
      ...(record.testedDate ? { testedDate: record.testedDate } : {}),
      ...(record.sourceName ? { sourceName: record.sourceName } : {}),
      ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
      ...(record.verifiedAt ? { verifiedAt: record.verifiedAt } : {}),
      ...(record.verificationStatus ? { verificationStatus: record.verificationStatus } : {}),
      ...(record.performanceNotes ? { notes: record.performanceNotes } : {}),
    };
  });
}

function buildStorage(p: Record<string, unknown>): StorageInfo | undefined {
  const downloadGb = num(p["downloadSizeGb"]);
  const requiredGb = num(p["requiredSpaceGb"]);
  const microSdRecommended = bool(p["microSdRecommended"]);
  if (!downloadGb && !requiredGb && !("microSdRecommended" in p)) return undefined;
  return {
    ...(downloadGb ? { downloadSizeBytes: confirmed(gb(downloadGb)) } : {}),
    ...(requiredGb ? { requiredSpaceBytes: confirmed(gb(requiredGb)) } : {}),
    ...("microSdRecommended" in p ? { microSdRecommended } : {}),
  };
}

function buildLanguages(p: Record<string, unknown>): LanguageSupport[] | undefined {
  const audioNames = lines(p["languagesAudio"]).flatMap((l) =>
    l
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const textNames = lines(p["languagesText"]).flatMap((l) =>
    l
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!audioNames.length && !textNames.length) return undefined;

  const byName = new Map<string, LanguageSupport>();
  const upsert = (name: string, channel: LanguageSupport["channels"][number]) => {
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (!existing.channels.includes(channel)) existing.channels.push(channel);
    } else {
      byName.set(key, { code: slugify(name).slice(0, 8), name, channels: [channel] });
    }
  };
  audioNames.forEach((n) => upsert(n, "audio"));
  textNames.forEach((n) => upsert(n, "subtitles"));
  return Array.from(byName.values());
}

function parseRange(text: string): { min: number; max: number } | undefined {
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(text);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const single = /(\d+)/.exec(text);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  return undefined;
}

function buildMultiplayer(p: Record<string, unknown>): MultiplayerInfo | undefined {
  const localPlayers = parseRange(str(p["mpLocalPlayers"]));
  const onlinePlayers = parseRange(str(p["mpOnlinePlayers"]));
  const flagsPresent = ["mpCoop", "mpCompetitive", "mpSplitScreen", "mpLocalWireless"].some(
    (k) => k in p,
  );
  if (!localPlayers && !onlinePlayers && !flagsPresent) return undefined;
  return {
    ...(localPlayers ? { localPlayers } : {}),
    ...(onlinePlayers ? { onlinePlayers, onlineMultiplayer: true } : {}),
    ...("mpCoop" in p ? { coop: bool(p["mpCoop"]) } : {}),
    ...("mpCompetitive" in p ? { competitive: bool(p["mpCompetitive"]) } : {}),
    ...("mpSplitScreen" in p ? { splitScreen: bool(p["mpSplitScreen"]) } : {}),
    ...("mpLocalWireless" in p ? { localWireless: bool(p["mpLocalWireless"]) } : {}),
  };
}

const money = (amount: number): Money => ({ amount, currency: "IQD" });

function buildEditions(p: Record<string, unknown>, locale: "ar" | "en"): GameEdition[] | undefined {
  const rawList =
    rows(p["editions"]).length > 0
      ? rows(p["editions"])
      : rows(p["types"]).length > 0
        ? rows(p["types"])
        : rows(p["variants"]);
  if (!rawList.length) return undefined;
  return rawList.map((row, i) => {
    const rawContents = rows(row["contents"]);
    const desc = localizedValue(row, "description", "descriptionEn", locale);
    const contentsList =
      rawContents.length > 0
        ? rawContents.map((item, j) => ({
            id: `content-${i}-${j}`,
            label: localizedValue(item, "label", "labelEn", locale) || str(item),
            included: true,
          }))
        : desc
          ? [{ id: `content-${i}-0`, label: desc, included: true }]
          : [];

    const name =
      localizedValue(row, "name", "nameEn", locale) ||
      (locale === "en" ? `Edition ${i + 1}` : `نسخة ${i + 1}`);

    return {
      id: str(row["id"]) || `edition-${i}`,
      name,
      tier: "standard" as const,
      contents: contentsList,
      ...(hasNum(row["price"]) ? { msrp: money(num(row["price"])) } : {}),
      ...(str(row["coverUrl"] || row["image"])
        ? { coverUrl: str(row["coverUrl"] || row["image"]) }
        : {}),
    };
  });
}

const PILLAR_MATCHERS: Array<{ id: GameplayPillarId; re: RegExp }> = [
  { id: "combat", re: /قتال|combat|battle/i },
  { id: "exploration", re: /استكشاف|explor/i },
  { id: "story", re: /قصة|story|narrative/i },
  { id: "world", re: /عالم|world/i },
  { id: "weapons", re: /سلاح|weapon/i },
  { id: "abilities", re: /قدرات|ability|abilities|skill/i },
  { id: "enemies", re: /أعداء|enemy|enemies/i },
  { id: "bosses", re: /زعيم|boss/i },
  { id: "customization", re: /تخصيص|custom/i },
  { id: "multiplayer", re: /جماعي|multiplayer/i },
  { id: "coop", re: /تعاون|co-?op/i },
  { id: "crafting", re: /صناعة|craft/i },
  { id: "progression", re: /تقدم|progress|level/i },
];

function buildGameplayPillars(
  p: Record<string, unknown>,
  locale: "ar" | "en",
): GameplayPillar[] | undefined {
  const list = rows(p["gameplayPillars"]);
  if (!list.length) return undefined;
  return list.map((row, i) => {
    const title =
      localizedValue(row, "title", "titleEn", locale) ||
      (locale === "en" ? `Pillar ${i + 1}` : `ركيزة ${i + 1}`);
    const match = PILLAR_MATCHERS.find((m) => m.re.test(title));
    return {
      id: match?.id ?? "exploration",
      title,
      description: localizedValue(row, "description", "descriptionEn", locale),
    };
  });
}

function buildStory(p: Record<string, unknown>, locale: "ar" | "en"): StorySection[] | undefined {
  const worldSummary = localizedValue(p, "worldSummary", "worldSummaryEn", locale);
  const chapters = rows(p["storyChapters"]);
  const sections: StorySection[] = [
    ...(worldSummary
      ? [
          {
            id: "world-summary",
            title: locale === "en" ? "Game World" : "عالم اللعبة",
            body: worldSummary,
          },
        ]
      : []),
    ...chapters.map((row, i) => ({
      id: `story-${i}`,
      title:
        localizedValue(row, "title", "titleEn", locale) ||
        (locale === "en" ? `Chapter ${i + 1}` : `فصل ${i + 1}`),
      body: localizedValue(row, "body", "bodyEn", locale),
      ...(str(row["imageUrl"]) ? { imageId: str(row["imageUrl"]) } : {}),
    })),
  ];
  return sections.length ? sections : undefined;
}

function buildDlc(p: Record<string, unknown>, locale: "ar" | "en"): Dlc[] | undefined {
  const list = rows(p["dlc"] || p["dlcs"]);
  if (!list.length) return undefined;
  const filtered = list
    .filter((row) => {
      const name =
        localizedValue(row, "name", "nameEn", locale) ||
        localizedValue(row, "title", "titleEn", locale);
      return Boolean(name && name.trim());
    })
    .map((row, i) => {
      const name =
        localizedValue(row, "name", "nameEn", locale) ||
        localizedValue(row, "title", "titleEn", locale) ||
        (locale === "en" ? `DLC ${i + 1}` : `إضافة ${i + 1}`);
      const cover = str(row["coverUrl"] || row["image"] || row["cartridgeImage"]);
      const desc = localizedValue(row, "description", "descriptionEn", locale);
      return {
        id: str(row["id"]) || `dlc-${i}`,
        name,
        ...(cover ? { coverUrl: cover } : {}),
        ...(desc ? { description: desc } : {}),
      };
    });
  return filtered.length ? filtered : undefined;
}

function buildGuides(p: Record<string, unknown>, locale: "ar" | "en"): Guide[] | undefined {
  const list = rows(p["guides"]);
  if (!list.length) return undefined;
  return list.map((row, i) => ({
    slug: slugify(str(row["title"]) || `guide-${i}`),
    title:
      localizedValue(row, "title", "titleEn", locale) ||
      (locale === "en" ? `Guide ${i + 1}` : `دليل ${i + 1}`),
    category: "tips" as const,
    summary: localizedValue(row, "summary", "summaryEn", locale),
    ...(str(row["url"]) ? { sections: [{ body: str(row["url"]) }] } : {}),
  }));
}

function buildCompletion(p: Record<string, unknown>): CompletionInfo | undefined {
  const main = num(p["completionMain"]);
  const extras = num(p["completionExtras"]);
  const all = num(p["completionAll"]);
  if (!main && !extras && !all) return undefined;
  return {
    ...(main ? { mainStoryHours: { min: main, max: main } } : {}),
    ...(extras ? { mainPlusExtrasHours: { min: extras, max: extras } } : {}),
    ...(all ? { hundredPercentHours: { min: all, max: all } } : {}),
  };
}

function buildFaq(p: Record<string, unknown>, locale: "ar" | "en"): FaqItem[] | undefined {
  const list = rows(p["faq"]);
  if (!list.length) return undefined;
  return list.map((row, i) => ({
    id: `faq-${i}`,
    question: localizedValue(row, "q", "qEn", locale),
    answer: localizedValue(row, "a", "aEn", locale),
  }));
}

function buildTimeline(
  p: Record<string, unknown>,
  locale: "ar" | "en",
): TimelineEvent[] | undefined {
  const list = rows(p["timeline"]);
  if (!list.length) return undefined;
  return list.map((row, i) => ({
    id: `timeline-${i}`,
    date: str(row["date"]),
    kind: "update" as const,
    title: localizedValue(row, "title", "titleEn", locale),
    ...(str(row["body"]) ? { detail: localizedValue(row, "body", "bodyEn", locale) } : {}),
  }));
}

function buildPatchNotes(p: Record<string, unknown>, locale: "ar" | "en"): PatchNote[] | undefined {
  const list = rows(p["patchNotes"]);
  if (!list.length) return undefined;
  return list.map((row) => ({
    version: str(row["version"]),
    date: str(row["date"]),
    ...(str(row["body"])
      ? { added: locale === "en" && row["bodyEn"] ? lines(row["bodyEn"]) : lines(row["body"]) }
      : {}),
  }));
}

function buildSoundtrack(p: Record<string, unknown>, locale: "ar" | "en"): Soundtrack | undefined {
  const list = rows(p["soundtrack"]);
  if (!list.length) return undefined;
  return {
    links: list.map((row) => ({
      label: localizedValue(row, "title", "titleEn", locale),
      url: str(row["url"]),
    })),
  };
}

function buildSeries(p: Record<string, unknown>, locale: "ar" | "en"): GameSeries | undefined {
  const name = localizedValue(p, "seriesName", "seriesNameEn", locale);
  const entries = rows(p["seriesEntries"]);
  if (!name && !entries.length) return undefined;
  const mappedEntries = entries
    .map((row) => {
      const v =
        locale === "en" && row["valueEn"]
          ? row["valueEn"]
          : row["value"] !== undefined
            ? row["value"]
            : row["title"] || row["name"] || row;
      const title = getTextValue(
        typeof v === "object" && v !== null && "value" in v ? (v as any).value : v,
      );
      if (!title) return null;
      return { slug: slugify(title), title };
    })
    .filter((e): e is { slug: string; title: string } => Boolean(e));
  if (!mappedEntries.length && !name) return undefined;
  return {
    id: slugify(name || "series"),
    name: name || (locale === "en" ? "Series" : "السلسلة"),
    entries: mappedEntries,
  };
}

function buildVerdict(p: Record<string, unknown>, locale: "ar" | "en"): EditorVerdict | undefined {
  const score = num(p["verdictScore"]);
  const summary = localizedValue(p, "verdictSummary", "verdictSummaryEn", locale);
  const pros = rows(p["verdictPros"])
    .map((r) => {
      const v =
        locale === "en" && r["valueEn"] ? r["valueEn"] : r["value"] !== undefined ? r["value"] : r;
      return getTextValue(
        typeof v === "object" && v !== null && "value" in v ? (v as any).value : v,
      );
    })
    .filter(Boolean);
  const cons = rows(p["verdictCons"])
    .map((r) => {
      const v =
        locale === "en" && r["valueEn"] ? r["valueEn"] : r["value"] !== undefined ? r["value"] : r;
      return getTextValue(
        typeof v === "object" && v !== null && "value" in v ? (v as any).value : v,
      );
    })
    .filter(Boolean);
  if (!score && !summary && !pros.length && !cons.length) return undefined;
  return {
    overall: score || 0,
    scores: {},
    ...(summary ? { summary } : {}),
    buyIf: pros,
    skipIf: cons,
  };
}

function buildCatalogOptions(p: Record<string, unknown>, locale: "ar" | "en") {
  const rawOptions = rows(p["options"]);
  if (rawOptions.length) {
    const list = rawOptions
      .map((opt, i) => {
        const name = getTextValue(
          locale === "en" && opt["nameEn"]
            ? opt["nameEn"]
            : (opt["name"] ?? opt["title"] ?? opt["value"] ?? opt),
        );
        if (!name) return null;
        return {
          id: str(opt["id"]) || `opt-${i}`,
          name,
          price: num(opt["price"]) || undefined,
          cost: num(opt["cost"]) || undefined,
          description: localizedValue(opt, "description", "descriptionEn", locale) || undefined,
          available: opt["available"] !== false && opt["active"] !== false,
        };
      })
      .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt && opt.available !== false));
    if (list.length) return list;
  }

  const hubOffers = readOffers(p);
  if (hubOffers.length) {
    const OFFER_NAMES_AR: Record<string, string> = {
      account: "حساب أوفلاين",
      accountOnline: "حساب أونلاين",
      lend: "إقراض كارتلج",
      disc: "قرص",
    };
    const OFFER_NAMES_EN: Record<string, string> = {
      account: "Offline Account",
      accountOnline: "Online Account",
      lend: "Cartridge Lend",
      disc: "Disc",
    };
    const OFFER_NAMES = locale === "en" ? OFFER_NAMES_EN : OFFER_NAMES_AR;
    const list = hubOffers
      .filter((o) => o.available)
      .map((offer) => ({
        id: offer.kind,
        name: OFFER_NAMES[offer.kind] ?? offer.kind,
        price: offer.price,
        description: offer.note || undefined,
        available: true,
      }));
    if (list.length) return list;
  }

  return undefined;
}

function buildCatalogTypes(p: Record<string, unknown>, locale: "ar" | "en") {
  const rawTypes = rows(p["types"]);
  if (!rawTypes.length) return undefined;
  const list = rawTypes
    .map((t, i) => {
      const name = getTextValue(
        locale === "en" && t["nameEn"] ? t["nameEn"] : (t["name"] ?? t["title"] ?? t["value"] ?? t),
      );
      if (!name) return null;
      return {
        id: str(t["id"]) || `type-${i}`,
        name,
        optionId: str(t["optionId"]) || undefined,
        price: num(t["price"]) || undefined,
        cost: num(t["cost"]) || undefined,
        stock: num(t["stock"]) || undefined,
        description: localizedValue(t, "description", "descriptionEn", locale) || undefined,
      };
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  return list.length ? list : undefined;
}

function buildOffers(
  p: Record<string, unknown>,
  platform: PlatformId,
  locale: "ar" | "en",
): StoreOffer[] | undefined {
  const hubOffers = readOffers(p);
  if (!hubOffers.length) return undefined;
  const now = new Date().toISOString();
  const formatByKind = {
    account: "digital-account",
    accountOnline: "digital-account",
    lend: "physical",
    disc: "physical",
  } as const;
  const REGIONS = ["US", "JP", "EU", "UK", "HK", "AU", "CA", "BR", "SA", "AE"] as const;
  const named = str(p["accountRegion"]).toUpperCase();
  const accountRegion = (REGIONS as readonly string[]).includes(named)
    ? (named as (typeof REGIONS)[number])
    : "JP";
  return hubOffers.map((offer, i) => ({
    id: `${offer.kind}-${i}`,
    storeId: "banam",
    storeName: locale === "en" ? "Bananto" : "بنانتو",
    firstParty: true,
    official: true,
    region:
      offer.kind === "account" || offer.kind === "accountOnline" ? accountRegion : ("SA" as const),
    format: formatByKind[offer.kind],
    platform,
    price: money(offer.price),
    availability: offer.available
      ? "in-stock"
      : offer.kind === "lend" && offer.preorder
        ? "preorder"
        : "out-of-stock",
    updatedAt: now,
    ...(offer.note ? { notes: offer.note } : {}), // Might need localization on offer.note later
  }));
}

export function gameFromProduct(
  product: Record<string, unknown>,
  locale: "ar" | "en" = "ar",
): Game {
  const p = product;
  const id = String(p["id"] ?? "");
  const platform: PlatformId = str(p["platform"]) === "switch2" ? "switch2" : "switch";
  const platforms: PlatformId[] = bool(p["switch2Enhanced"]) ? ["switch", "switch2"] : [platform];

  const core = buildCore(p, locale);
  const media = buildMedia(p, locale);

  const developerName =
    localizedValue(p, "developer", "developerEn", locale) ||
    localizedValue(p, "studioName", "studioNameEn", locale);
  const publisherName = localizedValue(p, "publisher", "publisherEn", locale);

  const metacritic = num(p["metacriticRating"]);
  const opencritic = num(p["opencriticRating"]);
  const userScore = num(p["userScore"]);

  const dataSourceRows = rows(p["dataSources"] || p["sources"]);

  const opt = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
    value === undefined ? {} : ({ [key]: value } as Partial<Record<K, V>>);

  const ageRating = buildAgeRating(p);
  const releaseDate = str(p["releaseDate"]) || undefined;
  const dataSources = dataSourceRows.length
    ? dataSourceRows
        .map((row) => {
          const label = getTextValue(
            locale === "en" && row["nameEn"]
              ? row["nameEn"]
              : row["name"] || row["source"] || row["label"] || row["title"] || row,
          );
          const url = str(row["url"] || row["link"] || row["sourceUrl"]);
          if (!label && !url) return null;
          return {
            label: label || url,
            ...opt("url", url || undefined),
          };
        })
        .filter((d): d is { label: string; url?: string } => Boolean(d))
    : undefined;

  const game: Game = {
    id,
    slug: id,
    title: core.title,
    platforms,
    ...opt("description", core.description),
    ...opt("tagline", core.tagline),
    ...opt("caseSleeve", media.caseSleeve),
    ...opt(
      "nintendoGameCode",
      str(p["nintendoGameCode"]) || str(p["gameCode"]) || str(p["game_code"]) || undefined,
    ),
    ...opt("coverUrl", media.coverUrl),
    ...opt("coverTextureUrl", media.coverTextureUrl),
    ...opt("coverTrim", media.coverTrim),
    ...opt("keyArtUrl", media.keyArtUrl),
    ...opt("images", media.images),
    ...opt("videos", media.videos),
    ...opt("genres", buildGenres(p)),
    ...(developerName ? { developer: { id: slugify(developerName), name: developerName } } : {}),
    ...(publisherName ? { publisher: { id: slugify(publisherName), name: publisherName } } : {}),
    ...opt("releaseDate", releaseDate),
    ...opt("ageRating", ageRating),
    ...(metacritic || opencritic
      ? {
          criticScore: {
            ...(metacritic ? { metacritic } : {}),
            ...(opencritic ? { opencritic } : {}),
          },
        }
      : {}),
    ...opt("userScore", userScore || undefined),
    ...opt("audienceTags", buildFitFor(p, locale)),
    ...opt("nintendo", buildNintendo(p, locale)),
    ...opt("performance", buildPerformance(p, platform, locale)),
    ...opt("storage", buildStorage(p)),
    ...opt("languages", buildLanguages(p)),
    ...opt("multiplayer", buildMultiplayer(p)),
    ...opt("editions", buildEditions(p, locale)),
    ...opt("offers", buildOffers(p, platform, locale)),
    ...opt("features", buildFeatures(p, locale)),
    ...opt("story", buildStory(p, locale)),
    ...opt("gameplayPillars", buildGameplayPillars(p, locale)),
    ...opt("dlc", buildDlc(p, locale)),
    ...opt("guides", buildGuides(p, locale)),
    ...opt("completion", buildCompletion(p)),
    ...opt("faq", buildFaq(p, locale)),
    ...opt("timeline", buildTimeline(p, locale)),
    ...opt("patchNotes", buildPatchNotes(p, locale)),
    ...opt("soundtrack", buildSoundtrack(p, locale)),
    ...opt("series", buildSeries(p, locale)),
    ...opt("verdict", buildVerdict(p, locale)),
    ...opt("dataSources", dataSources),
    gameIsOffline: bool(p["gameIsOffline"]),
    gameIsOnline: bool(p["gameIsOnline"]),
    gameLanguageLocked: bool(p["gameLanguageLocked"]),
    ...opt("options", buildCatalogOptions(p, locale)),
    ...opt("types", buildCatalogTypes(p, locale)),
    rawProduct: p,
  };

  return game;
}
