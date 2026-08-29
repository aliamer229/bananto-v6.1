import { describe, expect, it } from "vitest";

import {
  DEFAULT_USED_CONFIG,
  allowedTransitions,
  canTransition,
  expiryFrom,
  feeIsDue,
  readUsedConfig,
  validateForSubmission,
} from "./used-marketplace";

/**
 * The marketplace rules, tested without a database.
 *
 * These are the properties that decide whether a seller is charged, whether a
 * listing can reach a customer, and who is allowed to move it — everything that
 * would be expensive to get wrong and cheap to pin here.
 */

const complete = {
  title: "Nintendo Switch OLED",
  usedType: "console" as const,
  conditionGrade: "very_good" as const,
  priceIqd: 250_000,
  quantity: 1,
  conditionNotes: "خدش بسيط على الظهر ولا توجد مشاكل في الشاشة",
  photos: ["/api/files/uploads/usr_a/one.webp"],
};

describe("the state machine", () => {
  it("lets only an admin approve, and only from a reviewable status", () => {
    expect(canTransition("SUBMITTED", "APPROVED", "admin")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "APPROVED", "admin")).toBe(true);
    expect(canTransition("SUBMITTED", "APPROVED", "seller")).toBe(false);
    expect(canTransition("DRAFT", "APPROVED", "admin")).toBe(false);
  });

  it("refuses every move out of a terminal status", () => {
    for (const actor of ["seller", "admin", "system"] as const) {
      expect(allowedTransitions("REJECTED", actor)).toEqual([]);
      expect(allowedTransitions("SOLD", actor)).toEqual([]);
    }
  });

  it("lets a seller pause and resume their own published listing", () => {
    expect(canTransition("APPROVED", "PAUSED", "seller")).toBe(true);
    expect(canTransition("PAUSED", "APPROVED", "seller")).toBe(true);
  });

  it("does not let a seller mark their own listing sold", () => {
    expect(canTransition("APPROVED", "SOLD", "seller")).toBe(false);
    expect(canTransition("APPROVED", "SOLD", "admin")).toBe(true);
  });

  it("sends an expired listing back to draft rather than straight to review", () => {
    expect(allowedTransitions("EXPIRED", "seller")).toEqual(["DRAFT"]);
  });
});

describe("the listing fee", () => {
  it("is due on a first submission", () => {
    expect(feeIsDue("DRAFT", "SUBMITTED", { feePaidForCycle: false })).toBe(true);
  });

  it("is not charged twice for one publication window", () => {
    // A listing sent back for changes and resubmitted has already paid.
    expect(feeIsDue("NEEDS_CHANGES", "SUBMITTED", { feePaidForCycle: true })).toBe(false);
    expect(feeIsDue("DRAFT", "SUBMITTED", { feePaidForCycle: true })).toBe(false);
  });

  it("is not due on any move that is not a submission", () => {
    expect(feeIsDue("SUBMITTED", "APPROVED", { feePaidForCycle: false })).toBe(false);
    expect(feeIsDue("APPROVED", "SOLD", { feePaidForCycle: false })).toBe(false);
  });
});

describe("the config", () => {
  it("defaults to 1,000 IQD for 7 days", () => {
    expect(DEFAULT_USED_CONFIG.listingFeeIqd).toBe(1000);
    expect(DEFAULT_USED_CONFIG.listingDurationDays).toBe(7);
  });

  it("takes admin overrides", () => {
    const config = readUsedConfig({ listingFeeIqd: 2500, listingDurationDays: 14 });
    expect(config.listingFeeIqd).toBe(2500);
    expect(config.listingDurationDays).toBe(14);
  });

  it("falls back per field rather than discarding the whole document", () => {
    const config = readUsedConfig({ listingFeeIqd: "not a number", maxPhotos: 3 });
    expect(config.listingFeeIqd).toBe(DEFAULT_USED_CONFIG.listingFeeIqd);
    expect(config.maxPhotos).toBe(3);
  });

  it("refuses an inverted price band instead of rejecting every price", () => {
    const config = readUsedConfig({ minPriceIqd: 900_000, maxPriceIqd: 1000 });
    expect(config.minPriceIqd).toBe(DEFAULT_USED_CONFIG.minPriceIqd);
    expect(config.maxPriceIqd).toBe(DEFAULT_USED_CONFIG.maxPriceIqd);
  });

  it("keeps a zero fee, which is a real choice and not a missing value", () => {
    expect(readUsedConfig({ listingFeeIqd: 0 }).listingFeeIqd).toBe(0);
  });
});

describe("submission validation", () => {
  it("accepts a complete listing", () => {
    expect(validateForSubmission(complete, DEFAULT_USED_CONFIG)).toEqual([]);
  });

  it("requires an honest condition note", () => {
    const issues = validateForSubmission(
      { ...complete, conditionNotes: "جيدة" },
      DEFAULT_USED_CONFIG,
    );
    expect(issues.map((i) => i.field)).toContain("conditionNotes");
  });

  it("requires at least one photo", () => {
    const issues = validateForSubmission({ ...complete, photos: [] }, DEFAULT_USED_CONFIG);
    expect(issues.map((i) => i.field)).toContain("photos");
  });

  it("holds the price inside the admin band", () => {
    const low = validateForSubmission({ ...complete, priceIqd: 10 }, DEFAULT_USED_CONFIG);
    expect(low.map((i) => i.field)).toContain("priceIqd");
    const high = validateForSubmission({ ...complete, priceIqd: 9e9 }, DEFAULT_USED_CONFIG);
    expect(high.map((i) => i.field)).toContain("priceIqd");
  });

  it("rejects a condition grade that is not in the vocabulary", () => {
    const issues = validateForSubmission(
      { ...complete, conditionGrade: "mint" },
      DEFAULT_USED_CONFIG,
    );
    expect(issues.map((i) => i.field)).toContain("conditionGrade");
  });

  it("reports every problem at once so the seller fixes the form in one pass", () => {
    const issues = validateForSubmission({}, DEFAULT_USED_CONFIG);
    expect(issues.length).toBeGreaterThan(4);
  });
});

describe("expiry", () => {
  it("is the publication moment plus the configured window", () => {
    expect(expiryFrom("2026-08-29T00:00:00.000Z", 7)).toBe("2026-09-05T00:00:00.000Z");
  });

  it("refuses a publication timestamp it cannot read", () => {
    expect(() => expiryFrom("not a date", 7)).toThrow("invalid_published_at");
  });
});
