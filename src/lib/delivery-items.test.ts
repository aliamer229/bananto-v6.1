import { describe, expect, it } from "vitest";

import {
  advanceDeliveryStatus,
  DELIVERY_ITEM_STATUSES,
  draftStatus,
  isDraftSendable,
  isForwardTransition,
  normalizeDeliveryStatus,
  summarizeDeliveryProgress,
} from "./delivery-items";

describe("normalizeDeliveryStatus", () => {
  it("accepts the states it knows and nothing else", () => {
    for (const status of DELIVERY_ITEM_STATUSES) {
      expect(normalizeDeliveryStatus(status)).toBe(status);
    }
    expect(normalizeDeliveryStatus("SENT")).toBe("sent");
    // Anything unrecognisable is a draft — the safest place to be, since a
    // draft cannot be sent by accident.
    expect(normalizeDeliveryStatus("nonsense")).toBe("draft");
    expect(normalizeDeliveryStatus(null)).toBe("draft");
    expect(normalizeDeliveryStatus(42)).toBe("draft");
  });
});

describe("advanceDeliveryStatus", () => {
  it("walks the whole flow one step at a time", () => {
    let status = normalizeDeliveryStatus("draft");
    for (const event of ["ready", "sent", "proof_received", "otp_sent", "completed"] as const) {
      status = advanceDeliveryStatus(status, event);
      expect(status).toBe(event);
    }
  });

  it("never moves a line backwards", () => {
    /*
      A retried request or a double-clicked button must not undo the code that
      already went out.
    */
    expect(advanceDeliveryStatus("otp_sent", "sent")).toBe("otp_sent");
    expect(advanceDeliveryStatus("completed", "draft")).toBe("completed");
    expect(advanceDeliveryStatus("proof_received", "ready")).toBe("proof_received");
  });

  it("is idempotent for the same event", () => {
    expect(advanceDeliveryStatus("sent", "sent")).toBe("sent");
  });

  it("agrees with isForwardTransition", () => {
    expect(isForwardTransition("sent", "otp_sent")).toBe(true);
    expect(isForwardTransition("otp_sent", "sent")).toBe(false);
    expect(isForwardTransition("sent", "sent")).toBe(true);
  });
});

describe("isDraftSendable", () => {
  const complete = { itemId: "it_1", username: "user", password: "pw" };

  it("needs a game, a login and a password", () => {
    expect(isDraftSendable(complete)).toBe(true);
    expect(isDraftSendable({ ...complete, itemId: "" })).toBe(false);
    expect(isDraftSendable({ ...complete, username: "  " })).toBe(false);
    expect(isDraftSendable({ ...complete, password: "" })).toBe(false);
  });

  it("refuses an account the parser could not place", () => {
    // Sending this would be a guess about which game it belongs to.
    expect(isDraftSendable({ ...complete, needsMapping: true })).toBe(false);
  });

  it("decides the status a saved draft carries", () => {
    expect(draftStatus(complete)).toBe("ready");
    expect(draftStatus({ ...complete, password: "" })).toBe("draft");
  });
});

describe("summarizeDeliveryProgress", () => {
  it("counts a line as prepared once it has been sent", () => {
    const progress = summarizeDeliveryProgress([
      { status: "completed" },
      { status: "otp_sent" },
      { status: "ready" },
      { status: "draft" },
    ]);
    expect(progress).toMatchObject({ total: 4, delivered: 2, completed: 1, outstanding: 2 });
    expect(progress.label).toBe("تم تجهيز 2 / 4");
  });

  it("counts against the order's line count, not the rows that happen to exist", () => {
    // Two of four games typed in so far: the other two still have to appear.
    const progress = summarizeDeliveryProgress([{ status: "sent" }, { status: "sent" }], 4);
    expect(progress.label).toBe("تم تجهيز 2 / 4");
    expect(progress.outstanding).toBe(2);
  });

  it("handles an order nothing has been prepared for", () => {
    expect(summarizeDeliveryProgress([], 3).label).toBe("تم تجهيز 0 / 3");
    expect(summarizeDeliveryProgress(null).label).toBe("تم تجهيز 0 / 0");
  });
});
