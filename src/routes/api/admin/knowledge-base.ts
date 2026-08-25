import { createFileRoute } from "@tanstack/react-router";
import { json, body, guard } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getStore, updateStore } from "@/lib/db.server";
import { mineAllResolvedThreads, sanitizeTextForKnowledge } from "@/lib/support/kb-mining.server";

export const Route = createFileRoute("/api/admin/knowledge-base")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const url = new URL(request.url);
          const search = url.searchParams.get("q")?.toLowerCase() || "";

          const store = await getStore();
          const settings = (store.settings ?? {}) as Record<string, unknown>;
          let kbArticles = (settings["kbArticles"] as any[]) ?? [];

          if (search) {
            kbArticles = kbArticles.filter(
              (a) =>
                a.title?.toLowerCase().includes(search) ||
                a.match?.toLowerCase().includes(search) ||
                a.steps?.toLowerCase().includes(search),
            );
          }

          return json({
            articles: kbArticles,
            total: kbArticles.length,
            approvedCount: kbArticles.filter((a) => a.status !== "disabled").length,
          });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body<{
            action?: "mine" | "save" | "delete" | "toggle";
            articles?: any[];
            article?: any;
            articleId?: string;
          }>(request);

          if (data.action === "mine") {
            const result = await mineAllResolvedThreads();
            const store = await getStore();
            const settings = (store.settings ?? {}) as Record<string, unknown>;
            return json({
              success: true,
              ...result,
              articles: (settings["kbArticles"] as any[]) ?? [],
            });
          }

          const store = await getStore();
          const settings = (store.settings ?? {}) as Record<string, unknown>;
          let currentKb = ((settings["kbArticles"] as any[]) ?? []) as any[];

          if (data.action === "delete" && data.articleId) {
            currentKb = currentKb.filter((a) => a.id !== data.articleId);
          } else if (data.action === "toggle" && data.articleId) {
            currentKb = currentKb.map((a) =>
              a.id === data.articleId
                ? { ...a, status: a.status === "disabled" ? "approved" : "disabled" }
                : a,
            );
          } else if (data.action === "save" && data.article) {
            const item = data.article;
            const cleanTitle = sanitizeTextForKnowledge(item.title || "");
            const cleanSteps = sanitizeTextForKnowledge(item.steps || "");
            const cleanMatch = sanitizeTextForKnowledge(item.match || "");

            const existingIdx = currentKb.findIndex((a) => a.id === item.id);
            const updatedItem = {
              ...item,
              title: cleanTitle,
              steps: cleanSteps,
              match: cleanMatch,
              updatedAt: new Date().toISOString(),
            };

            if (existingIdx !== -1) {
              currentKb[existingIdx] = updatedItem;
            } else {
              currentKb.unshift({
                id: item.id || `kb_admin_${Math.random().toString(36).slice(2, 9)}`,
                ...updatedItem,
                createdAt: new Date().toISOString(),
                status: item.status || "approved",
                usageCount: item.usageCount || 1,
              });
            }
          } else if (Array.isArray(data.articles)) {
            currentKb = data.articles;
          }

          await updateStore((doc) => ({
            ...doc,
            settings: { ...(doc.settings || {}), kbArticles: currentKb },
          }));

          return json({ success: true, articles: currentKb });
        }),
    },
  },
});
