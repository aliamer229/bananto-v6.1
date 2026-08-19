import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { importGameDataToDb } from "@/lib/gameData/mapper";

export const Route = createFileRoute("/api/admin/import-game")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const { data, mode } = await body<{ data: any; mode: "create" | "update" | "replace" }>(
            request,
          );

          if (!data) return json({ error: "الرجاء توفير البيانات." }, { status: 400 });

          try {
            const result = await importGameDataToDb(data, mode || "create");
            return json({ success: true, gameId: result.gameId });
          } catch (error) {
            console.error("[Import API] error:", error);
            return json({ error: "فشل الاستيراد." }, { status: 500 });
          }
        }),
    },
  },
});
