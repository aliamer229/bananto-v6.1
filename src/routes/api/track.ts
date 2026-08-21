import { createFileRoute } from "@tanstack/react-router";

import { incrementSiteCounters } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const throttle = await consumeRateLimit(request, "analytics-track", 120, 24 * 60 * 60);
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
          const { type } = await body<{ type?: "visit" | "view" }>(request);
          if (type !== "visit" && type !== "view") {
            return json({ error: "invalid_event" }, { status: 400 });
          }
          const totals = await incrementSiteCounters({
            visits: type === "visit" ? 1 : 0,
            views: type === "view" ? 1 : 0,
          });
          return json(totals);
        }),
    },
  },
});
