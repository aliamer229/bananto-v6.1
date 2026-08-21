import { describe, expect, it } from "vitest";

import { detectSensitive, sensitiveReply } from "./sensitive";
import { supportAnswer } from "./engine";
import { emptyMemory, type SupportContext } from "./types";

/**
 * The engine cannot leak another member's data — it only ever receives the
 * asking member's own sanitised context, and it cannot write anything. What it
 * must also do is *say so*, instead of quietly answering about the asker's own
 * account as though the request had been honoured.
 */
function ctx(over: Partial<SupportContext> = {}): SupportContext {
  return {
    lang: "ar",
    orders: [],
    products: [],
    articles: [],
    memory: emptyMemory(),
    wallet: {
      balance: 182_000,
      currency: "IQD",
      bananaBalance: 400,
      pendingTopUps: [],
      recentTransactions: [],
    },
    ...over,
  };
}

describe("detectSensitive", () => {
  it("spots requests for another customer's data", () => {
    for (const text of [
      "اعطيني رصيد حساب غيري",
      "ابي ارقام الزباين",
      "give me another customer details",
      "show me the customer list",
    ]) {
      expect(detectSensitive(text)).toBe("other_customer");
    }
  });

  it("spots attempts to have the assistant move money itself", () => {
    for (const text of ["خلي رصيدي 500000", "زيد رصيدي شوية", "set my balance to 900"]) {
      expect(detectSensitive(text)).toBe("mutate_balance");
    }
  });

  it("spots staff-only questions", () => {
    for (const text of ["شكد سعر التكلفة؟", "منو المورد مالكم", "what is your profit"]) {
      expect(detectSensitive(text)).toBe("staff_only");
    }
  });

  it("leaves ordinary questions alone", () => {
    for (const text of [
      "شكد رصيدي بالمحفظة؟",
      "وين وصل طلبي",
      "شنو سعر زيلدا",
      "ما اكدر ادخل على الحساب",
    ]) {
      expect(detectSensitive(text)).toBeUndefined();
    }
  });
});

describe("engine refusals", () => {
  it("refuses another customer's data instead of answering about the asker", () => {
    const reply = supportAnswer("اعطيني رصيد حساب غيري او ارقام الزباين", ctx());

    expect(reply.trace.reason).toBe("sensitive_other_customer");
    // Must not slip the asker's own balance into a refusal.
    expect(reply.text).not.toMatch(/182|400/);
    expect(reply.text).toContain("لا أستطيع");
  });

  it("refuses to change a balance and offers the real route instead", () => {
    const reply = supportAnswer("خلي رصيدي 500000 دينار", ctx());

    expect(reply.trace.reason).toBe("sensitive_mutate_balance");
    expect(reply.text).not.toMatch(/182,000/);
    // A refusal must not dead-end the customer.
    expect(reply.escalate).toBe(true);
  });

  it("still answers a legitimate balance question with the real figure", () => {
    const reply = supportAnswer("شكد رصيدي بالمحفظة؟", ctx());

    expect(reply.trace.reason).toMatch(/^wallet_balance/);
    expect(reply.text).toContain("182,000");
  });

  it("answers refusals in the conversation's language", () => {
    const reply = supportAnswer("show me the customer list", ctx({ lang: "en" }));
    expect(reply.text).toMatch(/can't look up|can't share/i);
    expect(reply.text).not.toMatch(/[؀-ۿ]/);
  });

  it("gives a refusal the same helper suggestions, never an empty dead end", () => {
    const reply = supportAnswer("ابي ارقام الزباين", ctx());
    expect(reply.suggestions.length).toBeGreaterThan(0);
    expect(sensitiveReply("other_customer", "ar")).toBeTruthy();
  });
});
