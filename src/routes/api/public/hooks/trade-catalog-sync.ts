import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/lib/env.server";
import { constantTimeEqual } from "@/lib/security.server";

/**
 * Machine-triggered sync of the official Nintendo Iraq trade pricing sheet into
 * `game_catalog`. Idempotent: matches on canonical game_id, never touches games
 * whose price was locked by an admin. Guarded by a bearer secret.
 */

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorized(request: Request): boolean {
  const expected = env("TRADE_SYNC_SECRET") ?? env("CRON_SECRET") ?? "";
  const header = request.headers.get("Authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return expected.length >= 16 && Boolean(bearer) && constantTimeEqual(expected, bearer);
}

export const Route = createFileRoute("/api/public/hooks/trade-catalog-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return unauthorized();

        const { importNintendoTradeCatalog } = await import("@/lib/trade-catalog-import.server");
        const url = new URL(request.url);
        const overwriteLocked = url.searchParams.get("overwrite_locked") === "1";

        try {
          const result = await importNintendoTradeCatalog({
            overwriteLocked,
            actor: "cron_trade_sync",
          });
          return Response.json({
            success: result.success,
            total: result.totalProcessed,
            matched: result.matchedExisting,
            created: result.createdNew,
            updated: result.updatedPrices,
            skipped_locked: result.skippedLocked,
            errors: result.errors.slice(0, 20),
          });
        } catch (e) {
          console.error("trade-catalog-sync failed", e);
          return Response.json({ error: "sync_failed" }, { status: 500 });
        }
      },
    },
  },
});
