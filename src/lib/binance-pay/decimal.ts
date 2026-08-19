/**
 * Exact decimal arithmetic for USDT and fiat conversion.
 * Avoids JavaScript floating-point errors by using integer atomic units.
 *
 * 1 USDT = 1,000,000 atomic units (6 decimal places / micro-USDT).
 */

export const USDT_ATOMIC_SCALE = 1_000_000;
export const USDT_DECIMALS = 6;

/**
 * Safely parses a string or number representation of USDT into an exact integer atomic unit.
 * Throws a descriptive error if the value is zero, negative, malformed, non-finite, or exceeds supported precision.
 */
export function parseUsdtToAtomic(value: string | number): number {
  if (value === null || value === undefined) {
    throw new Error("AMOUNT_NULL_OR_UNDEFINED");
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || isNaN(value) || value <= 0) {
      throw new Error(`INVALID_NUMBER: "${value}"`);
    }
    // Format float with safe precision up to 6 decimals
    const fixed = value.toFixed(6);
    return parseUsdtToAtomic(fixed);
  }

  const raw = String(value).trim();
  if (!raw) {
    throw new Error("AMOUNT_EMPTY");
  }

  // Defensive length limit
  if (raw.length > 30) {
    throw new Error("AMOUNT_TOO_LONG");
  }

  // Reject scientific notation, negative numbers, hex, leading plus, multiple dots, etc.
  // Requires standard format like "10", "10.5", "0.25", "1000.123456"
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(raw)) {
    throw new Error(`INVALID_AMOUNT_FORMAT: "${raw}"`);
  }

  const [wholePart = "0", fracPart = ""] = raw.split(".");
  const wholeBig = BigInt(wholePart);

  // If fraction has more than 6 digits, reject excess precision
  if (fracPart.length > USDT_DECIMALS) {
    throw new Error(`INVALID_AMOUNT_PRECISION: excess decimal digits in "${raw}"`);
  }

  // Pad fraction to 6 digits
  const paddedFrac = fracPart.padEnd(USDT_DECIMALS, "0");
  const fracBig = BigInt(paddedFrac);

  const atomicBig = wholeBig * BigInt(USDT_ATOMIC_SCALE) + fracBig;

  if (atomicBig <= 0n) {
    throw new Error("AMOUNT_MUST_BE_POSITIVE");
  }

  if (atomicBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("AMOUNT_OVERFLOW");
  }

  return Number(atomicBig);
}

/**
 * Formats an atomic integer amount back to a clean USDT string representation.
 * Example: 10000000 -> "10", 10500000 -> "10.5", 10123456 -> "10.123456"
 */
export function formatAtomicToUsdt(atomic: number): string {
  if (!Number.isSafeInteger(atomic) || atomic < 0) {
    throw new Error("INVALID_ATOMIC_UNITS");
  }

  const whole = Math.floor(atomic / USDT_ATOMIC_SCALE);
  const frac = atomic % USDT_ATOMIC_SCALE;

  if (frac === 0) {
    return String(whole);
  }

  const fracStr = String(frac).padStart(USDT_DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/**
 * Formats atomic units back to exact 6-decimal USDT strings (e.g. 1000000 -> "1.000000").
 */
export function atomicToUsdtString(atomic: number): string {
  if (!Number.isSafeInteger(atomic) || atomic < 0) {
    throw new Error("INVALID_ATOMIC_UNITS");
  }

  const whole = Math.floor(atomic / USDT_ATOMIC_SCALE);
  const frac = atomic % USDT_ATOMIC_SCALE;
  const fracStr = String(frac).padStart(USDT_DECIMALS, "0");
  return `${whole}.${fracStr}`;
}

/**
 * Converts atomic integer units to number.
 */
export function atomicToUsdtNumber(atomic: number): number {
  if (!Number.isSafeInteger(atomic) || atomic < 0) {
    throw new Error("INVALID_ATOMIC_UNITS");
  }
  return atomic / USDT_ATOMIC_SCALE;
}

/**
 * Quick validation helper for strictly positive USDT amounts.
 */
export function isValidAmountString(val: string): boolean {
  try {
    const atomic = parseUsdtToAtomic(val);
    return atomic > 0;
  } catch {
    return false;
  }
}

export function isValidUsdtAmountString(val: string): boolean {
  return isValidAmountString(val);
}

export function addAtomic(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error("ATOMIC_OVERFLOW");
  return sum;
}

export function subAtomic(a: number, b: number): number {
  if (a < b) throw new Error("ATOMIC_UNDERFLOW");
  return a - b;
}

export function compareAtomic(a: number, b: number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
