import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Game, GameImage, GameVideo, PriceHistory, RegionCode, StoreOffer } from "@/hub/types";
import {
  computePriceVerdict,
  computeWindowStats,
  rankOffers,
  type PriceVerdict,
  type RankedOffer,
  type WindowStats,
} from "@/hub/utils/priceIntelligence";
import { useCurrency } from "@/hub/context/CurrencyContext";
import { useLivePrices } from "@/hub/hooks/useLivePrices";
import { useUser } from "@/hub/context/UserContext";

/**
 * Shared hub state.
 *
 * Price ranking, history statistics and the image lookup are computed once here
 * rather than in each section: the hero, the price table, the sticky buy bar
 * and the final CTA all quote the same "best price", and recomputing it per
 * section is both wasteful and a way for them to disagree.
 */

/** Window the headline price verdict is judged against. */
const HEADLINE_WINDOW = "6m" as const;

export interface HubActions {
  openBuy: (editionId?: string) => void;
  openAlert: () => void;
  openVideo: (video: GameVideo) => void;
  openLightbox: (imageId: string) => void;
  openGuide: (slug: string) => void;
  toggleWishlist: () => void;
  setRegion: (region: RegionCode | "ALL") => void;
}

interface HubValue extends HubActions {
  game: Game;
  offers: StoreOffer[];
  offersUpdatedAt: string | null;
  isRefreshingPrices: boolean;
  livePricing: boolean;
  /** Offers ranked in the viewer's display currency. */
  ranked: RankedOffer[];
  bestOffer: RankedOffer | null;
  history: PriceHistory | undefined;
  headlineStats: WindowStats | null;
  priceVerdict: PriceVerdict | null;
  imagesById: Map<string, GameImage>;
  videosById: Map<string, GameVideo>;
  isWishlisted: boolean;
  region: RegionCode | "ALL";
  /** Every region present in the unfiltered offer set. */
  availableRegions: RegionCode[];
  /** Nintendo hardware is the storefront's priority, so this drives ordering. */
  isNintendoTitle: boolean;
  hasSwitch2: boolean;
}

const HubContext = createContext<HubValue | null>(null);

export function HubProvider({
  game,
  actions,
  region,
  children,
}: {
  game: Game;
  actions: HubActions;
  region: RegionCode | "ALL";
  children: ReactNode;
}) {
  const { currency, convert } = useCurrency();
  const { isWishlisted } = useUser();
  const seedOffers = useMemo(() => game.offers ?? [], [game.offers]);
  const { offers, updatedAt, isRefreshing, live } = useLivePrices(game.slug, seedOffers);

  const value = useMemo<HubValue>(() => {
    const visibleOffers = region === "ALL" ? offers : offers.filter((o) => o.region === region);
    const ranked = rankOffers(visibleOffers, currency, convert);
    // Find our own offer first, as it's the authoritative one for this store
    const ourOffer = ranked.find((r) => r.offer.firstParty);
    const bestOffer = ourOffer || ranked.find((r) => r.isBest) || null;

    // Prefer a history series matching the viewer's region; fall back to the
    // first one recorded rather than showing nothing.
    const history =
      game.priceHistory?.find((h) => region !== "ALL" && h.region === region) ??
      game.priceHistory?.[0];

    const headlineStats = computeWindowStats(history, HEADLINE_WINDOW);
    const priceVerdict = headlineStats
      ? computePriceVerdict(headlineStats, history?.allTimeLow)
      : null;

    return {
      ...actions,
      game,
      offers: visibleOffers,
      offersUpdatedAt: updatedAt,
      isRefreshingPrices: isRefreshing,
      livePricing: live,
      ranked,
      bestOffer,
      history,
      headlineStats,
      priceVerdict,
      imagesById: new Map((game.images ?? []).map((image) => [image.id, image])),
      videosById: new Map((game.videos ?? []).map((video) => [video.id, video])),
      isWishlisted: isWishlisted(game.slug),
      region,
      availableRegions: [...new Set(offers.map((o) => o.region))],
      isNintendoTitle: game.platforms.some((p) => p === "switch" || p === "switch2"),
      hasSwitch2: game.platforms.includes("switch2"),
    };
  }, [
    game,
    actions,
    offers,
    updatedAt,
    isRefreshing,
    live,
    currency,
    convert,
    region,
    isWishlisted,
  ]);

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub(): HubValue {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within <HubProvider>");
  return ctx;
}

export { HEADLINE_WINDOW };
