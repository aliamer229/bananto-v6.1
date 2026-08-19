import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Game, GameVideo, RegionCode } from "@/hub/types";
import { HubProvider, type HubActions } from "./hubContext";
import { BuySheet, FollowDialog, PriceAlertDialog, VideoDialog } from "./Dialogs";
import { Lightbox } from "./Lightbox";
import { GuideModal } from "./GuideModal";
import { useI18n } from "@/hub/i18n";
import { useUser } from "@/hub/context/UserContext";
import { useNotifications } from "@/hub/context/NotificationContext";
import { playSound } from "@/hub/utils/audio";

/**
 * Everything a hub surface needs around it: shared state, the dialog set, and
 * the lightbox.
 *
 * The full hub and each of its sub-pages (`/prices`, `/dlc`, `/reviews`, …)
 * mount this, so a "Buy" button behaves identically wherever it appears and the
 * price feed is fetched once per surface rather than once per section.
 */
export function HubShell({
  game,
  onNavigateGuide,
  children,
}: {
  game: Game;
  onNavigateGuide?: ((slug: string) => void) | undefined;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { toggleWishlist, isWishlisted, recordView } = useUser();
  const { addNotification } = useNotifications();

  const [region, setRegion] = useState<RegionCode | "ALL">("ALL");
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyEdition, setBuyEdition] = useState<string | undefined>();
  const [alertOpen, setAlertOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [video, setVideo] = useState<GameVideo | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [guideSlug, setGuideSlug] = useState<string | null>(null);

  useEffect(() => {
    recordView(game.slug);
  }, [game.slug, recordView]);

  const handleWishlist = useCallback(() => {
    const added = toggleWishlist(game.slug);
    playSound(added ? "toggle_on" : "toggle_off");
    if (added) setFollowOpen(true);
    else addNotification({ title: t("wishlist.removed"), type: "info" });
  }, [toggleWishlist, game.slug, addNotification, t]);

  const actions = useMemo<HubActions>(
    () => ({
      openBuy: (editionId) => {
        setBuyEdition(editionId);
        setBuyOpen(true);
      },
      openAlert: () => setAlertOpen(true),
      openVideo: setVideo,
      openLightbox: setLightboxId,
      // Guides read in-page by default. A host that routes imperatively can
      // still take over by passing `onNavigateGuide`.
      openGuide: (slug) => (onNavigateGuide ? onNavigateGuide(slug) : setGuideSlug(slug)),
      toggleWishlist: handleWishlist,
      setRegion,
    }),
    [handleWishlist, onNavigateGuide],
  );

  const activeGuide = guideSlug
    ? (game.guides?.find((guide) => guide.slug === guideSlug) ?? null)
    : null;

  return (
    <HubProvider game={game} actions={actions} region={region}>
      {children}

      <BuySheet open={buyOpen} editionId={buyEdition} onClose={() => setBuyOpen(false)} />
      <PriceAlertDialog open={alertOpen} onClose={() => setAlertOpen(false)} />
      <FollowDialog
        open={followOpen && isWishlisted(game.slug)}
        onClose={() => setFollowOpen(false)}
      />
      <VideoDialog video={video} onClose={() => setVideo(null)} />
      <GuideModal game={game} guide={activeGuide} onClose={() => setGuideSlug(null)} />
      <Lightbox
        images={game.images ?? []}
        startId={lightboxId}
        onClose={() => setLightboxId(null)}
      />
    </HubProvider>
  );
}
