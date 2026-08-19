import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { safeRandomUUID } from "./polyfills";

/** Get or create a persistent session ID for tracking */
export function getSessionId() {
  if (typeof window === "undefined") return null;
  let sid = window.localStorage.getItem("bnt_sid");
  if (!sid) {
    sid = `sid_${safeRandomUUID().replace(/-/g, "")}`;
    window.localStorage.setItem("bnt_sid", sid);
  }
  return sid;
}

export const trackBrowsing = createServerFn({ method: "POST" })
  .validator(
    z.object({
      path: z.string(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      durationSeconds: z.number().optional(),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async (args) => {
    const { trackBrowsing: handler } = await import("./activity.functions.server");
    return handler(args);
  });

export const trackSearch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      query: z.string(),
      filters: z.record(z.string(), z.any()).optional(),
      category: z.string().optional(),
      resultsCount: z.number().optional(),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async (args) => {
    const { trackSearch: handler } = await import("./activity.functions.server");
    return handler(args);
  });

export const trackInteraction = createServerFn({ method: "POST" })
  .validator(
    z.object({
      productId: z.string(),
      type: z.enum(["favorite", "add_to_cart", "remove_from_cart", "share", "banner_click"]),
      metadata: z.record(z.string(), z.any()).optional(),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async (args) => {
    const { trackInteraction: handler } = await import("./activity.functions.server");
    return handler(args);
  });

export const clearSearchHistory = createServerFn({ method: "POST" }).handler(async (args) => {
  const { clearSearchHistory: handler } = await import("./activity.functions.server");
  return (handler as any)(args);
});

export const clearBrowsingHistory = createServerFn({ method: "POST" }).handler(async (args) => {
  const { clearBrowsingHistory: handler } = await import("./activity.functions.server");
  return (handler as any)(args);
});
