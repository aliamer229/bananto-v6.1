import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { ChatRealtimeDO } from "./lib/chat-realtime.server";
import { publishEnv } from "./lib/env.server";

export { ChatRealtimeDO };

const fetch = createStartHandler(defaultStreamHandler);

export function createServerEntry(entry: { fetch: any }) {
  return {
    async fetch(...args: [Request, any, any]) {
      const [request, env] = args;
      if (env) {
        publishEnv(env);
      }
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({ fetch });
