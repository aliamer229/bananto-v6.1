import { useQuery } from "@tanstack/react-query";

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
        categories: data.categories || [],
        banners: data.banners || [],
        bundles: data.bundles || [],
        settings: data.settings || {},
      };
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(compact));
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
    if (typeof window !== "undefined" && (window as any).__BANAN_DEBUG__) {
      console.log(`[STORE_FETCH_START] reqId=${reqId}`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

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
      saveCachedStoreData(json);
      return json;
    } catch (err: any) {
      const cached = getCachedStoreData();
      if (cached) {
        console.warn("[STORE_FETCH_FALLBACK] Network/DB failed, serving local cache:", err?.message);
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
 * Employs Stale-While-Revalidate with localStorage persistence:
 * - Immediately mounts with local cached data if available (0ms delay)
 * - Validates in background with a 9s timeout & automatic fallback
 * - Deduplicates concurrent calls
 */
export function useStoreData() {
  return useQuery<StoreData>({
    queryKey: ["store"],
    queryFn: fetchStoreData,
    initialData: getCachedStoreData,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry indefinitely
      return failureCount < 2;
    },
    retryDelay: 1500,
  });
}

