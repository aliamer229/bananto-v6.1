import { describe, expect, it } from "vitest";

import { suggestAdminReplies } from "./admin-suggestions";
import { emptyMemory, type SafeOrder, type SupportContext } from "./types";

/**
 * Staff should not have to read back through a thread to work out what the
 * customer is waiting for. Suggestions are ranked from what was actually
 * written and from where the order genuinely stands — a reply that makes no
 * sense right now must never be offered.
 */
function ctx(over: Partial<SupportContext> = {}): SupportContext {
  return {
    lang: "ar",
    orders: [],
    products: [],
    articles: [],
    memory: emptyMemory(),
    ...over,
  };
}

function order(over: Partial<SafeOrder> = {}): SafeOrder {
  return {
    id: "ord_1",
    code: "BN-1",
    status: "pending",
    paymentStatus: "paid",
    total: 5000,
    currency: "IQD",
    needsAddress: false,
    hasAddress: false,
    items: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const msg = (text: string, senderRole = "user") => ({ senderRole, text });

describe("admin reply suggestions", () => {
  it("always offers something, even with an empty thread", () => {
    const out = suggestAdminReplies({ messages: [], ctx: ctx() });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.text.trim().length > 0)).toBe(true);
  });

  it("leads with an apology when the customer is chasing an update", () => {
    const out = suggestAdminReplies({
      messages: [msg("متى يوصل الطلب؟ صار يومين وما وصل")],
      ctx: ctx(),
    });
    expect(out[0]!.id).toBe("apology_wait");
  });

  it("hears the chase in Iraqi phrasing that uses none of the obvious words", () => {
    const out = suggestAdminReplies({
      messages: [msg("شكد بعد يريد وقت؟ صار زمان وانا انتظر")],
      ctx: ctx(),
    });
    expect(out[0]!.id).toBe("apology_wait");
  });

  it("asks for the receipt when payment is not confirmed", () => {
    const out = suggestAdminReplies({
      messages: [msg("هلو")],
      ctx: ctx(),
      order: order({ paymentStatus: "unpaid" }),
    });
    expect(out.map((s) => s.id)).toContain("payment_pending");
  });

  it("chases the registration proof once credentials went out", () => {
    const out = suggestAdminReplies({
      messages: [msg("تمام")],
      ctx: ctx(),
      order: order({
        items: [
          {
            id: "i1",
            productId: "p1",
            title: "Zelda",
            kind: "account",
            quantity: 1,
            credsSentAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    });
    expect(out.map((s) => s.id)).toContain("ask_proof");
  });

  it("does not chase proof before anything has been delivered", () => {
    const out = suggestAdminReplies({
      messages: [msg("تمام")],
      ctx: ctx(),
      order: order({
        items: [{ id: "i1", productId: "p1", title: "Zelda", kind: "account", quantity: 1 }],
      }),
    });
    expect(out.map((s) => s.id)).not.toContain("ask_proof");
    expect(out.map((s) => s.id)).toContain("creds_coming");
  });

  it("asks for an address only when a physical item lacks one", () => {
    const withAddress = suggestAdminReplies({
      messages: [msg("تمام")],
      ctx: ctx(),
      order: order({ needsAddress: true, hasAddress: true }),
    });
    expect(withAddress.map((s) => s.id)).not.toContain("delivery_address");

    const without = suggestAdminReplies({
      messages: [msg("تمام")],
      ctx: ctx(),
      order: order({ needsAddress: true, hasAddress: false }),
    });
    expect(without.map((s) => s.id)).toContain("delivery_address");
  });

  it("reacts to a sign-in complaint with troubleshooting, not a generic line", () => {
    const out = suggestAdminReplies({
      messages: [msg("ما اكدر ادخل على الحساب، يطلع خطأ بكلمة السر")],
      ctx: ctx(),
    });
    expect(out.map((s) => s.id)).toContain("login_help");
  });

  it("answers in the conversation's language", () => {
    const out = suggestAdminReplies({
      messages: [msg("I cannot sign in to the account")],
      ctx: ctx({ lang: "en" }),
    });
    expect(out.some((s) => /sign|account|check/i.test(s.text))).toBe(true);
    expect(out.every((s) => !/[؀-ۿ]/.test(s.text))).toBe(true);
  });

  it("reads the newest customer message, ignoring staff replies after it", () => {
    const out = suggestAdminReplies({
      messages: [
        msg("شكرا"),
        msg("تم", "admin"),
        msg("ما اكدر ادخل على الحساب"),
        msg("لحظة", "admin"),
      ],
      ctx: ctx(),
    });
    expect(out.map((s) => s.id)).toContain("login_help");
  });

  it("never repeats the same suggestion and respects the cap", () => {
    const out = suggestAdminReplies(
      {
        messages: [msg("متى يوصل؟")],
        ctx: ctx(),
        order: order({ paymentStatus: "unpaid", needsAddress: true, hasAddress: false }),
      },
      3,
    );
    expect(out).toHaveLength(3);
    expect(new Set(out.map((s) => s.id)).size).toBe(3);
  });

  it("carries a reason for every suggestion so staff see why it was offered", () => {
    const out = suggestAdminReplies({ messages: [msg("متى يوصل؟")], ctx: ctx() });
    expect(out.every((s) => s.reason.trim().length > 0)).toBe(true);
  });
});
