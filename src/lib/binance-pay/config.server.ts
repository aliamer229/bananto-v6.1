import { env } from "@/lib/env.server";
import type { BinanceConfig } from "./types";

export const ALLOWED_BINANCE_PAY_ORDER_TYPES = [
  "C2C",
  "PAY",
  "PAYMENT",
  "PAYMENT_RECEIVE",
  "TRANSFER",
  "COLLECTION",
  "MERCHANT_PAYMENT",
  "TRANSFER_RECEIVE",
  "RECEIVE",
  "DEPOSIT_RECHARGE",
];

export function getBinanceConfig(): BinanceConfig {
  const apiKey = (env("BINANCE_API_KEY") || "").trim();
  const apiSecret = (env("BINANCE_API_SECRET") || "").trim();
  const receiverId = (env("BINANCE_RECEIVER_ID") || "").trim();
  const allowedAsset = (env("BINANCE_ALLOWED_ASSET") || "USDT").trim().toUpperCase();

  // Strict normalization for kill switch: must explicitly be "true"
  const rawTopupEnabled = (env("BINANCE_TOPUP_ENABLED") || "").trim().toLowerCase();
  const topupEnabled = rawTopupEnabled === "true";

  const isConfigured = Boolean(apiKey && apiSecret && receiverId && allowedAsset);

  return {
    apiKey,
    apiSecret,
    receiverId,
    allowedAsset,
    topupEnabled: topupEnabled && isConfigured,
    isConfigured,
    intentTtlMs: 15 * 60 * 1000, // 15 minutes window
    lockTtlMs: 30 * 1000, // 30 seconds verification lock
    maxVerifyAttempts: 5,
    maxTransactionAgeMs: 20 * 60 * 1000, // 20 minutes max age
  };
}

/**
 * Returns true if Binance API credentials and environment bindings are fully provisioned.
 */
export function isBinanceConfigured(): boolean {
  const config = getBinanceConfig();
  return config.isConfigured;
}

/**
 * Returns public parameters safe to expose to clients (never secrets or API keys).
 */
export function getPublicBinanceConfig() {
  const config = getBinanceConfig();
  return {
    enabled: config.topupEnabled,
    asset: config.allowedAsset,
    receiverId: config.receiverId,
    intentTtlMinutes: 15,
  };
}
