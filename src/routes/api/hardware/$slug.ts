import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/db.server";
import { json, guard } from "@/lib/http.server";
import { slugifyDevice, getDevicePerformanceList } from "@/lib/devicePerformance";
import { resolveCategoryType } from "@/lib/productSection";

export const Route = createFileRoute("/api/hardware/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        guard(async () => {
          const store = await getStore();
          const wanted = slugifyDevice(params.slug);
          const hardware = (store.products || []).find((product) => {
            const section = resolveCategoryType(
              String(product.categoryId || product.category || ""),
              "",
              String(product.kind || ""),
              String(product.schemaId || ""),
            );
            return (
              section === "hardware" &&
              slugifyDevice(product.slug || product.title || product.shortName) === wanted
            );
          });
          if (!hardware) return json({ error: "Hardware not found" }, { status: 404 });

          const linkedGames = (store.products || []).filter((product) =>
            getDevicePerformanceList(product).some((record) => record.deviceSlug === wanted),
          ).length;
          return json({ hardware, linkedGames });
        }, "api:hardware"),
    },
  },
});
