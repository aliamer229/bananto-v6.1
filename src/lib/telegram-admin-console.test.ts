import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishEnv } from "./env.server";

/**
 * The console is the operator's, and only the operator's. These tests are the
 * ways someone else could try to use it: pressing an approve button that was
 * forwarded to them, or typing a command they have seen the operator use.
 */

const sent: { chatId: unknown; text: string }[] = [];
const answered: { id: string; text?: string }[] = [];
const approvals: string[] = [];
const rejections: string[] = [];

function mockDeps() {
  vi.doMock("./telegram.server", () => ({
    sendTelegramMessage: async (chatId: unknown, text: string) => {
      sent.push({ chatId, text });
      return { ok: true, result: { message_id: 1 } };
    },
    editTelegramMessageText: async () => true,
    answerCallbackQuery: async (id: string, options?: { text?: string }) => {
      answered.push({ id, ...(options?.text ? { text: options.text } : {}) });
      return true;
    },
    escapeHtml: (value: string) => value,
    pinTelegramMessage: async () => true,
    telegramBotStartDeepLink: (param: string) => `https://t.me/bot?start=${param}`,
    telegramPublicOrigin: () => "https://banan.to",
  }));

  vi.doMock("./db.server", () => ({
    approveRechargeRequest: async (id: string) => {
      approvals.push(id);
      return { ok: true, creditedAmount: 25000, balance: 125000 };
    },
    rejectRechargeRequest: async (id: string) => {
      rejections.push(id);
      return { ok: true };
    },
    getRechargeRequestWithUser: async (id: string) => ({
      id,
      userId: "usr_1",
      amount: 25000,
      method: "zain_cash",
      status: "pending",
      createdAt: "",
      updatedAt: "",
      user: { id: "usr_1", name: "Member", walletBalance: 100000, isAdmin: false },
    }),
    listAllRechargeRequests: async () => [
      {
        id: "rrq_1",
        userId: "usr_1",
        amount: 25000,
        method: "zain_cash",
        status: "pending",
        createdAt: "",
        updatedAt: "",
        user: { id: "usr_1", name: "Member", walletBalance: 100000, isAdmin: false },
      },
    ],
  }));

  vi.doMock("./d1.server", () => ({ d1Run: async () => {} }));
}

beforeEach(() => {
  vi.resetModules();
  sent.length = 0;
  answered.length = 0;
  approvals.length = 0;
  rejections.length = 0;
  publishEnv({ TELEGRAM_ADMIN_CHAT_ID: "6404042791" });
  mockDeps();
});

afterEach(() => {
  vi.doUnmock("./telegram.server");
  vi.doUnmock("./db.server");
  vi.doUnmock("./d1.server");
  publishEnv({});
});

const adminMessage = (text: string) => ({
  text,
  chat: { id: 6404042791, type: "private" },
  from: { id: 6404042791, first_name: "Owner" },
});

const memberMessage = (text: string) => ({
  text,
  chat: { id: 555000111, type: "private" },
  from: { id: 555000111, first_name: "Member" },
});

describe("operator commands", () => {
  it("answers the operator", async () => {
    const { handleAdminCommand } = await import("./telegram-admin-console.server");
    expect(await handleAdminCommand(adminMessage("/admin"))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("لوحة المشرف");
  });

  it("says nothing at all to anyone else", async () => {
    const { handleAdminCommand } = await import("./telegram-admin-console.server");
    // Consumed, so the member flow does not pick it up either — but with no
    // reply, so the console leaves no trace of itself.
    expect(await handleAdminCommand(memberMessage("/admin"))).toBe(true);
    expect(await handleAdminCommand(memberMessage("/pending"))).toBe(true);
    expect(await handleAdminCommand(memberMessage("/contest x | y"))).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("leaves ordinary messages to the member flow", async () => {
    const { handleAdminCommand } = await import("./telegram-admin-console.server");
    expect(await handleAdminCommand(adminMessage("/start"))).toBe(false);
    expect(await handleAdminCommand(memberMessage("مرحبا"))).toBe(false);
  });

  it("lists pending top-ups with decision buttons", async () => {
    const { handleAdminCommand } = await import("./telegram-admin-console.server");
    await handleAdminCommand(adminMessage("/pending"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Member");
  });
});

describe("operator buttons", () => {
  const press = (data: string, fromId: number, chatType = "private") => ({
    id: "cb_1",
    data,
    from: { id: fromId, first_name: "X" },
    message: { message_id: 9, chat: { id: fromId, type: chatType } },
  });

  it("settles a request when the operator presses approve", async () => {
    const { handleAdminCallback } = await import("./telegram-admin-console.server");
    expect(await handleAdminCallback(press("rq:ok:rrq_1", 6404042791))).toBe(true);
    expect(approvals).toEqual(["rrq_1"]);
    expect(answered[0]!.text).toContain("تمت الموافقة");
  });

  it("does nothing when anyone else presses the same button", async () => {
    const { handleAdminCallback } = await import("./telegram-admin-console.server");
    expect(await handleAdminCallback(press("rq:ok:rrq_1", 555000111))).toBe(true);
    expect(approvals).toEqual([]);
    expect(rejections).toEqual([]);
    // Answered as an expired button rather than as a refusal, so the reply
    // does not confirm that an approve action exists.
    expect(answered[0]!.text).toBe("هذا الزر لم يعد متاحاً.");
  });

  it("refuses a press that arrives from a group, even from the operator", async () => {
    const { handleAdminCallback } = await import("./telegram-admin-console.server");
    await handleAdminCallback(press("rq:ok:rrq_1", 6404042791, "supergroup"));
    expect(approvals).toEqual([]);
  });

  it("ignores buttons that are not the console's", async () => {
    const { handleAdminCallback } = await import("./telegram-admin-console.server");
    expect(await handleAdminCallback(press("get_id", 6404042791))).toBe(false);
    expect(await handleAdminCallback(press("verify_sub_main", 6404042791))).toBe(false);
  });

  it("rejects on the reject button", async () => {
    const { handleAdminCallback } = await import("./telegram-admin-console.server");
    await handleAdminCallback(press("rq:no:rrq_9", 6404042791));
    expect(rejections).toEqual(["rrq_9"]);
    expect(approvals).toEqual([]);
  });
});
