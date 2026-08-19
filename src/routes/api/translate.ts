import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { translateProductContent } from "@/lib/translate.server";

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<{
            title?: string;
            titleEn?: string;
            description?: string;
            descriptionEn?: string;
            badge?: string;
            features?: string[];
            genre?: string;
          }>(request);

          const result = await translateProductContent(payload);
          return json({ success: true, translation: result });
        }),
    },
  },
});
