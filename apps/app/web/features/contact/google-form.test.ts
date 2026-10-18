import { describe, expect, it } from "vitest";
import {
  CONTACT_CATEGORIES,
  GOOGLE_FORM,
  isValidEmail,
  looksLikeSpam,
  nextAllowedAt,
  toGoogleFormBody,
  validateContactInput,
} from "./google-form.ts";

describe("toGoogleFormBody", () => {
  it("maps every field to its entry id, including the optional ones when given", () => {
    const body = toGoogleFormBody({
      category: "権利に関するお問い合わせ",
      name: "Hal Myth",
      email: "hal@example.com",
      message: "掲載中止の依頼",
    });
    expect(body.get(GOOGLE_FORM.entries.category)).toBe("権利に関するお問い合わせ");
    expect(body.get(GOOGLE_FORM.entries.name)).toBe("Hal Myth");
    expect(body.get(GOOGLE_FORM.entries.email)).toBe("hal@example.com");
    expect(body.get(GOOGLE_FORM.entries.message)).toBe("掲載中止の依頼");
  });

  it("names Scenote in the service field of the form shared with the other Lumorphia services", () => {
    const body = toGoogleFormBody({ category: "その他", name: "", email: "", message: "x" });
    expect(GOOGLE_FORM.entries.service).toBe("entry.2074387887");
    expect(body.get(GOOGLE_FORM.entries.service)).toBe("Scenote");
  });

  it("opens the Google Form itself with Scenote already chosen when sending fails", () => {
    const url = new URL(GOOGLE_FORM.viewUrl);
    expect(url.origin + url.pathname).toBe(GOOGLE_FORM.action.replace(/formResponse$/, "viewform"));
    expect(url.searchParams.get("usp")).toBe("pp_url");
    expect(url.searchParams.get(GOOGLE_FORM.entries.service)).toBe("Scenote");
  });

  it("leaves the optional fields out when they are blank, so the sheet shows empty cells", () => {
    const body = toGoogleFormBody({ category: "その他", name: " ", email: "", message: "x" });
    expect(body.has(GOOGLE_FORM.entries.name)).toBe(false);
    expect(body.has(GOOGLE_FORM.entries.email)).toBe(false);
  });

  it("only accepts the categories the Google Form defines", () => {
    expect(CONTACT_CATEGORIES).toEqual([
      "機能に関するお問い合わせ",
      "ログインに関するお問い合わせ",
      "アカウントに関するお問い合わせ",
      "権利に関するお問い合わせ",
      "その他",
    ]);
  });

  it("posts to the form's formResponse endpoint", () => {
    expect(GOOGLE_FORM.action).toMatch(
      /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/,
    );
  });
});

describe("isValidEmail (RFC 5322 の実用的な部分集合)", () => {
  it.each([
    "hal@example.com",
    "hal.myth+ffxiv@sub.example.co.jp",
    "user_name-1@example-domain.io",
    '"quoted local"@example.com',
    "a@b.cd",
  ])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    "",
    "plain",
    "@example.com",
    "hal@",
    "hal@example",
    "hal@-example.com",
    "hal@example-.com",
    ".hal@example.com",
    "hal.@example.com",
    "hal..myth@example.com",
    "hal@exa mple.com",
    "hal@example.c",
    "hal@example.123",
    `${"a".repeat(65)}@example.com`,
    `hal@${"a".repeat(64)}.com`,
    // domain 253 文字超、アドレス 254 文字超
    `h@${["a", "b", "c", "d", "e"].map((c) => c.repeat(50)).join(".")}.com`,
    "hal@example.com\n",
    "ハル@example.com",
  ])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("validateContactInput", () => {
  const ok = { category: "その他" as const, name: "", email: "", message: "内容" };

  it("passes a minimal valid input", () => {
    expect(validateContactInput(ok)).toEqual({});
  });

  it("rejects a category outside the form's choices, even if the DOM was tampered with", () => {
    expect(validateContactInput({ ...ok, category: "何か" as never })).toHaveProperty("category");
  });

  it("rejects a blank message and one over 5000 chars", () => {
    expect(validateContactInput({ ...ok, message: "  " })).toHaveProperty("message");
    expect(validateContactInput({ ...ok, message: "あ".repeat(5001) })).toHaveProperty("message");
  });

  it("rejects a malformed email but allows it to be empty", () => {
    expect(validateContactInput({ ...ok, email: "nope" })).toHaveProperty("email");
    expect(validateContactInput({ ...ok, email: " " })).toEqual({});
  });

  it("rejects a name over 100 chars", () => {
    expect(validateContactInput({ ...ok, name: "a".repeat(101) })).toHaveProperty("name");
  });
});

describe("spam guard", () => {
  it("treats a filled honeypot as spam", () => {
    expect(looksLikeSpam({ website: "http://spam" })).toBe(true);
    expect(looksLikeSpam({ website: "" })).toBe(false);
  });

  it("allows one submission per minute per browser", () => {
    const now = 1_000_000;
    expect(nextAllowedAt(null, now)).toBe(0);
    expect(nextAllowedAt(now - 30_000, now)).toBe(now + 30_000);
    expect(nextAllowedAt(now - 60_000, now)).toBe(0);
  });
});
