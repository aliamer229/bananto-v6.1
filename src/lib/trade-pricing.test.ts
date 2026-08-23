import { describe, expect, it } from "vitest";

import {
  initialTradeStatus,
  normalizeTradePricingMode,
  normalizeTradeStatus,
  tradePrimaryAction,
  TRADE_MAIN_FLOW,
  TRADE_STATUS_LABEL_AR,
  TRADE_STATUSES,
} from "./trade-calc";
import { customerFacingPrice, formatIqd, readTradePricing } from "./trade-pricing";

describe("pricing mode", () => {
  it("is auto unless the row says manual", () => {
    expect(normalizeTradePricingMode("manual")).toBe("manual");
    expect(normalizeTradePricingMode("MANUAL")).toBe("manual");
    expect(normalizeTradePricingMode("auto")).toBe("auto");
    expect(normalizeTradePricingMode(null)).toBe("auto");
    expect(normalizeTradePricingMode(undefined)).toBe("auto");
    expect(normalizeTradePricingMode("nonsense")).toBe("auto");
  });

  it("starts each flow where its spec says", () => {
    // Auto: an estimate exists at submission, so the admin's first job is review.
    expect(initialTradeStatus("auto")).toBe("priced");
    // Manual: nothing has been priced yet.
    expect(initialTradeStatus("manual")).toBe("awaiting_pricing");
  });
});

describe("readTradePricing", () => {
  it("keeps the estimate and the approved price apart", () => {
    const view = readTradePricing({
      status: "priced",
      pricing_mode: "auto",
      base_iqd: 20000,
      final_iqd: 15000,
      approved_iqd: null,
    });
    expect(view.estimateIqd).toBe(15000);
    expect(view.approvedIqd).toBeNull();
    expect(view.estimateLabel).toBe("15,000 د.ع");
    // An estimate is not a commitment, so the approved line stays a dash.
    expect(view.approvedLabel).toBe("—");
  });

  it("shows the approved price once an admin has committed to one", () => {
    const view = readTradePricing({
      status: "awaiting_customer_approval",
      pricing_mode: "auto",
      final_iqd: 15000,
      approved_iqd: 17500,
    });
    expect(view.estimateIqd).toBe(15000);
    expect(view.approvedIqd).toBe(17500);
    expect(view.approvedLabel).toBe("17,500 د.ع");
  });

  it("says a manual request is waiting for a person, not that it is unpriced", () => {
    const view = readTradePricing({
      status: "awaiting_pricing",
      pricing_mode: "manual",
      final_iqd: null,
      approved_iqd: null,
    });
    // This is the whole point: "غير مسعر" read as an error.
    expect(view.estimateLabel).toBe("بانتظار التسعير اليدوي");
    expect(view.needsManualPricing).toBe(true);
    expect(view.modeLabel).toBe("تسعير يدوي");
  });

  it("stops asking for manual pricing once a price is approved", () => {
    const view = readTradePricing({
      status: "priced",
      pricing_mode: "manual",
      final_iqd: null,
      approved_iqd: 9000,
    });
    expect(view.needsManualPricing).toBe(false);
    expect(view.approvedLabel).toBe("9,000 د.ع");
  });

  it("reads an admin number written before approved_iqd existed", () => {
    const view = readTradePricing({
      status: "inspecting",
      pricing_mode: "auto",
      final_iqd: 12000,
      approved_iqd: null,
      admin_valuation_iqd: 13000,
    });
    expect(view.approvedIqd).toBe(13000);
  });

  it("ignores zero and negative amounts rather than showing them as prices", () => {
    const view = readTradePricing({
      status: "awaiting_pricing",
      pricing_mode: "auto",
      final_iqd: 0,
      approved_iqd: -5,
    });
    expect(view.estimateIqd).toBeNull();
    expect(view.approvedIqd).toBeNull();
  });
});

describe("customerFacingPrice", () => {
  it("labels an estimate as an estimate", () => {
    const result = customerFacingPrice({ pricing_mode: "auto", final_iqd: 15000 });
    expect(result).toEqual({
      amountIqd: 15000,
      isApproved: false,
      label: "السعر التقريبي",
    });
  });

  it("prefers and labels the approved price once it exists", () => {
    const result = customerFacingPrice({
      pricing_mode: "auto",
      final_iqd: 15000,
      approved_iqd: 16000,
    });
    expect(result).toEqual({
      amountIqd: 16000,
      isApproved: true,
      label: "السعر النهائي المعتمد",
    });
  });
});

describe("formatIqd", () => {
  it("formats and rounds, and shows a dash for nothing", () => {
    expect(formatIqd(15000)).toBe("15,000 د.ع");
    expect(formatIqd(15000.6)).toBe("15,001 د.ع");
    expect(formatIqd(null)).toBe("—");
    expect(formatIqd(undefined)).toBe("—");
  });
});

describe("the status set stays small and unambiguous", () => {
  it("has exactly seven ordinary states plus two exceptions", () => {
    expect(TRADE_MAIN_FLOW).toHaveLength(7);
    expect(TRADE_STATUSES).toHaveLength(9);
    expect(TRADE_STATUSES).toContain("rejected");
    expect(TRADE_STATUSES).toContain("cancelled");
  });

  it("has no two states sharing a label", () => {
    const labels = TRADE_STATUSES.map((s) => TRADE_STATUS_LABEL_AR[s]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("no longer carries the retired duplicates", () => {
    for (const retired of [
      "waiting_review",
      "waiting_shipment",
      "received",
      "approved",
      "payout_pending",
      "payout_processing",
    ]) {
      expect(TRADE_STATUSES as readonly string[]).not.toContain(retired);
      // …but a row still holding one keeps working.
      expect(TRADE_STATUSES as readonly string[]).toContain(normalizeTradeStatus(retired));
    }
  });
});

describe("primary admin action", () => {
  it("offers exactly one next step per state, and none where the ball is elsewhere", () => {
    expect(tradePrimaryAction("awaiting_pricing")).toEqual({
      label: "تسعير ومراجعة",
      next: "priced",
    });
    expect(tradePrimaryAction("priced")).toEqual({
      label: "اعتماد السعر",
      next: "awaiting_customer_approval",
    });
    // Waiting on the customer: nothing for the admin to do.
    expect(tradePrimaryAction("awaiting_customer_approval")).toBeNull();
    expect(tradePrimaryAction("customer_approved")).toEqual({
      label: "بدء الاستلام",
      next: "awaiting_receipt",
    });
    expect(tradePrimaryAction("awaiting_receipt")).toEqual({
      label: "تأكيد الاستلام",
      next: "inspecting",
    });
    expect(tradePrimaryAction("inspecting")).toEqual({
      label: "إكمال المقايضة",
      next: "completed",
    });
    expect(tradePrimaryAction("completed")).toBeNull();
    expect(tradePrimaryAction("rejected")).toBeNull();
  });

  it("walks a whole request from submission to done, one action at a time", () => {
    // Manual flow: starts unpriced and needs every step.
    let status = initialTradeStatus("manual");
    expect(status).toBe("awaiting_pricing");
    const visited = [status];
    for (let guard = 0; guard < 10; guard++) {
      const action = tradePrimaryAction(status);
      if (!action) break;
      status = action.next;
      visited.push(status);
      // The customer's approval is not an admin action, so simulate it.
      if (status === "awaiting_customer_approval") {
        status = "customer_approved";
        visited.push(status);
      }
    }
    expect(visited).toEqual(TRADE_MAIN_FLOW);
    expect(status).toBe("completed");
  });

  it("an auto-priced request skips only the pricing step", () => {
    const status = initialTradeStatus("auto");
    expect(status).toBe("priced");
    expect(tradePrimaryAction(status)?.next).toBe("awaiting_customer_approval");
  });
});
