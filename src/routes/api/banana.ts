import { createFileRoute } from "@tanstack/react-router";

import {
  BananaError,
  buyListing,
  cancelListing,
  createListing,
  getSnapshot,
  redeemReward,
  updateListing,
} from "@/lib/banana.server";
import { getSessionUser, requireUser } from "@/lib/session.server";
import type { User } from "@/lib/types";
import { body } from "@/lib/http.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

/** A member may trade once name/username/email/birth date/gender are filled in. */
function isProfileComplete(user: User) {
  return Boolean(
    user.name?.trim() &&
    user.username?.trim() &&
    user.email?.trim() &&
    user.birthDate &&
    user.gender &&
    user.gender !== "unspecified",
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/banana")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const range = url.searchParams.get("range") ?? "1D";
        const user = await getSessionUser(request);
        const snapshot = await getSnapshot(user?.id, range);
        return json({ ...snapshot, profileComplete: user ? isProfileComplete(user) : false });
      },

      POST: async ({ request }) => {
        let user;
        try {
          user = await requireUser(request);
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }

        const throttle = await consumeRateLimit(request, "banana-mutation", 30, 60, user.id);
        if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
        const input = await body<Record<string, unknown>>(request);
        const action = String(input["action"] ?? "");
        const range = String(input["range"] ?? "1D");

        try {
          if (action === "create_listing") {
            await createListing(user.id, {
              quantity: Number(input["quantity"]),
              pricePer: Number(input["pricePer"]),
              isPrivate: Boolean(input["isPrivate"]),
              isPromoted: Boolean(input["isPromoted"]),
              promoteMinutes: Number(input["promoteMinutes"] ?? 0),
            });
          } else if (action === "update_listing") {
            await updateListing(user.id, {
              id: String(input["id"] ?? ""),
              quantity: Number(input["quantity"]),
              pricePer: Number(input["pricePer"]),
            });
          } else if (action === "cancel_listing") {
            await cancelListing(user.id, String(input["id"] ?? ""));
          } else if (action === "buy_listing") {
            await buyListing(user.id, String(input["id"] ?? ""));
          } else if (action === "redeem_reward") {
            await redeemReward(user.id, String(input["rewardId"] ?? ""));
          } else {
            return json({ error: "unknown_action" }, 400);
          }
        } catch (error: any) {
          if (error instanceof BananaError) return json({ error: error.message }, 400);
          throw error;
        }

        return json({
          ...(await getSnapshot(user.id, range)),
          profileComplete: isProfileComplete(user),
        });
      },
    },
  },
});
