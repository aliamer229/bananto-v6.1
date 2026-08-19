export type BinanceTopUpIntentStatus =
  "pending" | "verifying" | "credited" | "expired" | "cancelled" | "failed";

export interface BinanceTopUpIntent {
  id: string;
  user_id: string;
  expected_amount_atomic: number;
  currency: string;
  status: BinanceTopUpIntentStatus;
  bound_transaction_id: string | null;
  verify_attempts: number;
  last_verify_at: number | null;
  verify_started_at: number | null;
  created_at: number; // epoch ms
  expires_at: number; // epoch ms
  credited_at: number | null; // epoch ms
}

export interface BinanceTopUpRecord {
  id: string;
  intent_id: string;
  user_id: string;
  binance_transaction_id: string;
  amount_atomic: number;
  currency: string;
  transaction_time: number; // epoch ms
  order_type: string | null;
  status: string;
  created_at: number; // epoch ms
  credited_at: number; // epoch ms
}

export interface BinanceVerificationLog {
  id: string;
  request_id: string;
  user_id: string;
  intent_id: string | null;
  masked_tx_id: string | null;
  result: string;
  attempt_number: number;
  upstream_status: number | null;
  rejection_code: string | null;
  client_ip_hash: string | null;
  created_at: number;
}

export interface BinancePayFundsDetail {
  currency: string;
  amount: string;
}

export interface BinancePayPayerInfo {
  name?: string;
  type?: string;
  email?: string;
  binanceId?: string;
  accountId?: string;
}

export interface BinancePayReceiverInfo {
  name?: string;
  type?: string;
  email?: string;
  binanceId?: string;
  accountId?: string;
}

export interface BinancePayTransaction {
  orderType: string;
  transactionId: string;
  transactionTime: number; // epoch ms
  amount: string;
  currency: string;
  walletType?: number;
  fundsDetail?: BinancePayFundsDetail[];
  payerInfo?: BinancePayPayerInfo;
  receiverInfo?: BinancePayReceiverInfo;
  orderStatus?: string;
  status?: string;
  transactionType?: string;
}

export interface BinancePayApiResponse {
  code: string;
  message?: string;
  data?: BinancePayTransaction[];
  success?: boolean;
}

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  receiverId: string;
  allowedAsset: string;
  topupEnabled: boolean;
  isConfigured: boolean;
  intentTtlMs: number;
  lockTtlMs: number;
  maxVerifyAttempts: number;
  maxTransactionAgeMs: number;
}

export type BinanceVerifyErrorCode =
  | "BINANCE_TOPUP_DISABLED"
  | "BINANCE_TOPUP_UNAVAILABLE"
  | "INTENT_NOT_FOUND"
  | "TOPUP_EXPIRED"
  | "TOPUP_ALREADY_CREDITED"
  | "TOPUP_FAILED"
  | "VERIFICATION_IN_PROGRESS"
  | "TOO_MANY_ATTEMPTS"
  | "COOLDOWN_ACTIVE"
  | "INVALID_TRANSACTION_ID"
  | "TRANSACTION_ALREADY_USED"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_NOT_VALID_FOR_THIS_TOPUP"
  | "VERIFICATION_TEMPORARILY_UNAVAILABLE"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "INVALID_AMOUNT"
  | "TURNSTILE_REQUIRED"
  | "UNAUTHORIZED";
