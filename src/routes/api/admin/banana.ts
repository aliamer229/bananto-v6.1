import { createFileRoute } from "@tanstack/react-router";
import {
  adminAdjustUserBanana,
  adminCancelMarketListing,
  adminDeleteBot,
  adminDeleteReward,
  adminSaveBot,
  adminSaveReward,
  adminToggleReward,
  adminUpdateRedemption,
  getAdminBananaData,
  saveMarketConfig,
} from "@/lib/banana.server";

import { updateStore } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/admin/banana")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await getAdminBananaData();
          return json(data);
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body<any>(request);

          switch (data.action) {
            case "save_settings": {
              await updateStore((store) => {
                const currentSettings = store.settings || {};
                return {
                  ...store,
                  settings: {
                    ...currentSettings,
                    bananaPerDinar: data.rewardRatePerIqd ?? currentSettings.bananaPerDinar ?? 6.8,
                    dinarPerBanana: data.dinarPerBanana ?? currentSettings.dinarPerBanana ?? 1000,
                    bananaOpeningPrice:
                      data.openingPrice ?? currentSettings.bananaOpeningPrice ?? 0.24,
                    bananaPromoRate:
                      data.promoRatePerMinute ?? currentSettings.bananaPromoRate ?? 2,
                    bananaSignupGrant: data.signupGrant ?? currentSettings.bananaSignupGrant ?? 500,
                  },
                };
              });
              const updatedData = await getAdminBananaData();
              return json({ success: true, settings: updatedData.settings });
            }

            case "save_market_config": {
              const marketConfig = await saveMarketConfig(data.config ?? {});
              return json({ success: true, marketConfig });
            }

            case "save_bot": {
              const res = await adminSaveBot(data.bot ?? {});
              return json(res);
            }

            case "delete_bot": {
              if (!data.botId) return json({ error: "botId required" }, { status: 400 });
              const res = await adminDeleteBot(data.botId);
              return json(res);
            }

            case "save_reward": {
              const reward = await adminSaveReward(data.reward);
              return json({ success: true, reward });
            }

            case "delete_reward": {
              if (!data.rewardId) return json({ error: "rewardId required" }, { status: 400 });
              const res = await adminDeleteReward(data.rewardId);
              return json(res);
            }

            case "toggle_reward": {
              if (!data.rewardId) return json({ error: "rewardId required" }, { status: 400 });
              const res = await adminToggleReward(data.rewardId, Boolean(data.isActive));
              return json(res);
            }

            case "update_redemption": {
              if (!data.redemptionId)
                return json({ error: "redemptionId required" }, { status: 400 });
              const res = await adminUpdateRedemption(data.redemptionId, {
                status: data.status,
                adminNotes: data.adminNotes,
                deliveryCode: data.deliveryCode,
              });
              return json(res);
            }

            case "cancel_listing": {
              if (!data.listingId) return json({ error: "listingId required" }, { status: 400 });
              const res = await adminCancelMarketListing(data.listingId);
              return json(res);
            }

            case "adjust_balance": {
              if (!data.userId) return json({ error: "userId required" }, { status: 400 });
              const delta = Number(data.amount);
              if (!Number.isFinite(delta))
                return json({ error: "Invalid amount" }, { status: 400 });
              const res = await adminAdjustUserBanana(data.userId, delta, data.reason);
              return json(res);
            }

            default:
              return json({ error: "Unknown action" }, { status: 400 });
          }
        }),
    },
  },
});
