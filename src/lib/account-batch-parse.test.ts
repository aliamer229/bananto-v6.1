import { describe, expect, it } from "vitest";

import { MAX_BATCH_ACCOUNTS, parseAccountBatch } from "./account-batch-parse";

describe("parseAccountBatch", () => {
  it("accepts every separator staff paste from a spreadsheet or notes app", () => {
    const { accounts, errors } = parseAccountBatch(
      [
        "one@mail.com:Pass1",
        "two@mail.com,Pass2",
        "three@mail.com|Pass3",
        "four@mail.com\tPass4",
        "five@mail.com Pass5",
      ].join("\n"),
    );
    expect(errors).toHaveLength(0);
    expect(accounts).toEqual([
      { email: "one@mail.com", password: "Pass1" },
      { email: "two@mail.com", password: "Pass2" },
      { email: "three@mail.com", password: "Pass3" },
      { email: "four@mail.com", password: "Pass4" },
      { email: "five@mail.com", password: "Pass5" },
    ]);
  });

  it("splits on the first separator only, so a password may contain one", () => {
    const { accounts } = parseAccountBatch("user@mail.com:a:b,c");
    expect(accounts).toEqual([{ email: "user@mail.com", password: "a:b,c" }]);
  });

  it("keeps an account with no password", () => {
    const { accounts } = parseAccountBatch("solo@mail.com");
    expect(accounts).toEqual([{ email: "solo@mail.com" }]);
  });

  it("skips blank lines and comments", () => {
    const { accounts, errors } = parseAccountBatch(
      "# batch for order 12\n\none@mail.com:x\n   \ntwo@mail.com:y\n",
    );
    expect(errors).toHaveLength(0);
    expect(accounts.map((a) => a.email)).toEqual(["one@mail.com", "two@mail.com"]);
  });

  it("drops repeated emails so nobody is handed the same login twice", () => {
    const { accounts, duplicates } = parseAccountBatch(
      "dup@mail.com:first\nDUP@mail.com:second\nother@mail.com:x",
    );
    expect(accounts.map((a) => a.email)).toEqual(["dup@mail.com", "other@mail.com"]);
    expect(accounts[0]?.password).toBe("first");
    expect(duplicates).toEqual(["DUP@mail.com"]);
  });

  it("reports a line whose identifier could never be one", () => {
    const { accounts, errors } = parseAccountBatch(":onlypassword\ngood@mail.com:x");
    expect(accounts.map((a) => a.email)).toEqual(["good@mail.com"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe("missing_email");
    expect(errors[0]?.line).toBe(1);
  });

  it("accepts a bare platform username, not just an email", () => {
    const { accounts, errors } = parseAccountBatch("player_one:Pass1");
    expect(errors).toHaveLength(0);
    expect(accounts).toEqual([{ email: "player_one", password: "Pass1" }]);
  });

  it("returns an empty batch for empty input", () => {
    expect(parseAccountBatch("   \n\n")).toEqual({
      accounts: [],
      errors: [],
      duplicates: [],
    });
  });

  it("stops the UI at the same ceiling the server enforces", () => {
    expect(MAX_BATCH_ACCOUNTS).toBe(50);
  });
});
