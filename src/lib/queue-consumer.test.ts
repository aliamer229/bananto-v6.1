import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleQueueBatch, type CloudflareMessageBatch } from "./queue-consumer.server";

describe("Cloudflare Queue Consumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes and acknowledges valid messages", async () => {
    const ackMock = vi.fn();
    const retryMock = vi.fn();

    const batch: CloudflareMessageBatch = {
      queue: "notifications-queue",
      messages: [
        {
          id: "msg_test_1",
          timestamp: new Date(),
          attempts: 1,
          body: {
            type: "scheduled_tasks",
          },
          ack: ackMock,
          retry: retryMock,
        },
      ],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };

    await handleQueueBatch(batch, {});

    expect(ackMock).toHaveBeenCalledTimes(1);
    expect(retryMock).not.toHaveBeenCalled();
  });

  it("handles stringified JSON messages correctly", async () => {
    const ackMock = vi.fn();
    const retryMock = vi.fn();

    const batch: CloudflareMessageBatch = {
      queue: "notifications-queue",
      messages: [
        {
          id: "msg_test_json_string",
          timestamp: new Date(),
          attempts: 1,
          body: JSON.stringify({
            type: "unknown_future_event",
            payload: { foo: "bar" },
          }),
          ack: ackMock,
          retry: retryMock,
        },
      ],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };

    await handleQueueBatch(batch, {});

    expect(ackMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges malformed payloads without infinite retries", async () => {
    const ackMock = vi.fn();
    const retryMock = vi.fn();

    const batch: CloudflareMessageBatch = {
      queue: "notifications-queue",
      messages: [
        {
          id: "msg_empty",
          timestamp: new Date(),
          attempts: 1,
          body: null,
          ack: ackMock,
          retry: retryMock,
        },
      ],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };

    await handleQueueBatch(batch, {});

    expect(ackMock).toHaveBeenCalledTimes(1);
  });
});
