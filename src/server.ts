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
  async fetch(request: Request, env: any, ctx: any) {
    if (env) {
      publishEnv(env);
    }
    return await fetchHandler(request, {
      context: {
        env,
        ctx,
      },
    });
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

