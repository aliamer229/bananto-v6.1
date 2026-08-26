import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/db.server";
import { guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/admin/store")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const store = await getStore();
          const { products, ...storeWithoutProducts } = store as any;
          return json(storeWithoutProducts);
        }),
    },
  },
});
