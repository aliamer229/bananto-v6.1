import type { Thread, ChatMessage, ThreadMode, Order } from "@/lib/types";

export type InboxFilter =
  | "digital_queue"
  | "open_tickets"
  | "queue"
  | "all"
  | "needs_reply"
  | "active_chats"
  | "active_orders"
  | "active_tickets"
  | "order_preparation"
  | "waiting_user"
  | "waiting_admin"
  | "escalated"
  | "completed_orders"
  | "closed_tickets";

export interface FilterOption {
  id: InboxFilter;
  label: string;
  countKey?: string;
  icon?: string;
  badgeColor?: string;
}

export interface QuickReply {
  id: string;
  title: string;
  text: string;
  category: "greeting" | "prep" | "done" | "request_info" | "troubleshoot" | "closing";
}

export interface AccountCredentialsPayload {
  platform?: string;
  email: string;
  password: string;
  backupCodes?: string;
  notes?: string;
}

export interface VerificationCodePayload {
  code: string;
  service?: string;
  expiresInMinutes?: number;
}

export interface InstructionsPayload {
  title: string;
  text: string;
  steps?: string[];
}
