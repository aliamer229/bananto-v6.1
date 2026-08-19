export interface WhatsAppSendResult {
  success: boolean;
  status: number;
  messageId?: string;
  error?: string;
  errorCode?:
    | "WASENDER_UNAVAILABLE"
    | "WASENDER_AUTH_FAILED"
    | "WASENDER_RATE_LIMITED"
    | "WASENDER_SEND_FAILED"
    | "WASENDER_TIMEOUT"
    | "WASENDER_NOT_CONFIGURED"
    | "INVALID_PHONE";
  raw?: unknown;
}

export interface WhatsAppProvider {
  sendMessage(to: string, text: string): Promise<WhatsAppSendResult>;
}

export interface WaSenderConfigStatus {
  provider: "wasender";
  configured: boolean;
  sessionApiKeyPresent: boolean;
}
