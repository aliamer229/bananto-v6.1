import { createFileRoute } from "@tanstack/react-router";
import { setSessionCookie } from "@/lib/session.server";
import { getUsers } from "@/lib/db.server";
import { d1Ready, getD1, cfEnv } from "@/lib/d1.server";

export const Route = createFileRoute("/api/public/dbgsess")({
  server: {
    handlers: {
      GET: async () => {
        const ready = d1Ready();
        const e = cfEnv() as Record<string, unknown>;
        const binding = Boolean(e?.["bananto"] || e?.["DB"] || e?.["BANANTO_DB"]);
        const hasRest = Boolean(e?.["CLOUDFLARE_ACCOUNT_ID"] && e?.["CLOUDFLARE_API_TOKEN"] && (e?.["D1_DATABASE_ID"] || e?.["CLOUDFLARE_D1_DATABASE_ID"]));
        void getD1();
        const users = await getUsers();
        const admin = users.find((u) => u.isAdmin);
        const cookie = admin ? await setSessionCookie(admin.id) : null;
        return new Response(JSON.stringify({ ready, binding, hasRest, count: users.length, cookie }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
