import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreOffer } from "@/hub/types";
import {
  PRICE_REFRESH_INTERVAL_MS,
  fetchOffers,
  isLivePricingConfigured,
} from "@/hub/services/priceService";
import { latestUpdatedAt } from "@/hub/utils/priceIntelligence";

interface LivePricesState {
  offers: StoreOffer[];
  /** Real timestamp of the newest offer in the set — never synthesised. */
  updatedAt: string | null;
  isRefreshing: boolean;
  /** True while a live endpoint is configured and reachable. */
  live: boolean;
  refresh: () => void;
}

/**
 * Keeps the offer table current without the user reloading (requirement:
 * automatic price updates). Polls on an interval, and again when the tab
 * regains focus so a backgrounded page catches up immediately.
 */
export function useLivePrices(slug: string, seed: StoreOffer[]): LivePricesState {
  const [offers, setOffers] = useState<StoreOffer[]>(seed);
  const [isRefreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const seedRef = useRef(seed);

  useEffect(() => {
    seedRef.current = seed;
    setOffers(seed);
  }, [seed]);

  const refresh = useCallback(async () => {
    if (!isLivePricingConfigured()) return;
    setRefreshing(true);
    try {
      const result = await fetchOffers(slug, seedRef.current);
      setOffers(result.offers);
      setLive(result.live);
    } finally {
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!isLivePricingConfigured()) return;

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, PRICE_REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return {
    offers,
    updatedAt: latestUpdatedAt(offers),
    isRefreshing,
    live,
    refresh: () => void refresh(),
  };
}
