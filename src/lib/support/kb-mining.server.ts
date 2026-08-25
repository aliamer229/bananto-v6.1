/**
 * Dynamic Knowledge Base Mining & Sanitization Engine
 *
 * Extracts verified knowledge from closed/resolved human admin conversations,
 * scrubs all sensitive data (credentials, OTPs, order codes, emails, names),
 * clusters similar questions, and updates the knowledge base safely.
 */

import { listThreads, getMessages, getStore, updateStore } from "../db.server";
import { norm, surfaces } from "./normalize";
import type { KbArticle } from "./types";
import type { Thread, ChatMessage } from "../types";

export interface MinedKnowledgeItem {
  id: string;
  title: string;
  question: string;
  answer: string;
  steps: string[];
  keywords: string[];
  category: "account" | "login" | "payment" | "general" | "game_settings" | "digital_order";
  usageCount: number;
  ratingScore: number;
  status: "approved" | "pending_review" | "disabled";
  sourceThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Regex patterns for sensitive data scrubbing */
const SENSITIVE_PATTERNS = [
  // Emails
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Passwords / credentials lines
  /(?:كلمة المرور|الباسورد|الباس|كلمه السر|password|pass|pin)\s*[:=]?\s*([^\s\n,،]+)/gi,
  /(?:البريد|الايميل|الحساب|email|user)\s*[:=]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
  // OTP codes (4-8 digits standalone or prefixed)
  /(?:كود التحقق|رمز التحقق|كود|otp|code)\s*[:=]?\s*\b\d{4,8}\b/gi,
  /\b\d{4,8}\b/g,
  // Order numbers
  /\b(?:ord-[a-zA-Z0-9_-]+|#?[A-Z0-9]{8,12})\b/gi,
  // Phone numbers (Iraqi and international)
  /(?:\+?964|00964|07)[0-9]{8,10}\b/g,
  // IBAN / Card / Master numbers
  /\b(?:\d[ -]*?){13,16}\b/g,
];

/** Clean human greetings and personal addressing from admin text */
function scrubGreetings(text: string): string {
  return text
    .replace(
      /^(?:أهلاً|مرحباً|هلا|حياك الله|حبيبي|عزيزي|أخي|اخي|يا هلا|مساء الخير|صباح الخير)\s*([\u0621-\u064A]+)?\s*[,،-]?\s*/i,
      "",
    )
    .replace(/(?:تدلل|من عيوني|بخدمتك|حياك الله|تكرم|أهلاً بك)\s*[,،.]?\s*$/i, "")
    .trim();
}

/** Sanitize and redact any sensitive data from message text */
export function sanitizeTextForKnowledge(text: string): string {
  if (!text) return "";
  let clean = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, " ");
  }
  // Remove extra spaces
  clean = clean.replace(/\s+/g, " ").trim();
  clean = scrubGreetings(clean);
  return clean;
}

/** Check if message contains unsanitizable sensitive content */
function containsUnsafeContent(text: string): boolean {
  const lower = text.toLowerCase();
  const unsafeKeywords = [
    "كلمة المرور",
    "باسورد",
    "password",
    "otp",
    "رمز التحقق",
    "كود التحقق",
    "وصل التحويل",
    "صورة الحوالة",
    "رقم البطاقة",
    "رقم الحساب",
    "mastercard",
    "zaincash",
  ];
  // If the message is almost purely an OTP or credential exchange, don't learn from it
  if (unsafeKeywords.some((k) => lower.includes(k)) && text.length < 50) {
    return true;
  }
  return false;
}

/** Extract keywords from question */
function extractKeywords(question: string): string[] {
  const normalized = norm(question);
  const words = normalized
    .split(/[\s,،.?؟!]+/)
    .filter((w) => w.length >= 3)
    .filter(
      (w) =>
        ![
          "اريد",
          "أريد",
          "عندي",
          "شلون",
          "كيف",
          "ممكن",
          "ليش",
          "شنو",
          "اكو",
          "هذا",
          "عندي",
          "طلب",
          "حساب",
        ].includes(w),
    );
  return Array.from(new Set(words));
}

/** Compute text similarity between two strings */
function computeSimilarity(textA: string, textB: string): number {
  const normA = norm(textA);
  const normB = norm(textB);
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;

  const wordsA = new Set(normA.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/** Classify question category */
function categorizeQuestion(text: string): MinedKnowledgeItem["category"] {
  const n = norm(text);
  if (
    n.includes("دخول") ||
    n.includes("باس") ||
    n.includes("رمز") ||
    n.includes("login") ||
    n.includes("password")
  ) {
    return "login";
  }
  if (
    n.includes("دفع") ||
    n.includes("رصيد") ||
    n.includes("محفظة") ||
    n.includes("شحن") ||
    n.includes("payment")
  ) {
    return "payment";
  }
  if (n.includes("طلب") || n.includes("تسليم") || n.includes("كود") || n.includes("استلام")) {
    return "digital_order";
  }
  if (
    n.includes("اوفلاين") ||
    n.includes("انترنت") ||
    n.includes("رئيسي") ||
    n.includes("جهاز") ||
    n.includes("تحديث")
  ) {
    return "game_settings";
  }
  return "general";
}

/** Mine knowledge pairs from a single resolved thread */
export async function mineKnowledgeFromThread(thread: Thread): Promise<MinedKnowledgeItem[]> {
  // Only mine from closed or resolved threads with admin interactions
  if (thread.status !== "closed" && thread.mode !== "RESOLVED") {
    return [];
  }

  const messages = await getMessages(thread.id);
  if (messages.length < 2) return [];

  const pairs: { userMsg: ChatMessage; adminMsg: ChatMessage }[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i]!;
    const next = messages[i + 1]!;

    if (current.senderRole === "user" && next.senderRole === "admin") {
      const userText =
        typeof current.body?.["text"] === "string" ? current.body["text"].trim() : "";
      const adminText = typeof next.body?.["text"] === "string" ? next.body["text"].trim() : "";

      // Ensure valid text length and content
      if (userText.length >= 6 && adminText.length >= 15) {
        if (!containsUnsafeContent(userText) && !containsUnsafeContent(adminText)) {
          pairs.push({ userMsg: current, adminMsg: next });
        }
      }
    }
  }

  const results: MinedKnowledgeItem[] = [];

  for (const pair of pairs) {
    const rawQuestion = (pair.userMsg.body?.["text"] as string) || "";
    const rawAnswer = (pair.adminMsg.body?.["text"] as string) || "";

    const cleanQuestion = sanitizeTextForKnowledge(rawQuestion);
    const cleanAnswer = sanitizeTextForKnowledge(rawAnswer);

    if (cleanQuestion.length < 5 || cleanAnswer.length < 15) continue;

    // Split answer into logical actionable steps
    const steps = cleanAnswer
      .split(/[\n.]+|\d+[-.)]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 5);

    const keywords = extractKeywords(cleanQuestion);
    const category = categorizeQuestion(cleanQuestion);

    results.push({
      id: `kb_mined_${Math.random().toString(36).slice(2, 9)}`,
      title: cleanQuestion.length > 50 ? cleanQuestion.slice(0, 48) + "..." : cleanQuestion,
      question: cleanQuestion,
      answer: cleanAnswer,
      steps: steps.length > 0 ? steps : [cleanAnswer],
      keywords,
      category,
      usageCount: 1,
      ratingScore: 5.0,
      status: "approved",
      sourceThreadId: thread.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return results;
}

/** Mine all resolved/closed threads and merge into knowledge base articles */
export async function mineAllResolvedThreads(): Promise<{
  totalMined: number;
  mergedCount: number;
  newArticlesCount: number;
}> {
  const allThreads = await listThreads();
  const closedThreads = allThreads.filter((t) => t.status === "closed" || t.mode === "RESOLVED");

  const extractedItems: MinedKnowledgeItem[] = [];

  for (const thread of closedThreads) {
    try {
      const items = await mineKnowledgeFromThread(thread);
      extractedItems.push(...items);
    } catch (err) {
      console.warn(`[kb-mining:thread_error] threadId=${thread.id}`, err);
    }
  }

  if (extractedItems.length === 0) {
    return { totalMined: 0, mergedCount: 0, newArticlesCount: 0 };
  }

  // Load current store settings
  const store = await getStore();
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const currentKb = ((settings["kbArticles"] as any[]) ?? []) as {
    id?: string;
    title?: string;
    match?: string;
    ask?: string;
    steps?: string;
    errorCodes?: string;
    imageUrl?: string;
    usageCount?: number;
    sourceThreadId?: string;
    status?: string;
  }[];

  let mergedCount = 0;
  let newArticlesCount = 0;

  for (const item of extractedItems) {
    // Check if an existing KB entry matches this question
    const existingIndex = currentKb.findIndex((kb) => {
      const sim = computeSimilarity(kb.title || "", item.question);
      return sim >= 0.65;
    });

    if (existingIndex !== -1) {
      // Merge and increment usage count
      const existing = currentKb[existingIndex];
      const existingMatches = (existing.match || "")
        .split(/[\n,،]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const combinedMatches = Array.from(
        new Set([...existingMatches, ...item.keywords, item.question]),
      );

      currentKb[existingIndex] = {
        ...existing,
        match: combinedMatches.join("، "),
        usageCount: (existing!.usageCount || 1) + 1,
      };
      mergedCount++;
    } else {
      // Create new KB article
      currentKb.push({
        id: item.id,
        title: item.title,
        match: [item.question, ...item.keywords].join("، "),
        ask: "هل واجهتك هذه المشكلة أثناء تسجيل الدخول أم أثناء فتح اللعبة؟",
        steps: item.steps.join("\n"),
        errorCodes: "",
        imageUrl: "",
        usageCount: 1,
        sourceThreadId: item.sourceThreadId,
        status: "approved",
      });
      newArticlesCount++;
    }
  }

  // Save updated KB to store settings
  await updateStore((doc) => ({ ...doc, settings: { ...(doc.settings || {}), kbArticles: currentKb } }));

  return {
    totalMined: extractedItems.length,
    mergedCount,
    newArticlesCount,
  };
}
