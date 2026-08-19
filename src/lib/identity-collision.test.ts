import { describe, it, expect } from "vitest";
import { normalizePhone, arePhonesEqual } from "./phone";

describe("Identity Collision Protection", () => {
  it("should distinguish between different country phones with same suffix", () => {
    // Iraq suffix 7701234567
    const iraq = normalizePhone("7701234567", "964"); // +9647701234567
    // Generic suffix 7701234567 with different dial code
    const uae = normalizePhone("501234567", "971"); // +971501234567

    expect(iraq).toBe("+9647701234567");
    expect(uae).toBe("+971501234567");
    expect(arePhonesEqual(iraq, uae)).toBe(false);
  });

  it("should NOT match suffix during equality check", () => {
    const full = "+9647701234567";
    const suffix = "7701234567";

    // arePhonesEqual uses normalizePhone on both, so suffix will be normalized with default dial code
    expect(arePhonesEqual(full, suffix)).toBe(true); // Both result in +9647701234567 if default is 964

    const otherCountry = "+9717701234567";
    expect(arePhonesEqual(full, otherCountry)).toBe(false);
  });
});
