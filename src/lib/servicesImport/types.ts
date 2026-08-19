/**
 * Schema and parser types for Store Services templates:
 * 1. حلول المشاكل التقنية (Troubleshooting & Problem Solutions)
 * 2. تعليمات التسجيل والأدلة (Account Registration & Setup Instructions)
 * 3. الأسئلة الشائعة (FAQ)
 * 4. سياسة الشراء وحقوقك (Purchase Policy & Customer Rights)
 */

export type ServiceSectionType =
  | "troubleshooting"
  | "registration_guides"
  | "faq"
  | "purchase_policy"
  | "contact";

export interface ServiceTemplateField {
  key: string;
  labelAr: string;
  labelEn: string;
  descriptionAr?: string;
  required?: boolean;
  type?: "string" | "multiline" | "number" | "boolean" | "array";
  example?: string;
}

export interface ServiceTemplateSchema {
  id: ServiceSectionType;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  templateFileName: string;
  fields: ServiceTemplateField[];
}

export interface ParsedIssue {
  severity: "error" | "warning";
  field: string;
  messageAr: string;
  messageEn: string;
}

export interface TroubleshootingItem {
  id: string;
  title: string;
  category?: string;
  description: string;
  errorCodes?: string;
  keywords?: string;
  ask?: string;
  imageUrl?: string;
  steps: string[];
}

export interface GuideStepItem {
  id: string;
  title_ar: string;
  title_en?: string;
  description_ar: string;
  description_en?: string;
  image?: string;
  video?: string;
  note_ar?: string;
  warning_ar?: string;
  sort_order: number;
}

export interface RegistrationGuideItem {
  id: string;
  title_ar: string;
  title_en?: string;
  slug?: string;
  category: string;
  description_ar: string;
  description_en?: string;
  cover_image?: string;
  video_url?: string;
  estimated_time?: string;
  difficulty?: string;
  sort_order: number;
  published: boolean;
  steps: GuideStepItem[];
}

export interface FaqParsedCategory {
  id: string;
  name_ar: string;
  name_en?: string;
  sort_order: number;
  published: boolean;
}

export interface FaqParsedItem {
  id: string;
  category_id: string;
  question_ar: string;
  question_en?: string;
  answer_ar: string;
  answer_en?: string;
  keywords?: string;
  featured: boolean;
  published: boolean;
  sort_order: number;
}

export interface FaqParseResultData {
  categories: FaqParsedCategory[];
  faqs: FaqParsedItem[];
}

export interface PolicyParsedSection {
  id: string;
  title_ar: string;
  title_en?: string;
  body_ar: string;
  body_en?: string;
  highlight: boolean;
  sort_order: number;
}

export interface PolicyParseResultData {
  title_ar: string;
  title_en?: string;
  subtitle_ar: string;
  subtitle_en?: string;
  version: string;
  effective_date: string;
  important_notices: string;
  contact_note: string;
  sections: PolicyParsedSection[];
}

export interface ContactChannelItem {
  id: string;
  type: string;
  label_ar: string;
  label_en?: string;
  value: string;
  href: string;
  icon?: string;
  availability?: string;
  sort_order: number;
  active: boolean;
}

export interface ContactServiceItem {
  id: string;
  title_ar: string;
  title_en?: string;
  description_ar: string;
  description_en?: string;
  icon?: string;
  link?: string;
  button_label_ar?: string;
  sort_order: number;
  active: boolean;
}

export interface ContactParseResultData {
  hero_title_ar: string;
  hero_title_en?: string;
  hero_subtitle_ar: string;
  hero_subtitle_en?: string;
  support_intro_ar: string;
  support_intro_en?: string;
  email: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  chat_link: string;
  status_message_ar: string;
  status_message_en?: string;
  emergency_notice_ar?: string;
  working_hours_ar: string;
  working_hours_en?: string;
  channels: ContactChannelItem[];
  services: ContactServiceItem[];
}

export interface ServiceParseResult<T = any> {
  schemaType: ServiceSectionType;
  success: boolean;
  rawText: string;
  data: T;
  issues: ParsedIssue[];
  stats: {
    totalItems: number;
    totalFieldsDetected: number;
    totalSectionsOrSteps: number;
    hasErrors: boolean;
  };
}
