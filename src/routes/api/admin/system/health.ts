import { createFileRoute } from "@tanstack/react-router";
import { getNotificationConfigStatus } from "@/lib/env.server";
import { getSessionUser } from "@/lib/session.server";
import { json } from "@/lib/http.server";
import { getD1 } from "@/lib/d1.server";

export const Route = createFileRoute("/api/admin/system/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user || !user.isAdmin) {
          return new Response("Unauthorized", { status: 401 });
        }

        const config = getNotificationConfigStatus();

        return json({
          ok: true,
          timestamp: new Date().toISOString(),
          config,
          storage: { d1Configured: Boolean(getD1()) },
        });
      },
    },
  },
});
