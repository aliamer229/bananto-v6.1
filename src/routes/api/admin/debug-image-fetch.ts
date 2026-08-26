import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { fetchRemoteMedia } from "@/lib/mediaIngest.server";

export const Route = createFileRoute("/api/admin/debug-image-fetch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireAdmin(request);
        
        try {
          const body = await request.json();
          const url = body.url;
          
          if (!url || typeof url !== "string") {
            return json({ error: "No URL provided" }, { status: 400 });
          }

          const fetchResult = await fetchRemoteMedia(url, { maxAttempts: 3, timeoutMs: 30000 });
          
          return json({
            originalUrl: fetchResult.sourceUrl,
            finalUrl: fetchResult.finalUrl,
            status: fetchResult.httpStatus,
            contentType: fetchResult.mime,
            contentLength: fetchResult.bytes?.length || 0,
            attempts: fetchResult.attempts,
            success: fetchResult.ok,
            error: fetchResult.error,
          });
        } catch (e: any) {
          return json({ error: e.message }, { status: 500 });
        }
      },
    },
  },
});
