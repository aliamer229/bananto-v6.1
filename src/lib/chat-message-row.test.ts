import { describe, expect, it } from "vitest";

import { isEmptyMessage, readMessageBody, readMessageRow } from "./chat-message-row";
import { redactMessageForMember } from "./redaction";

describe("readMessageRow", () => {
  it("passes a well-formed document straight through", () => {
    const doc = {
      id: "msg_1",
      threadId: "thr_1",
      senderRole: "admin",
      senderName: "المشرف",
      kind: "item_verification_code",
      body: { itemId: "it_1", code: "123456" },
      createdAt: "2026-08-23T10:00:00.000Z",
    };
    expect(readMessageRow({ doc: JSON.stringify(doc) })).toEqual(doc);
  });

  it("gives a truncated document an object body instead of undefined", () => {
    // This is the exact failure: `"support" in undefined` threw in redaction
    // and turned one bad row into a 500 for the whole conversation.
    const row = readMessageRow({
      doc: '{"id":"msg_2","threadId":"thr_1","body":{"text":"cut off',
      rowId: "msg_2",
      threadId: "thr_1",
    });
    expect(row.body).toEqual({});
    expect(() => redactMessageForMember(row)).not.toThrow();
  });

  it("recovers a body that was stored double-encoded", () => {
    const row = readMessageRow({
      doc: {
        id: "msg_3",
        senderRole: "admin",
        kind: "text",
        body: JSON.stringify({ text: "مرحبا" }),
        createdAt: "2026-08-23T10:00:00.000Z",
      },
    });
    expect(row.body).toEqual({ text: "مرحبا" });
  });

  it("keeps a plain string body readable rather than dropping it", () => {
    expect(readMessageBody("just text")).toEqual({ text: "just text" });
  });

  it("never attributes an unreadable row to the customer", () => {
    // Rendering someone else's message as the member's own is worse than
    // rendering it as a system note.
    expect(readMessageRow({ doc: "not json at all" }).senderRole).toBe("system");
    expect(readMessageRow({ doc: { senderRole: 42 } }).senderRole).toBe("system");
    expect(readMessageRow({ doc: { senderRole: "admin" } }).senderRole).toBe("admin");
  });

  it("falls back to the database row id so two id-less rows cannot collide", () => {
    const a = readMessageRow({ doc: { body: { text: "a" } }, rowId: "row_a", threadId: "t" });
    const b = readMessageRow({ doc: { body: { text: "b" } }, rowId: "row_b", threadId: "t" });
    expect(a.id).toBe("row_a");
    expect(b.id).toBe("row_b");
    expect(a.id).not.toBe(b.id);
  });

  it("never returns an undefined kind or createdAt", () => {
    const row = readMessageRow({ doc: {}, threadId: "thr_1" });
    expect(row.kind).toBe("text");
    expect(typeof row.createdAt).toBe("string");
    expect(row.threadId).toBe("thr_1");
  });

  it("survives every shape a corrupt row can take", () => {
    for (const doc of [null, undefined, 0, "", "[]", "[1,2]", '"a string"', { body: 7 }, []]) {
      expect(() => readMessageRow({ doc, threadId: "thr_1" })).not.toThrow();
      const row = readMessageRow({ doc, threadId: "thr_1" });
      expect(typeof row.body).toBe("object");
      expect(row.body).not.toBeNull();
      expect(() => redactMessageForMember(row)).not.toThrow();
    }
  });
});

describe("isEmptyMessage", () => {
  it("is true only for a row with nothing left to render", () => {
    expect(isEmptyMessage(readMessageRow({ doc: "broken" }))).toBe(true);
    expect(isEmptyMessage(readMessageRow({ doc: { body: { text: "hi" } } }))).toBe(false);
    // A card carries its meaning in the kind even with a thin body.
    expect(isEmptyMessage(readMessageRow({ doc: { kind: "digital_order_card", body: {} } }))).toBe(
      false,
    );
  });
});

describe("redactMessageForMember", () => {
  it("fails closed on a body that is not an object", () => {
    const result = redactMessageForMember({
      id: "m",
      body: undefined as unknown as Record<string, unknown>,
    });
    expect(result.body).toEqual({});
  });

  it("still strips the internal support field", () => {
    const result = redactMessageForMember({ body: { text: "hi", support: { notes: "x" } } });
    expect(result.body).toEqual({ text: "hi" });
  });
});
