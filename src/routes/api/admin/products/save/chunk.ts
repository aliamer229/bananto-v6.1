import { createFileRoute } from "@tanstack/react-router";
import { guard, body, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Run } from "@/lib/d1.server";

export const Route = createFileRoute("/api/admin/products/save/chunk")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<{ save_session_id: string; part: string; data: any }>(request);
          
          if (!payload.save_session_id || !payload.part || !payload.data) {
            return json({ error: "Missing required fields" }, { status: 400 });
          }

          const key = `staged_save:${payload.save_session_id}:${payload.part}`;
          
          await d1Run(
            `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            key,
            JSON.stringify(payload.data),
            new Date().toISOString(),
          );

          return json({ success: true, saved_part: payload.part });
        }),
    },
  },
});
