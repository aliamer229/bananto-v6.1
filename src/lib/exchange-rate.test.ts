import { describe, expect, it } from "vitest";

import { DEFAULT_USD_IQD_RATE, normalizeUsdIqdRate, usdToIqd } from "./exchange-rate.server";

/**
 * The wallet is denominated in IQD. A Binance top-up arrives in USDT, so the
 * conversion is the only thing standing between "deposited $10" and "credited
 * 10 IQD" — which is exactly what the code did before the rate was applied.
 */
describe("normalizeUsdIqdRate", () => {
  it("keeps a sane configured rate", () => {
    expect(normalizeUsdIqdRate(1320)).toBe(1320);
    expect(normalizeUsdIqdRate("1500")).toBe(1500);
  });

  it("falls back rather than trusting a missing or absurd rate", () => {
    for (const bad of [undefined, null, "", "abc", 0, -1320, NaN, Infinity, 5, 1_000_000]) {
      expect(normalizeUsdIqdRate(bad)).toBe(DEFAULT_USD_IQD_RATE);
    }
  });
});

describe("usdToIqd", () => {
  it("converts at the configured rate", () => {
    expect(usdToIqd(10, 1320)).toBe(13_200);
    expect(usdToIqd(1, 1320)).toBe(1_320);
    expect(usdToIqd(25.5, 1320)).toBe(33_660);
  });

  it("rounds down, so a fractional amount never credits more than it is worth", () => {
    expect(usdToIqd(0.0001, 1320)).toBe(0);
    expect(usdToIqd(1.9999, 1320)).toBe(2639);
  });

  it("refuses non-positive and malformed amounts", () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(usdToIqd(bad, 1320)).toBe(0);
    }
  });

  it("applies the rate guardrail to the amount path too", () => {
    // An absurd stored rate must not mint balance.
    expect(usdToIqd(10, -1)).toBe(10 * DEFAULT_USD_IQD_RATE);
  });
});
