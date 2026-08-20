import { createFileRoute } from "@tanstack/react-router";
import {
  createBananCode,
  d1All,
  d1Ready,
} from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/admin/banana")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body<any>(request);

          if (data.action === "create_code") {
            const value = Number(data.value);
            if (!value || value <= 0) {
              return json({ error: "Invalid value" }, { status: 400 });
            }
            const code = await createBananCode(value);
            return json({ success: true, code });
          }

          if (data.action === "list_codes") {
            if (await d1Ready()) {
              const codes = await d1All(`SELECT * FROM banan_codes ORDER BY created_at DESC LIMIT 100`);
              return json({ codes });
            }
            return json({ codes: [] });
          }

          return json({ error: "Invalid action" }, { status: 400 });
        }),
    },
  },
});
