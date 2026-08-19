import { useQuery } from "@tanstack/react-query";

export type StoreData = {
  products?: any[];
  categories?: any[];
  banners?: any[];
  settings?: Record<string, any>;
  [key: string]: any;
};

/**
 * Single cached read of /api/data for every storefront screen.
 *
 * The catalogue is large (hundreds of products with long descriptions), so it
 * is fetched once per minute at most and shared through the React Query cache
 * instead of being re-polled by each page.
 */
export function useStoreData() {
  return useQuery<StoreData>({
    queryKey: ["store"],
    queryFn: async () => {
      const res = await fetch("/api/data?slim=1", { credentials: "include" });
      if (!res.ok) throw new Error("failed_to_load_store");
      return (await res.json()) as StoreData;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
