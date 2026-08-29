import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { ChatRealtimeDO } from "./lib/chat-realtime.server";
import { publishEnv } from "./lib/env.server";
import { handleQueueBatch, type CloudflareMessageBatch } from "./lib/queue-consumer.server";
import {
  processAutoScheduledTasks,
  processDigitalDeliveryMaintenance,
  processBotTrading,
} from "./lib/scheduled-jobs.server";

export { ChatRealtimeDO };

const fetchHandler = createStartHandler(defaultStreamHandler);

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    try {
      if (env) {
        publishEnv(env);
      }

      // Serve static assets via Cloudflare Workers Assets binding if present
      if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
        try {
          const url = new URL(request.url);
          const isAssetPath =
            url.pathname.startsWith("/assets/") ||
            url.pathname.startsWith("/illustrations/") ||
            url.pathname.startsWith("/textures/") ||
            url.pathname.startsWith("/templates/") ||
            url.pathname === "/favicon.png" ||
            url.pathname === "/favicon.ico" ||
            url.pathname === "/robots.txt" ||
            url.pathname === "/sw.js" ||
            url.pathname === "/manifest.webmanifest" ||
            url.pathname === "/latest.rss" ||
            /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|json|woff2?|ttf|eot|wasm|map|txt)$/i.test(
              url.pathname,
            );

          if (isAssetPath) {
            const assetRes = await env.ASSETS.fetch(request);
            if (assetRes.status < 400) {
              return assetRes;
            }
          }
        } catch (assetErr) {
          console.warn("[worker:assets_fetch_error]", assetErr);
        }
      }

      return await fetchHandler(request, {
        context: {
          env,
          ctx,
        },
      });
    } catch (err: any) {
      console.error("[worker:fetch_error]", err?.stack || err);

      // Attempt asset fallback if handler failed
      if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
        try {
          const fallbackRes = await env.ASSETS.fetch(request);
          if (fallbackRes.status < 400) {
            return fallbackRes;
          }
        } catch {
          // ignore
        }
      }

      const errorMessage =
        typeof err === "object" && err !== null ? err.message || String(err) : String(err);

      return new Response(
        `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>خطأ في الخادم — بنانا ستور</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #fcf9f5;
      color: #221a15;
      text-align: center;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      padding: 32px;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    h1 { font-size: 22px; margin-bottom: 12px; font-weight: 800; }
    p { font-size: 14px; opacity: 0.8; line-height: 1.6; margin-bottom: 24px; }
    a {
      display: inline-block;
      background: #e11d48;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>حدث خطأ غير متوقع في الخادم</h1>
    <p>نعتذر عن هذا الخطأ. يتم العمل على معالجة المشكلة تلقائياً. يرجى إعادة المحاولة بعد لحظات.</p>
    <a href="/">العودة إلى الصفحة الرئيسية</a>
  </div>
</body>
</html>`,
        {
          status: 500,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }
  },

  async queue(batch: CloudflareMessageBatch, env: any, ctx?: any) {
    if (env) {
      publishEnv(env);
    }
    await handleQueueBatch(batch, env, ctx);
  },

  async scheduled(event: any, env: any, ctx?: any) {
    if (env) {
      publishEnv(env);
    }
    try {
      await Promise.allSettled([
        processAutoScheduledTasks(),
        processDigitalDeliveryMaintenance(),
        processBotTrading(),
      ]);
    } catch (err) {
      console.error("[worker:scheduled_error]", err);
    }
  },
};

