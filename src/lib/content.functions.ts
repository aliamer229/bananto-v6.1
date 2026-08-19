import { createServerFn } from "@tanstack/react-start";

import { mergeContent, type ContentDoc } from "./content";

/**
 * Public read of the editable site content, usable from route loaders during
 * SSR and client navigation alike (a relative fetch would not resolve on SSR).
 */
export const loadSiteContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContentDoc> => {
    const { getStore } = await import("./db.server");
    const store = (await getStore()) as { content?: unknown };
    return mergeContent(store?.content);
  },
);
