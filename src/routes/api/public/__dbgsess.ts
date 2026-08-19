import { createFileRoute } from "@tanstack/react-router";
import { setSessionCookie } from "@/lib/session.server";
import { getUsers } from "@/lib/db.server";

export const Route = createFileRoute("/api/public/__dbgsess")({
  server: {
    handlers: {
      GET: async () => {
        const users = await getUsers();
        const admin = users.find((u) => u.isAdmin);
        if (!admin) return new Response("no admin", { status: 404 });
        const cookie = await setSessionCookie(admin.id);
        return new Response(JSON.stringify({ id: admin.id, cookie }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
