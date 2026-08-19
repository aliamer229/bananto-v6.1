import { processAutoScheduledTasks, processBotTrading } from "./lib/scheduled-jobs.server";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { publishEnv } from "./lib/env.server";
import { rejectCrossSiteMutation, withSecurityHeaders } from "./lib/security.server";
import { reconcileTelegramWebhook } from "./lib/telegram.server";
import swSource from "../public/sw.js?raw";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Publish the Cloudflare bindings (D1 `bananto`, R2 `BANANTO_BUCKET`, `BANANTO_PRIVATE_BUCKET`) and plain-text
 * secrets so server-side modules can read them without threading `env`
 * through every call. Cloudflare injects `env` per request, so this runs on
 * every fetch rather than at module scope.
 */
function publishCloudflareEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  const record = env as Record<string, unknown>;

  publishEnv(record);

  // Only pollute process.env in local development/preview where it might be expected
  // by some library builds, but avoid it in production Workers.
  if (record["APP_ENV"] !== "production") {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }
  }
}

/** Requests worth keeping in the Cloudflare edge cache (immutable public image proxies). */
function isCacheableAsset(url: URL) {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    return false;
  }
  // Allowlist only safe public proxies. Private files in /api/files/ must never be cached in Edge Cache.
  return path.startsWith("/api/img");
}

type CacheLike = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

function edgeCache(): CacheLike | undefined {
  const store = (globalThis as { caches?: { default?: CacheLike } }).caches?.default;
  return store && typeof store.match === "function" ? store : undefined;
}

type DurableObjectState = { id: unknown; storage: unknown };

export class ChatRealtimeDO {
  private state: DurableObjectState;
  private subscribers: Set<ReadableStreamDefaultController>;
  private typingMap: Map<string, { userName: string; senderRole: string; expiresAt: number }>;
  private presenceMap: Map<string, number>;
  private cleanupInterval: number | null = null;
  private pingInterval: number | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.subscribers = new Set();
    this.typingMap = new Map();
    this.presenceMap = new Map();

    // Cloudflare DO now supports state.acceptWebSocket() but we need to support the existing SSE client
    // so we handle streaming responses manually.
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop();

    if (action === "subscribe") {
      const { readable, writable } = new TransformStream();
      const controller = writable.getWriter();

      const encoder = new TextEncoder();
      const write = (data: string) => controller.write(encoder.encode(data));

      write(`event: connected\ndata: {"time": "${new Date().toISOString()}"}\n\n`);

      const sseController = {
        enqueue: (chunk: Uint8Array) => controller.write(chunk),
        close: () => controller.close(),
      } as unknown as ReadableStreamDefaultController;

      this.subscribers.add(sseController);

      if (!this.cleanupInterval) {
        this.cleanupInterval = setInterval(() => this.cleanExpired(), 2000) as unknown as number;
      }
      if (!this.pingInterval) {
        this.pingInterval = setInterval(() => {
          this.broadcastRaw(`event: ping\ndata: {"time": ${Date.now()}}\n\n`);
        }, 15000) as unknown as number;
      }

      request.signal.addEventListener("abort", () => {
        this.subscribers.delete(sseController);
        if (this.subscribers.size === 0) {
          if (this.cleanupInterval) clearInterval(this.cleanupInterval);
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.cleanupInterval = null;
          this.pingInterval = null;
        }
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    if (request.method === "POST") {
      const data = (await request.json()) as any;

      if (action === "broadcast") {
        this.broadcastRaw(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
        return new Response("OK");
      }

      if (action === "setTyping") {
        const { user, isTyping } = data;
        if (isTyping) {
          this.typingMap.set(user.id, {
            userName: user.name,
            senderRole: user.role,
            expiresAt: Date.now() + 4000,
          });
        } else {
          this.typingMap.delete(user.id);
        }

        this.broadcastTypingUpdate();
        return new Response("OK");
      }

      if (action === "recordPresence") {
        const { userId } = data;
        this.presenceMap.set(userId, Date.now());

        const participants = Array.from(this.presenceMap.entries())
          .filter(([_, lastSeen]) => Date.now() - lastSeen < 60_000)
          .map(([uid, lastSeen]) => ({ userId: uid, lastSeen }));

        this.broadcastRaw(
          `event: presence.update\ndata: ${JSON.stringify({ type: "presence.update", payload: { participants } })}\n\n`,
        );
        return new Response("OK");
      }
    }

    if (request.method === "GET") {
      if (action === "getActiveTypers") {
        this.cleanExpired();
        const activeTypers = Array.from(this.typingMap.entries()).map(([userId, t]) => ({
          userId,
          userName: t.userName,
          senderRole: t.senderRole,
        }));
        return new Response(JSON.stringify(activeTypers));
      }

      if (action === "isUserOnline") {
        const userId = url.searchParams.get("userId");
        if (!userId) return new Response("false");
        const lastSeen = this.presenceMap.get(userId);
        const isOnline = lastSeen ? Date.now() - lastSeen < 60_000 : false;
        return new Response(JSON.stringify(isOnline));
      }
    }

    return new Response("Not found", { status: 404 });
  }

  private cleanExpired() {
    let typingChanged = false;
    let presenceChanged = false;
    const now = Date.now();

    for (const [userId, item] of this.typingMap.entries()) {
      if (item.expiresAt < now) {
        this.typingMap.delete(userId);
        typingChanged = true;
      }
    }

    for (const [userId, lastSeen] of this.presenceMap.entries()) {
      if (now - lastSeen >= 60_000) {
        this.presenceMap.delete(userId);
        presenceChanged = true;
      }
    }

    if (typingChanged) {
      this.broadcastTypingUpdate();
    }

    if (presenceChanged) {
      const participants = Array.from(this.presenceMap.entries()).map(([uid, lastSeen]) => ({
        userId: uid,
        lastSeen,
      }));
      this.broadcastRaw(
        `event: presence.update\ndata: ${JSON.stringify({ type: "presence.update", payload: { participants } })}\n\n`,
      );
    }
  }

  private broadcastTypingUpdate() {
    const activeTypers = Array.from(this.typingMap.entries()).map(([userId, t]) => ({
      userId,
      userName: t.userName,
      senderRole: t.senderRole,
    }));
    this.broadcastRaw(
      `event: typing.update\ndata: ${JSON.stringify({ type: "typing.update", payload: { typers: activeTypers } })}\n\n`,
    );
  }

  private broadcastRaw(str: string) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    for (const subscriber of this.subscribers) {
      try {
        subscriber.enqueue(encoded);
      } catch (e) {
        this.subscribers.delete(subscriber);
      }
    }
  }
}

export default {
  async scheduled(event: { scheduledTime: number; cron: string }, env: unknown, ctx: unknown) {
    publishCloudflareEnv(env);
    (ctx as { waitUntil: (p: Promise<any>) => void }).waitUntil(
      Promise.all([
        processAutoScheduledTasks(),
        processBotTrading(),
        reconcileTelegramWebhook(true),
      ]),
    );
  },

  async queue(batch: { messages: { body: any }[] }, env: unknown, ctx: unknown) {
    publishCloudflareEnv(env);
    for (const message of batch.messages) {
      const job = message.body;
      try {
        if (job.type === "otp" || job.type === "whatsapp") {
          const { sendWhatsappMessage } = await import("./lib/whatsapp.server");
          await sendWhatsappMessage(job.phone, job.message);
        } else if (job.type === "telegram") {
          const { sendTelegramMessage } = await import("./lib/telegram.server");
          await sendTelegramMessage(job.chatId || job.phone, job.message);
        }
      } catch (err) {
        console.error("Queue processing error:", err);
      }
    }
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    publishCloudflareEnv(env);
    const url = new URL(request.url);

    if (
      url.pathname === "/sw" ||
      url.pathname === "/sw.js" ||
      url.pathname === "/serviceWorker.js"
    ) {
      return withSecurityHeaders(
        new Response(swSource as string, {
          status: 200,
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "service-worker-allowed": "/",
            "cache-control": "no-cache, no-store, must-revalidate",
          },
        }),
      );
    }
    if (url.pathname === "/auth" || url.pathname === "/telegram" || url.pathname === "/api/otp") {
      const waitUntil = (ctx as { waitUntil?: (p: Promise<unknown>) => void })?.waitUntil;
      const repair = reconcileTelegramWebhook().catch((error) => {
        console.error("[telegram:error] background webhook maintenance failed", error);
      });
      if (typeof waitUntil === "function") waitUntil.call(ctx, repair);
    }
    const rejected = rejectCrossSiteMutation(request);
    if (rejected) return withSecurityHeaders(rejected);
    const cache = request.method === "GET" && isCacheableAsset(url) ? edgeCache() : undefined;

    if (cache) {
      const hit = await cache.match(request).catch(() => undefined);
      if (hit) return withSecurityHeaders(hit);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const secured = withSecurityHeaders(normalized);
      if (
        cache &&
        secured.status === 200 &&
        !/\b(?:private|no-store)\b/i.test(secured.headers.get("cache-control") ?? "")
      ) {
        const cacheable = secured.clone();
        const waitUntil = (ctx as { waitUntil?: (p: Promise<unknown>) => void })?.waitUntil;
        const put = cache.put(request, cacheable).catch(() => undefined);
        if (typeof waitUntil === "function") waitUntil.call(ctx, put);
      }
      return secured;
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
