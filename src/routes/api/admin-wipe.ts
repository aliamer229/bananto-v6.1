import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Execute, emptyStore, updateStore } from "@/lib/db.server";

export const Route = createFileRoute("/api/admin-wipe")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const input = await body<{ confirmation?: string }>(request);
          if (input.confirmation !== "WIPE_ALL_CONTENT") {
            return json({ error: "confirmation_required" }, { status: 400 });
          }

          // 1. Wipe Game Catalog
          await d1Execute("DELETE FROM game_catalog");

          // 2. Wipe Products/Banners (Store KV)
          await updateStore(() => emptyStore);

          return json({ success: true, message: "Site content wiped successfully." });
        }),
    },
  },
});
