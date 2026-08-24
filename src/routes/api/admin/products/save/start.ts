import { createFileRoute } from "@tanstack/react-router";
import { guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Run } from "@/lib/d1.server";

export const Route = createFileRoute("/api/admin/products/save/start")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const sessionId = `ssn_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
          
          await d1Run(
            `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            `staged_save:${sessionId}:meta`,
            JSON.stringify({ startedAt: Date.now() }),
            new Date().toISOString(),
          );

          return json({ success: true, save_session_id: sessionId });
        }),
    },
  },
});
