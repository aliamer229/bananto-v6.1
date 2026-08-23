import { describe, expect, it } from "vitest";

import {
  DELIVERY_OTP_TTL_MINUTES,
  DELIVERY_OTP_TTL_MS,
  deliveryOtpExpiry,
  describeCodeValidity,
  isDeliveryOtpUsable,
} from "./delivery-otp";

const T0 = Date.parse("2026-08-23T10:00:00.000Z");

describe("delivery code lifetime", () => {
  it("is one hour", () => {
    expect(DELIVERY_OTP_TTL_MINUTES).toBe(60);
    expect(DELIVERY_OTP_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("stamps expiry sixty minutes after creation", () => {
    expect(deliveryOtpExpiry("2026-08-23T10:00:00.000Z")).toBe("2026-08-23T11:00:00.000Z");
    expect(deliveryOtpExpiry(T0)).toBe("2026-08-23T11:00:00.000Z");
    expect(deliveryOtpExpiry(new Date(T0))).toBe("2026-08-23T11:00:00.000Z");
  });

  it("falls back to now for an unreadable creation time", () => {
    const out = Date.parse(deliveryOtpExpiry("not-a-date"));
    expect(out).toBeGreaterThan(Date.now() + DELIVERY_OTP_TTL_MS - 5000);
  });
});

describe("describeCodeValidity", () => {
  it("reports the real remaining time, not a fixed label", () => {
    const expiresAt = deliveryOtpExpiry(T0);
    // Right after sending.
    expect(describeCodeValidity(expiresAt, T0)).toMatchObject({
      valid: true,
      remainingMinutes: 60,
      label: "صالح 1 ساعة",
    });
    // Half an hour later the card must say so — this is what a static
    // "صالح لمدة 60 دقيقة" got wrong.
    expect(describeCodeValidity(expiresAt, T0 + 30 * 60_000)).toMatchObject({
      valid: true,
      remainingMinutes: 30,
      label: "صالح 30 دقيقة",
    });
    expect(describeCodeValidity(expiresAt, T0 + 59 * 60_000)).toMatchObject({
      valid: true,
      remainingMinutes: 1,
    });
  });

  it("survives a refresh: the answer depends only on the absolute instant", () => {
    const expiresAt = deliveryOtpExpiry(T0);
    const beforeRefresh = describeCodeValidity(expiresAt, T0 + 20 * 60_000);
    // A "refresh" is simply asking again at the same wall-clock moment; a local
    // countdown would have restarted at 60 here.
    const afterRefresh = describeCodeValidity(expiresAt, T0 + 20 * 60_000);
    expect(afterRefresh).toEqual(beforeRefresh);
    expect(afterRefresh.remainingMinutes).toBe(40);
  });

  it("marks the code expired once the instant passes", () => {
    const expiresAt = deliveryOtpExpiry(T0);
    expect(describeCodeValidity(expiresAt, T0 + DELIVERY_OTP_TTL_MS)).toMatchObject({
      valid: false,
      remainingMs: 0,
      label: "انتهت صلاحية الكود",
    });
    expect(describeCodeValidity(expiresAt, T0 + DELIVERY_OTP_TTL_MS + 1)).toMatchObject({
      valid: false,
    });
    // Still expired an hour later, not wrapped around.
    expect(describeCodeValidity(expiresAt, T0 + 3 * DELIVERY_OTP_TTL_MS).valid).toBe(false);
  });

  it("states the lifetime rather than a countdown when no expiry was stamped", () => {
    for (const missing of [undefined, null, ""]) {
      const validity = describeCodeValidity(missing, T0);
      expect(validity.unknown).toBe(true);
      expect(validity.valid).toBe(true);
      expect(validity.label).toBe("صالح لمدة 60 دقيقة");
    }
    expect(describeCodeValidity("nonsense", T0).unknown).toBe(true);
  });
});

describe("isDeliveryOtpUsable", () => {
  it("accepts a live code and rejects a dead one", () => {
    const expiresAt = deliveryOtpExpiry(T0);
    expect(isDeliveryOtpUsable(expiresAt, T0 + 59 * 60_000)).toBe(true);
    expect(isDeliveryOtpUsable(expiresAt, T0 + 61 * 60_000)).toBe(false);
  });

  it("does not retroactively invalidate codes sent before expiries were stamped", () => {
    expect(isDeliveryOtpUsable(undefined, T0)).toBe(true);
    expect(isDeliveryOtpUsable(null, T0)).toBe(true);
  });
});
