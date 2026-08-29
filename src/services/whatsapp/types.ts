export interface WhatsAppSendResult {
  success: boolean;
  status?: number;
  messageId?: string;
  errorCode?: string;
  error?: string;
}

export interface WaSenderConfigStatus {
  configured: boolean;
  sessionApiKeyPresent: boolean;
  provider: string;
}
