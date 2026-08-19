import { createFileRoute } from "@tanstack/react-router";
import { setSessionCookie } from "@/lib/session.server";
import { getUsers } from "@/lib/db.server";
import { d1Ready } from "@/lib/d1.server";

export const Route = createFileRoute("/api/public/dbgsess")({
  server: {
    handlers: {
      GET: async () => {
        const ready = d1Ready();
        const users = await getUsers();
        const admin = users.find((u) => u.isAdmin);
        const cookie = admin ? await setSessionCookie(admin.id) : null;
        return new Response(JSON.stringify({ ready, count: users.length, cookie }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
