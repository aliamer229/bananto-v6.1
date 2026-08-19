import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { d1Run, randomId } from "./db.server";
import { hashIp } from "./crypto.server";
import { getSessionUser } from "./session.server";
import { consumeRateLimit, rateLimitResponse } from "./rate-limit.server";

export interface RequestInfo {
  ipHash: string;
  userAgent: string;
  deviceType: string;
  browser: string;
  os: string;
  referrer: string;
  path: string;
}

function pathOnly(raw: string): string {
  try {
    return new URL(raw, "https://activity.invalid").pathname.slice(0, 500);
  } catch {
    return "/";
  }
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(?:password|secret|token|code|credential|phone|email)/i.test(key))
      .slice(0, 30),
  );
  try {
    return JSON.stringify(clean).length <= 4096 ? clean : {};
  } catch {
    return {};
  }
}

export async function getRequestInfo(request: Request): Promise<RequestInfo> {
  const ua = (request.headers.get("user-agent") || "").slice(0, 500);
  const ip =
    request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "0.0.0.0";
  const ipHash = await hashIp(ip);

  const isMobile = /mobile/i.test(ua);
  const isTablet = /tablet/i.test(ua);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let browser = "unknown";
  if (ua.includes("Firefox")) browser = "firefox";
  else if (ua.includes("Chrome")) browser = "chrome";
  else if (ua.includes("Safari")) browser = "safari";
  else if (ua.includes("Edge")) browser = "edge";

  let os = "unknown";
  if (ua.includes("Windows")) os = "windows";
  else if (ua.includes("Mac OS")) os = "macos";
  else if (ua.includes("Android")) os = "android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "ios";
  else if (ua.includes("Linux")) os = "linux";

  const referrer = pathOnly(request.headers.get("referer") || "");
  let path = "/";
  try {
    const url = new URL(request.url);
    path = url.pathname.slice(0, 500);
  } catch {
    // Fallback
  }

  return {
    ipHash,
    userAgent: ua,
    deviceType,
    browser,
    os,
    referrer,
    path,
  };
}

export async function logActivity(params: {
  userId?: string | null;
  sessionId?: string | null;
  activityType: string;
  entityType?: string | null;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, any> | null;
  request?: Request | null;
}) {
  const { userId, sessionId, activityType, entityType, entityId, action, metadata, request } =
    params;

  let info: Partial<RequestInfo> = {};
  if (request) {
    info = await getRequestInfo(request);
  }

  await d1Run(
    `INSERT INTO user_activity_log (
      id, user_id, session_id, activity_type, entity_type, entity_id, action, 
      metadata_json, ip_hash, user_agent, device_type, browser, os, referrer, path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId("act"),
    userId || null,
    sessionId || null,
    activityType,
    entityType || null,
    entityId || null,
    action,
    JSON.stringify(safeMetadata(metadata)),
    info.ipHash || null,
    info.userAgent || null,
    info.deviceType || null,
    info.browser || null,
    info.os || null,
    info.referrer || null,
    info.path || null,
    new Date().toISOString(),
  );
}

export const trackBrowsing = createServerFn({ method: "POST" })
  .validator(
    z.object({
      path: z.string().max(500),
      entityType: z.string().max(80).optional(),
      entityId: z.string().max(160).optional(),
      metadata: z
        .record(z.string(), z.any())
        .refine((val: any) => JSON.stringify(val).length <= 4096, {
          message: "Metadata too large",
        })
        .optional(),
      durationSeconds: z.number().min(0).max(86400).optional(),
      sessionId: z.string().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const user = await getSessionUser(request);
    if (!user) return new Response(null, { status: 204 });
    const throttle = await consumeRateLimit(request, "activity-browse", 120, 60 * 60, user.id);
    if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

    const now = new Date().toISOString();
    const id = randomId("brw");
    const referrer = pathOnly(request?.headers.get("referer") || "");

    await d1Run(
      `INSERT INTO browsing_history (
        id, user_id, session_id, path, entity_type, entity_id, metadata_json, referrer, duration_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      data.sessionId || null,
      pathOnly(data.path),
      data.entityType || null,
      data.entityId || null,
      JSON.stringify(safeMetadata(data.metadata)),
      referrer,
      data.durationSeconds || null,
      now,
    );

    await logActivity({
      userId: user.id,
      sessionId: data.sessionId ?? null,
      activityType: data.entityType === "product" ? "PRODUCT_VIEW" : "PAGE_VIEW",
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      action: "view",
      metadata: data.metadata ?? null,
      request: request ?? null,
    });
    return new Response(null, { status: 204 });
  });

export const trackSearch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      query: z.string().max(200),
      filters: z
        .record(z.string(), z.any())
        .refine((val: any) => JSON.stringify(val).length <= 4096, {
          message: "Filters too large",
        })
        .optional(),
      category: z.string().max(80).optional(),
      resultsCount: z.number().min(0).max(1_000_000).optional(),
      sessionId: z.string().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const user = await getSessionUser(request);
    if (!user) return new Response(null, { status: 204 });
    const throttle = await consumeRateLimit(request, "activity-search", 60, 60 * 60, user.id);
    if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

    await d1Run(
      `INSERT INTO search_history (
        id, user_id, query, filters_json, category, results_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomId("sch"),
      user.id,
      data.query,
      JSON.stringify(safeMetadata(data.filters)),
      data.category || null,
      data.resultsCount || 0,
      new Date().toISOString(),
    );

    await logActivity({
      userId: user.id,
      sessionId: data.sessionId ?? null,
      activityType: "SEARCH",
      action: "search",
      metadata: { query: data.query, resultsCount: data.resultsCount },
      request: request ?? null,
    });
    return new Response(null, { status: 204 });
  });

export const trackInteraction = createServerFn({ method: "POST" })
  .validator(
    z.object({
      productId: z.string().max(160),
      type: z.enum(["favorite", "add_to_cart", "remove_from_cart", "share", "banner_click"]),
      metadata: z
        .record(z.string(), z.any())
        .refine((val: any) => JSON.stringify(val).length <= 4096, {
          message: "Metadata too large",
        })
        .optional(),
      sessionId: z.string().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const user = await getSessionUser(request);
    if (!user) return new Response(null, { status: 204 });
    const throttle = await consumeRateLimit(request, "activity-interaction", 120, 60 * 60, user.id);
    if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

    await d1Run(
      `INSERT INTO product_interactions (
        id, user_id, product_id, interaction_type, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      randomId("int"),
      user.id,
      data.productId,
      data.type,
      JSON.stringify(safeMetadata(data.metadata)),
      new Date().toISOString(),
    );

    await logActivity({
      userId: user.id,
      sessionId: data.sessionId ?? null,
      activityType: "PRODUCT_INTERACTION",
      entityType: "product",
      entityId: data.productId,
      action: data.type,
      metadata: data.metadata ?? null,
      request: request ?? null,
    });
    return new Response(null, { status: 204 });
  });

export const clearSearchHistory = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getSessionUser(getRequest());
  if (!user) return;
  await d1Run(`DELETE FROM search_history WHERE user_id = ?`, user.id);
});

export const clearBrowsingHistory = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getSessionUser(getRequest());
  if (!user) return;
  await d1Run(`DELETE FROM browsing_history WHERE user_id = ?`, user.id);
});

/** Get or create a persistent session ID for tracking */
export function getSessionId() {
  if (typeof window === "undefined") return null;
  let sid = window.localStorage.getItem("bnt_sid");
  if (!sid) {
    sid = `sid_${crypto.randomUUID().replace(/-/g, "")}`;
    window.localStorage.setItem("bnt_sid", sid);
  }
  return sid;
}
