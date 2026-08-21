import { createFileRoute } from "@tanstack/react-router";
import { createBananCodesBatch, listBananCodesWithDetails, deleteBananCode } from "@/lib/db.server";
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
            const count = Number(data.count) || 1;
            if (!value || value <= 0 || !Number.isFinite(value)) {
              return json({ error: "Invalid value" }, { status: 400 });
            }
            const codes = await createBananCodesBatch(value, count);
            return json({ success: true, codes, code: codes[0] });
          }

          if (data.action === "list_codes") {
            const codes = await listBananCodesWithDetails();
            return json({ codes });
          }

          if (data.action === "delete_code") {
            const id = String(data.id ?? "").trim();
            if (!id) {
              return json({ error: "Invalid code ID" }, { status: 400 });
            }
            const success = await deleteBananCode(id);
            return json({ success });
          }

          return json({ error: "Invalid action" }, { status: 400 });
        }),
    },
  },
});
