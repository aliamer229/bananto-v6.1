import { createFileRoute } from "@tanstack/react-router";
import { readLimitedBody } from "@/lib/security.server";

interface NewsItemData {
  title: string;
  title_ar: string;
  link: string;
  pubDate: string;
  img: string;
  timestamp: number;
}

// In-memory cache for news items and translations
let cachedNews: NewsItemData[] = [];
let lastFetchedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Keyed by headline text, so an isolate that stays warm across many feed
// refreshes would otherwise grow without bound. Oldest entries are evicted
// first (Map preserves insertion order).
const TRANSLATION_CACHE_LIMIT = 500;
const translationCache = new Map<string, string>();

function rememberTranslation(text: string, translated: string) {
  if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
    const oldest = translationCache.keys().next();
    if (!oldest.done) translationCache.delete(oldest.value);
  }
  translationCache.set(text, translated);
}

async function translateToArabic(text: string): Promise<string> {
  if (!text) return "";
  if (translationCache.has(text)) {
    return translationCache.get(text)!;
  }
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) throw new Error(`Translation status ${res.status}`);
    const data = await res.json();
    if (data && data[0]) {
      const translated = data[0]
        .map((chunk: any) => (chunk && chunk[0]) || "")
        .join("")
        .trim();
      if (translated) {
        rememberTranslation(text, translated);
        return translated;
      }
    }
  } catch (e) {
    // Fall back to original title if translation fails
  }
  return text;
}

const FALLBACK_NEWS: NewsItemData[] = [
  {
    title: "Nintendo Announces New Switch Updates and Upcoming Titles for 2026",
    title_ar: "نينتندو تعلن عن تحديثات جديدة لجهاز سويتش والعناوين القادمة لعام 2026",
    link: "https://www.nintendo.com",
    pubDate: new Date().toUTCString(),
    img:
      "/api/public/news-image?u=" +
      encodeURIComponent("https://images.nintendolife.com/912f814317bbc/large.jpg"),
    timestamp: Date.now(),
  },
  {
    title: "Top New Nintendo Switch Games and Discounts Available This Month",
    title_ar: "أفضل ألعاب نينتندو سويتش الجديدة والتخفيضات المتاحة هذا الشهر",
    link: "https://www.nintendo.com",
    pubDate: new Date(Date.now() - 3600000).toUTCString(),
    img:
      "/api/public/news-image?u=" +
      encodeURIComponent("https://images.nintendolife.com/749a81fc4400d/large.jpg"),
    timestamp: Date.now() - 3600000,
  },
  {
    title: "Zelda and Mario Series Receive Exclusive Anniversary Events and Content",
    title_ar: "سلسلة زيلدا وماريو تحصل على فعاليات ومحتويات حصرية بمناسبة الذكرى السنوية",
    link: "https://www.nintendo.com",
    pubDate: new Date(Date.now() - 7200000).toUTCString(),
    img:
      "/api/public/news-image?u=" +
      encodeURIComponent("https://images.nintendolife.com/1474c20d4e346/large.jpg"),
    timestamp: Date.now() - 7200000,
  },
];

/** Feeds are tried in order and their results merged, so one blocked source
 * can never reduce the app to a single headline. */
const RSS_SOURCES = [
  "https://www.nintendolife.com/feeds/latest",
  "https://nintendoeverything.com/feed",
  "https://gonintendo.com/feed",
];

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Rewrite remote thumbnails through our proxy: several news CDNs block
 * hotlinking, which is why the pictures stayed blank in the app. */
function proxyImage(url: string) {
  if (!url) return "";
  if (!/^https:\/\//i.test(url)) return "";
  return `/api/public/news-image?u=${encodeURIComponent(url)}`;
}

function parseFeed(xmlText: string): NewsItemData[] {
  const items: NewsItemData[] = [];
  // Support both RSS <item> and Atom <entry> documents.
  const blockRegex = /<(item|entry)[\s>][\s\S]*?<\/\1>|<(item|entry)>[\s\S]*?<\/\2>/gi;
  const blocks = xmlText.match(blockRegex) ?? [];

  for (const content of blocks) {
    const titleMatch = content.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = decodeEntities((titleMatch?.[1] ?? "").trim());

    let link = "";
    const linkMatch = content.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    if (linkMatch?.[1]?.trim()) link = linkMatch[1].trim();
    if (!link) {
      const atomLink = content.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (atomLink?.[1]) link = atomLink[1];
    }
    link = decodeEntities(link);

    const pubDateMatch = content.match(
      /<(?:pubDate|updated|published)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|updated|published)>/i,
    );
    const pubDate = (pubDateMatch?.[1] ?? "").trim();

    let img = "";
    const mediaContentMatch = content.match(/<media:content[^>]*url=["']([^"']+)["']/i);
    const mediaThumbMatch = content.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const enclosureMatch = content.match(
      /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i,
    );
    if (mediaContentMatch?.[1]) img = mediaContentMatch[1];
    else if (mediaThumbMatch?.[1]) img = mediaThumbMatch[1];
    else if (enclosureMatch?.[1]) img = enclosureMatch[1];
    else {
      const descImgMatch = content.match(/<img[^>]*src=["']([^"']+)["']/i);
      if (descImgMatch?.[1]) img = descImgMatch[1];
    }
    img = decodeEntities(img);
    if (img.includes("/small.")) img = img.replace("/small.", "/large.");
    if (img.includes("/small/")) img = img.replace("/small/", "/large/");

    if (!title || !link) continue;

    items.push({
      title,
      title_ar: "",
      link,
      pubDate,
      img: proxyImage(img),
      timestamp: new Date(pubDate).getTime() || Date.now(),
    });
  }

  return items;
}

async function fetchFromRss(): Promise<NewsItemData[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async (rssUrl) => {
      const response = await fetch(rssUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Failed to fetch RSS: ${response.status}`);
      const xmlBytes = await readLimitedBody(response, 2 * 1024 * 1024);
      if (!xmlBytes) throw new Error("RSS payload too large");
      return parseFeed(new TextDecoder().decode(xmlBytes));
    }),
  );

  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: NewsItemData[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      if (seenLinks.has(item.link) || seenTitles.has(item.title)) continue;
      seenLinks.add(item.link);
      seenTitles.add(item.title);
      merged.push(item);
    }
  }

  if (!merged.length) throw new Error("No news items parsed from any source");

  const topItems = merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);

  // Translation is best-effort: it must never delete or block the feed. Only a
  // first page worth of titles is translated to stay inside worker limits.
  await Promise.allSettled(
    topItems.slice(0, 15).map(async (item) => {
      item.title_ar = await translateToArabic(item.title);
    }),
  );

  return topItems;
}

export const Route = createFileRoute("/api/public/latest-news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const limit = Math.max(
            1,
            Math.min(50, parseInt(url.searchParams.get("limit") || "15", 10) || 15),
          );
          const offset = Math.max(
            0,
            Math.min(1000, parseInt(url.searchParams.get("offset") || "0", 10) || 0),
          );

          const now = Date.now();
          if (!cachedNews.length || now - lastFetchedAt > CACHE_TTL_MS) {
            try {
              const freshItems = await fetchFromRss();
              if (freshItems.length > 0) {
                cachedNews = freshItems;
                lastFetchedAt = now;
              }
            } catch (fetchErr) {
              console.warn("Could not refresh news RSS upstream:", fetchErr);
              if (!cachedNews.length) {
                cachedNews = FALLBACK_NEWS;
              }
            }
          }

          const sortedItems = cachedNews
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(offset, offset + limit);

          // Translate lazily for pages beyond the pre-translated first batch.
          await Promise.allSettled(
            sortedItems
              .filter((item) => !item.title_ar)
              .map(async (item) => {
                item.title_ar = await translateToArabic(item.title);
              }),
          );

          return new Response(JSON.stringify(sortedItems), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=600",
            },
          });
        } catch (error: any) {
          console.error("News endpoint error:", error);
          return new Response(JSON.stringify(FALLBACK_NEWS), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
