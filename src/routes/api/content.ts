import { createFileRoute } from "@tanstack/react-router";

import { getStore, updateStore } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { mergeContent, type ContentDoc } from "@/lib/content";
import type { StoreDoc } from "@/lib/types";

/** Public read of the editable site content, admin-only write. */
export const Route = createFileRoute("/api/content")({
  server: {
    handlers: {
      GET: async () =>
        guard(async () => {
          const store = (await getStore()) as StoreDoc & { content?: unknown };
          return json(mergeContent(store.content), {
            headers: { "cache-control": "public, max-age=30, stale-while-revalidate=300" },
          });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const patch = await body<Partial<ContentDoc>>(request);
          const updated = await updateStore((current) => {
            const merged = mergeContent({
              ...((current as StoreDoc & { content?: object }).content ?? {}),
              ...patch,
            });
            return { ...current, content: merged } as StoreDoc;
          });
          return json({
            success: true,
            data: mergeContent((updated as StoreDoc & { content?: unknown }).content),
          });
        }),
    },
  },
});
