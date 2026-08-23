import { describe, expect, it } from "vitest";

import {
  allExpectedDeliveryItemsDelivered,
  autoCompleteAtFromLastOtp,
  calculateDeliveryProgress,
  deliveryDraftStatus,
  nextReadyDeliveryItemId,
} from "./digital-delivery-state";

describe("digital delivery state machine", () => {
  it("persists a single account as draft then ready without treating it as delivered", () => {
    expect(deliveryDraftStatus("user-one", "")).toBe("draft");
    expect(deliveryDraftStatus("user-one", "pass-one")).toBe("ready");
    expect(
      calculateDeliveryProgress([
        { id: "delivery-1", orderItemId: "item-1", status: "ready" },
      ]),
    ).toEqual({
      total: 1,
      prepared: 1,
      delivered: 0,
      needsMapping: 0,
      drafts: 0,
    });
  });

  it("counts four independent games and advances only to another ready item", () => {
    const items = [
      { id: "d1", orderItemId: "i1", status: "sent" as const },
      { id: "d2", orderItemId: "i2", status: "ready" as const },
      { id: "d3", orderItemId: "i3", status: "draft" as const },
      { id: "d4", orderItemId: "i4", status: "ready" as const },
    ];
    expect(calculateDeliveryProgress(items)).toEqual({
      total: 4,
      prepared: 3,
      delivered: 1,
      needsMapping: 0,
      drafts: 1,
    });
    expect(nextReadyDeliveryItemId(items, "d1")).toBe("d2");
    expect(nextReadyDeliveryItemId(items, "d2")).toBe("d4");
  });

  it("does not finish while any slot or manual mapping remains", () => {
    expect(
      allExpectedDeliveryItemsDelivered([
        { id: "d1", orderItemId: "i1", status: "otp_sent" },
        { id: "d2", orderItemId: "i2", status: "sent" },
      ]),
    ).toBe(false);
    expect(
      allExpectedDeliveryItemsDelivered([
        { id: "d1", orderItemId: "i1", status: "otp_sent" },
        { id: "unknown", orderItemId: null, status: "needs_mapping" },
      ]),
    ).toBe(false);
    expect(
      allExpectedDeliveryItemsDelivered([
        { id: "d1", orderItemId: "i1", status: "otp_sent" },
        { id: "d2", orderItemId: "i2", status: "completed" },
      ]),
    ).toBe(true);
  });

  it("shows a sent account as delivered without treating the order as complete", () => {
    const items = [
      { id: "d1", orderItemId: "i1", status: "sent" as const },
      { id: "d2", orderItemId: "i2", status: "ready" as const },
    ];
    expect(calculateDeliveryProgress(items).delivered).toBe(1);
    expect(allExpectedDeliveryItemsDelivered(items)).toBe(false);
  });

  it("computes the server deadline at exactly 60 minutes after the final OTP", () => {
    expect(autoCompleteAtFromLastOtp("2026-08-23T12:00:00.000Z")).toBe(
      "2026-08-23T13:00:00.000Z",
    );
  });
});
