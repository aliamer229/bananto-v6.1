import { describe, expect, it } from "vitest";

import {
  cleanFieldValue,
  deliveryCardToMessageBody,
  displayablePassword,
  isEncryptedLegacyValue,
  isRenderableAccountCard,
  legacyMessageId,
  normalizeAccountCard,
} from "./account-cards";

describe("legacy account cards", () => {
  it("renders credentials with a plaintext password", () => {
    const card = normalizeAccountCard("item_credentials", {
      title: "Sports Switch",
      accountUser: "wwee3876",
      password: "gen2g4gh",
      passwordStorage: "plaintext_legacy",
    })!;
    expect(card.accountUser).toBe("wwee3876");
    expect(card.password).toBe("gen2g4gh");
    expect(isRenderableAccountCard(card)).toBe(true);
  });

  it("renders credentials without any password", () => {
    const card = normalizeAccountCard("item_credentials", {
      title: "Super Mario Odyssey",
      accountUser: "pptt3655",
    })!;
    expect(card.accountUser).toBe("pptt3655");
    expect(card.password).toBeNull();
    expect(isRenderableAccountCard(card)).toBe(true);
  });

  it("never exposes enc:v1 ciphertext but keeps the account user", () => {
    const card = normalizeAccountCard("item_credentials", {
      accountUser: "ttxx8173",
      passwordStorage: "encrypted_legacy_v1",
      legacyEncryptedPassword: "enc:v1:AAAABBBBCCCC",
      password: "enc:v1:AAAABBBBCCCC",
    })!;
    expect(card.password).toBeNull();
    expect(card.hasProtectedLegacyPassword).toBe(true);
    expect(card.accountUser).toBe("ttxx8173");
    expect(isRenderableAccountCard(card)).toBe(true);
    expect(JSON.stringify(card)).not.toContain("enc:v1");
  });

  it("treats placeholder passwords as absent", () => {
    for (const p of ["null", "undefined", "N/A", "[PROTECTED]", "", "  "]) {
      expect(displayablePassword({ password: p })).toBeNull();
      expect(cleanFieldValue(p)).toBeNull();
    }
  });

  it("renders verification cards with game, user and code", () => {
    const card = normalizeAccountCard("item_verification_code", {
      title: "The Legend of Zelda: Link's Awakening",
      accountUser: "buty2637",
      verificationCode: "439947",
    })!;
    expect(card.title).toContain("Zelda");
    expect(card.accountUser).toBe("buty2637");
    expect(card.verificationCode).toBe("439947");
    expect(isRenderableAccountCard(card)).toBe(true);
  });

  it("keeps a verification card renderable without an account user", () => {
    const card = normalizeAccountCard("item_verification_code", {
      title: "Mario Kart",
      verificationCode: "422747",
    })!;
    expect(card.accountUser).toBeNull();
    expect(isRenderableAccountCard(card)).toBe(true);
  });

  it("renders instructions with text and images", () => {
    const card = normalizeAccountCard("instructions", {
      text: "هاي التعليمات للحساب",
      images: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    })!;
    expect(card.text).toBe("هاي التعليمات للحساب");
    expect(card.images).toHaveLength(2);
    expect(isRenderableAccountCard(card)).toBe(true);
  });

  it("ignores non-card message kinds", () => {
    expect(normalizeAccountCard("text", { text: "hi" })).toBeNull();
    expect(normalizeAccountCard("image", { imageUrl: "x" })).toBeNull();
  });

  it("detects encrypted legacy values", () => {
    expect(isEncryptedLegacyValue("enc:v1:abc")).toBe(true);
    expect(isEncryptedLegacyValue("plain")).toBe(false);
  });

  it("maps a delivery-card index row to a canonical message body", () => {
    const body = deliveryCardToMessageBody({
      legacy_message_id: "abc",
      card_type: "item_credentials",
      game_name: "Resident Evil 9",
      account_user: "ttxx8173",
      password_storage: "encrypted_legacy_v1",
      legacy_encrypted_password: "enc:v1:zzz",
      order_item_resolved: false,
    });
    expect(body["accountUser"]).toBe("ttxx8173");
    expect(body["password"]).toBeUndefined();
    const card = normalizeAccountCard("item_credentials", body)!;
    expect(card.password).toBeNull();
    expect(card.accountUser).toBe("ttxx8173");
  });

  it("uses deterministic ids so retries never duplicate cards", () => {
    expect(legacyMessageId("abc")).toBe("legacy_msg_abc");
    expect(legacyMessageId("abc")).toBe(legacyMessageId("abc"));
  });

  it("does not link a card to an order item when it is unresolved", () => {
    const card = normalizeAccountCard("item_credentials", {
      accountUser: "fy85134",
      legacyOrderItemId: "oi-1",
      orderItemResolved: false,
    })!;
    expect(card.orderItemResolved).toBe(false);
  });
});
