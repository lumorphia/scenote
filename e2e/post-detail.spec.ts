import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post, sendToPostForm } from "./posting.ts";

// 投稿詳細 (docs/plan.md の S6b、要件定義書 13 章・16 章)

test("the post page shows the photo with who posted it and when", async ({ page }) => {
  const user = lumorphiaUser();
  await login(page, user);
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill("テスト_詳細の題");
  await page.getByLabel("ひとこと (任意)").fill("テスト_詳細の本文");
  await page.getByLabel("撮影日 (任意)").fill("2026-09-30");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
  await expect(page.getByRole("heading", { name: "テスト_詳細の題" })).toBeVisible();
  await expect(page.getByTestId("post-author")).toContainText(`@${user.handle}`);
  await expect(page.getByTestId("post-taken-on")).toHaveText("2026年9月30日");
  await expect(page.getByTestId("post-published-on")).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日$/);
});

test("the URL of a public post can be copied", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, lumorphiaUser());
  await post(page);
  await page.getByRole("button", { name: "URL をコピー" }).click();
  await expect(page.getByText("URL をコピーしました")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("a private post offers no URL to copy", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page, "非公開");
  await expect(page.getByRole("button", { name: "URL をコピー" })).toHaveCount(0);
});

test("the header fits a phone screen", async ({ page }) => {
  const user = lumorphiaUser();
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, user);
  await gotoHydrated(page, "/");
  await expect(page.getByTestId("signed-in-user")).toContainText(`@${user.handle}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const header = await page.locator("header").boundingBox();
  expect(header!.height).toBeLessThan(80);
});
