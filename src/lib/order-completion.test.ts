import { describe, expect, it } from "vitest";

import {
  AUTO_COMPLETE_AFTER_MINUTES,
  autoCompleteAt,
  isAutoCompleteDue,
  lastDeliveryAt,
  minutesUntilAutoComplete,
} from "./order-completion";

const T0 = Date.parse("2026-08-23T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * 60_000;

describe("lastDeliveryAt", () => {
  it("is the latest moment anything was handed over", () => {
    const items = [
      { id: "a", credsSentAt: iso(T0), verificationCodeSentAt: iso(T0 + 5 * 60_000) },
      { id: "b", credsSentAt: iso(T0 + 20 * 60_000) },
      { id: "c", deliveredAt: iso(T0 + 12 * 60_000) },
    ];
    expect(lastDeliveryAt(items)).toBe(iso(T0 + 20 * 60_000));
  });

  it("is null when nothing has gone out, not the epoch", () => {
    expect(lastDeliveryAt([{ id: "a" }])).toBeNull();
    expect(lastDeliveryAt([])).toBeNull();
    expect(lastDeliveryAt(null)).toBeNull();
  });

  it("ignores unparseable timestamps", () => {
    expect(lastDeliveryAt([{ id: "a", credsSentAt: "not a date" }])).toBeNull();
  });
});

describe("autoCompleteAt", () => {
  it("is one hour after the last delivery", () => {
    expect(autoCompleteAt(iso(T0))).toBe(iso(T0 + HOUR));
    expect(AUTO_COMPLETE_AFTER_MINUTES).toBe(60);
  });

  it("does not exist before anything is delivered", () => {
    expect(autoCompleteAt(null)).toBeNull();
  });
});

describe("isAutoCompleteDue", () => {
  const delivered = (at: number) => [{ id: "a", verificationCodeSentAt: iso(at) }];

  it("waits the full hour from the last delivery", () => {
    const order = { status: "awaiting_customer_confirmation", items: delivered(T0) };
    expect(isAutoCompleteDue(order, T0 + 59 * 60_000)).toEqual({
      due: false,
      reason: "waiting",
      at: iso(T0 + HOUR),
    });
    expect(isAutoCompleteDue(order, T0 + HOUR)).toEqual({ due: true, at: iso(T0 + HOUR) });
  });

  it("runs the hour from the LAST code, not the first", () => {
    /*
      The old rule started the clock at `deliveryViewedAt` — the moment the
      customer opened the card to read the first account — so a four-game order
      could complete itself before its last code had even been sent.
    */
    const order = {
      status: "awaiting_customer_confirmation",
      items: [
        { id: "a", verificationCodeSentAt: iso(T0) },
        { id: "b", verificationCodeSentAt: iso(T0 + 40 * 60_000) },
      ],
    };
    expect(isAutoCompleteDue(order, T0 + HOUR).due).toBe(false);
    expect(isAutoCompleteDue(order, T0 + 40 * 60_000 + HOUR).due).toBe(true);
  });

  it("never fires while the customer has something open", () => {
    const order = {
      status: "awaiting_customer_confirmation",
      items: delivered(T0),
      hasOpenIssue: true,
    };
    const decision = isAutoCompleteDue(order, T0 + 5 * HOUR);
    expect(decision).toEqual({ due: false, reason: "open_issue", at: iso(T0 + HOUR) });
  });

  it("resumes once the issue is closed", () => {
    const order = { status: "awaiting_customer_confirmation", items: delivered(T0) };
    expect(isAutoCompleteDue({ ...order, hasOpenIssue: true }, T0 + 5 * HOUR).due).toBe(false);
    expect(isAutoCompleteDue({ ...order, hasOpenIssue: false }, T0 + 5 * HOUR).due).toBe(true);
  });

  it("does nothing to an order that is already finished", () => {
    for (const status of ["completed", "cancelled"]) {
      expect(isAutoCompleteDue({ status, items: delivered(T0) }, T0 + 5 * HOUR)).toEqual({
        due: false,
        reason: "already_final",
      });
    }
  });

  it("does not start a clock for an order nothing has been sent on", () => {
    expect(
      isAutoCompleteDue({ status: "processing", items: [{ id: "a" }] }, T0 + 5 * HOUR),
    ).toEqual({ due: false, reason: "nothing_delivered" });
  });

  it("prefers the stamped deadline over re-deriving it", () => {
    const order = {
      status: "awaiting_customer_confirmation",
      items: delivered(T0),
      lastOtpSentAt: iso(T0 + 30 * 60_000),
      autoCompleteAt: iso(T0 + 30 * 60_000 + HOUR),
    };
    expect(isAutoCompleteDue(order, T0 + HOUR).due).toBe(false);
    expect(isAutoCompleteDue(order, T0 + 30 * 60_000 + HOUR).due).toBe(true);
  });
});

describe("minutesUntilAutoComplete", () => {
  it("counts down and stops at zero", () => {
    expect(minutesUntilAutoComplete(iso(T0 + HOUR), T0)).toBe(60);
    expect(minutesUntilAutoComplete(iso(T0 + HOUR), T0 + 30 * 60_000)).toBe(30);
    expect(minutesUntilAutoComplete(iso(T0 + HOUR), T0 + 2 * HOUR)).toBe(0);
    expect(minutesUntilAutoComplete(null)).toBeNull();
  });
});
