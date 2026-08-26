import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type StoreData = {
  products?: any[];
  categories?: any[];
  banners?: any[];
  bundles?: any[];
  settings?: Record<string, any>;
  [key: string]: any;
};

const LOCAL_STORAGE_CACHE_KEY = "banan_store_cache_v2";

/** Read synchronous cached snapshot from localStorage for instantaneous first paint */
function getCachedStoreData(): StoreData | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
      return parsed as StoreData;
    }
  } catch {
    // Ignore storage parse issues
  }
  return undefined;
}

/** Save fresh snapshot to localStorage in background */
function saveCachedStoreData(data: StoreData) {
  if (typeof window === "undefined") return;
  try {
    if (data && Array.isArray(data.products) && data.products.length > 0) {
      // Don't store oversized fields in localStorage
      const compact: StoreData = {
        products: data.products,
        categories: Array.isArray(data.categories) ? data.categories : [],
        banners: Array.isArray(data.banners) ? data.banners : [],
        bundles: Array.isArray(data.bundles) ? data.bundles : [],
        settings: data.settings && typeof data.settings === "object" ? data.settings : {},
      };
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(compact));
      console.log(`[HOME_CACHE_SAVED] productsCount=${compact.products?.length ?? 0}`);
    }
  } catch {
    // Ignore quota issues
  }
}

// In-flight fetch deduplicator
let inFlightFetch: Promise<StoreData> | null = null;

async function fetchStoreData(): Promise<StoreData> {
  if (inFlightFetch) return inFlightFetch;

  const fetchPromise = (async () => {
    const startTime = Date.now();
    const reqId = `req_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);

      const res = await fetch("/api/data?slim=1", {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;
      if (elapsed > 2000) {
        console.warn(`[SLOW_REQUEST] /api/data duration=${elapsed}ms reqId=${reqId}`);
      }

      if (!res.ok) {
        throw new Error(`failed_to_load_store_${res.status}`);
      }

      const json = (await res.json()) as StoreData;
      if (json && Array.isArray(json.products) && json.products.length > 0) {
        console.log(`[HOME_REFRESH_SUCCESS] reqId=${reqId} duration=${elapsed}ms count=${json.products.length}`);
        saveCachedStoreData(json);
        return json;
      } else {
        // If the server returned an empty products payload unexpectedly, fallback to cached snapshot
        const cached = getCachedStoreData();
        if (cached && Array.isArray(cached.products) && cached.products.length > 0) {
          console.warn(`[HOME_REFRESH_EMPTY_FALLBACK] Server returned empty payload, retaining local cache.`);
          return cached;
        }
        return json || { products: [], categories: [], banners: [], bundles: [] };
      }
    } catch (err: any) {
      console.warn(`[HOME_REFRESH_FAILED] reqId=${reqId} error=${err?.message}`);
      const cached = getCachedStoreData();
      if (cached && Array.isArray(cached.products) && cached.products.length > 0) {
        console.log("[HOME_CACHE_HIT] Network/DB unavailable, seamlessly serving local cache.");
        return cached;
      }
      throw err;
    }
  })();

  inFlightFetch = fetchPromise;
  fetchPromise.finally(() => {
    inFlightFetch = null;
  });

  return fetchPromise;
}

/**
 * Single cached read of /api/data for every storefront screen.
 * Employs true Stale-While-Revalidate with localStorage persistence:
 * - Immediately mounts with local cached data if available (0ms delay)
 * - Retains previous data across background revalidations (no flash/empty state)
 * - Validates in background with an 8.5s timeout & automatic fallback
 * - Deduplicates concurrent calls
 */
export function useStoreData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only inject local cache after first client render to avoid SSR hydration mismatch
    const cached = getCachedStoreData();
    if (cached && !queryClient.getQueryData(["store"])) {
      queryClient.setQueryData(["store"], cached);
    }
  }, [queryClient]);

  return useQuery<StoreData>({
    queryKey: ["store"],
    queryFn: fetchStoreData,
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount) => {
      // Don't retry more than once on error to prevent infinite spin
      return failureCount < 1;
    },
    retryDelay: 1500,
  });
}

