import { describe, it, expect } from "vitest";
import {
  parseUsdtToAtomic,
  atomicToUsdtString,
  atomicToUsdtNumber,
  isValidUsdtAmountString,
  compareAtomic,
  addAtomic,
  subAtomic,
} from "./decimal";

describe("Binance Pay Decimal Utilities", () => {
  it("converts standard USDT amounts to 6-decimal atomic units without floating-point error", () => {
    expect(parseUsdtToAtomic("1")).toBe(1_000_000);
    expect(parseUsdtToAtomic("1.00")).toBe(1_000_000);
    expect(parseUsdtToAtomic("0.000001")).toBe(1);
    expect(parseUsdtToAtomic("10.50")).toBe(10_500_000);
    expect(parseUsdtToAtomic("99.999999")).toBe(99_999_999);
    expect(parseUsdtToAtomic(25)).toBe(25_000_000);
    expect(parseUsdtToAtomic(0.1)).toBe(100_000);
  });

  it("throws on invalid inputs, negative numbers, or non-numeric strings", () => {
    expect(() => parseUsdtToAtomic("-5")).toThrow();
    expect(() => parseUsdtToAtomic("abc")).toThrow();
    expect(() => parseUsdtToAtomic("")).toThrow();
    expect(() => parseUsdtToAtomic(NaN)).toThrow();
    expect(() => parseUsdtToAtomic(Infinity)).toThrow();
    expect(() => parseUsdtToAtomic("1.1234567")).toThrow(); // exceeds 6 decimal places
  });

  it("converts atomic units back to exact USDT strings", () => {
    expect(atomicToUsdtString(1_000_000)).toBe("1.000000");
    expect(atomicToUsdtString(1)).toBe("0.000001");
    expect(atomicToUsdtString(10_500_000)).toBe("10.500000");
    expect(atomicToUsdtString(0)).toBe("0.000000");
  });

  it("converts atomic units to numbers accurately", () => {
    expect(atomicToUsdtNumber(1_000_000)).toBe(1);
    expect(atomicToUsdtNumber(10_500_000)).toBe(10.5);
    expect(atomicToUsdtNumber(500_000)).toBe(0.5);
  });

  it("validates USDT amount strings", () => {
    expect(isValidUsdtAmountString("10")).toBe(true);
    expect(isValidUsdtAmountString("10.50")).toBe(true);
    expect(isValidUsdtAmountString("0.000001")).toBe(true);
    expect(isValidUsdtAmountString("0.0000001")).toBe(false);
    expect(isValidUsdtAmountString("-1")).toBe(false);
    expect(isValidUsdtAmountString("10.0.0")).toBe(false);
  });

  it("performs safe atomic arithmetic", () => {
    expect(addAtomic(1_000_000, 500_000)).toBe(1_500_000);
    expect(subAtomic(1_500_000, 500_000)).toBe(1_000_000);
    expect(() => subAtomic(500_000, 1_000_000)).toThrow();
    expect(compareAtomic(1_000_000, 2_000_000)).toBe(-1);
    expect(compareAtomic(2_000_000, 1_000_000)).toBe(1);
    expect(compareAtomic(1_000_000, 1_000_000)).toBe(0);
  });
});
