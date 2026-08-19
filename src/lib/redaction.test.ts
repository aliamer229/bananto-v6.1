import { describe, expect, it } from "vitest";

import {
  redactDiscTradeForMember,
  redactMessageForMember,
  redactOrderHistoryForMember,
} from "./redaction";

describe("member response redaction", () => {
  it("removes internal support traces from chat and order messages", () => {
    const result = redactMessageForMember({
      id: "msg_1",
      body: { text: "visible", support: { trace: "private", memory: "private" } },
    });
    expect(result).toEqual({ id: "msg_1", body: { text: "visible" } });
  });

  it("removes staff identities and notes from order history", () => {
    expect(
      redactOrderHistoryForMember({
        id: "history_1",
        new_status: "paid",
        changed_by: "admin@example.com",
        note: "internal note",
      }),
    ).toEqual({ id: "history_1", new_status: "paid" });
  });

  it("removes private trade notes and history actors", () => {
    expect(
      redactDiscTradeForMember({
        id: "trade_1",
        status: "waiting_review",
        admin_notes: "private",
        thread_id: "thr_private",
        status_history: JSON.stringify([
          {
            status: "waiting_review",
            at: "2026-08-15",
            actor: "admin@example.com",
            note: "private",
          },
        ]),
      }),
    ).toEqual({
      id: "trade_1",
      status: "waiting_review",
      status_history: JSON.stringify([{ status: "waiting_review", at: "2026-08-15" }]),
    });
  });
});
