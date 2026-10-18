import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login } from "./posting.ts";

// 問い合わせ (docs/plan.md の S7d-2、ADR-0027)。Google フォームへ直接 POST する。
// Google には届けず、送る中身と画面の遷移だけ見る (lumorphia/prismtone の e2e/contact.spec.ts と同じ)

const FORM_RESPONSE = "https://docs.google.com/forms/**/formResponse";

test("anyone can open the contact page from the footer", async ({ page }) => {
  await gotoHydrated(page, "/");
  await page.getByRole("contentinfo").getByRole("link", { name: "お問い合わせ" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("お問い合わせ");
});

test("someone who has not agreed to the terms can still write to the operator", async ({
  page,
}) => {
  await login(page, lumorphiaUser(), { consent: false });
  await expect(page).toHaveURL(/\/welcome/);
  const me = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/me");
  await gotoHydrated(page, "/contact");
  expect((await me).ok()).toBe(true);
  await page.getByLabel("お問い合わせ内容").fill("規約について質問です");
  await expect(page).toHaveURL(/\/contact$/);
});

test("sends the fields with the Scenote service to the Google Form and thanks the visitor", async ({
  page,
}) => {
  let posted: string | null = null;
  await page.route(FORM_RESPONSE, async (route) => {
    posted = route.request().postData();
    await route.fulfill({ status: 200, body: "" });
  });

  await gotoHydrated(page, "/contact");
  await page.getByLabel("種別").selectOption("権利に関するお問い合わせ");
  await page.getByLabel("お名前 (任意)").fill("E2E Tester");
  await page.getByLabel("メールアドレス (任意)").fill("e2e@example.com");
  await page.getByLabel("お問い合わせ内容").fill("E2E からの送信テストです");
  await page.getByRole("button", { name: "送信する" }).click();

  await expect(page.getByTestId("contact-done")).toContainText("送信しました");
  expect(posted).not.toBeNull();
  const params = new URLSearchParams(posted!);
  expect([...params.values()]).toEqual(
    expect.arrayContaining([
      "Scenote",
      "権利に関するお問い合わせ",
      "E2E Tester",
      "e2e@example.com",
      "E2E からの送信テストです",
    ]),
  );
});

test("requires a category and a message", async ({ page }) => {
  await gotoHydrated(page, "/contact");
  await page.getByRole("button", { name: "送信する" }).click();
  await expect(page.getByTestId("contact-done")).toHaveCount(0);
  await expect(page.getByLabel("種別")).toBeFocused();
});

test("offers the Google Form itself when the request fails", async ({ page }) => {
  await page.route(FORM_RESPONSE, (route) => route.abort());
  await gotoHydrated(page, "/contact");
  await page.getByLabel("種別").selectOption("その他");
  await page.getByLabel("お問い合わせ内容").fill("x");
  await page.getByRole("button", { name: "送信する" }).click();
  await expect(page.getByRole("alert")).toContainText("送信できませんでした");
  await expect(page.getByRole("link", { name: "Google フォームを開く" })).toBeVisible();
});

test("checks the email format itself, not just through the browser", async ({ page }) => {
  let posted = 0;
  await page.route(FORM_RESPONSE, async (route) => {
    posted += 1;
    await route.fulfill({ status: 200, body: "" });
  });
  await gotoHydrated(page, "/contact");
  // ブラウザの検証を外して、自前の検証だけで止まることを見る
  await page.evaluate(() => document.querySelector("form")?.setAttribute("novalidate", ""));
  await page.getByLabel("種別").selectOption("その他");
  await page.getByLabel("メールアドレス (任意)").fill("hal@example");
  await page.getByLabel("お問い合わせ内容").fill("x");
  await page.getByRole("button", { name: "送信する" }).click();
  await expect(page.getByTestId("error-email")).toContainText("形式");
  expect(posted).toBe(0);

  await page.getByLabel("メールアドレス (任意)").fill("hal@example.com");
  await page.getByRole("button", { name: "送信する" }).click();
  await expect(page.getByTestId("contact-done")).toBeVisible();
  expect(posted).toBe(1);
});

test("drops a submission whose honeypot is filled and limits one per minute", async ({ page }) => {
  let posted = 0;
  await page.route(FORM_RESPONSE, async (route) => {
    posted += 1;
    await route.fulfill({ status: 200, body: "" });
  });
  await gotoHydrated(page, "/contact");
  await page.getByLabel("種別").selectOption("その他");
  await page.getByLabel("お問い合わせ内容").fill("bot");
  // 隠し欄は人には見えない。bot は埋める
  await page.locator('input[name="website"]').fill("http://spam.example", { force: true });
  await page.getByRole("button", { name: "送信する" }).click();
  // 見た目は成功にして bot に学習させない。Google には送らない
  await expect(page.getByTestId("contact-done")).toBeVisible();
  expect(posted).toBe(0);

  // 1 分以内の 2 通目は止める
  await gotoHydrated(page, "/contact");
  await page.getByLabel("種別").selectOption("その他");
  await page.getByLabel("お問い合わせ内容").fill("second");
  await page.getByRole("button", { name: "送信する" }).click();
  await expect(page.getByRole("alert")).toContainText("しばらく");
  expect(posted).toBe(0);
});
