import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post, sendToPostForm } from "./posting.ts";

// タグ検索と利用者のページ (docs/plan.md の S6c、トップの欄は S6f)。E2E の DB はほかのテストと同じなので、印の付いた名前で探す

async function postWithTag(page: Parameters<typeof login>[0], tag: string, title: string) {
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill(title);
  const field = page.getByRole("textbox", { name: /タグ/ });
  await field.fill(tag);
  await field.press("Enter");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
}

test("a tag on a post leads to the other public posts with it", async ({ page }) => {
  const tag = `テスト${randomUUID().slice(0, 6)}`;
  const title = `テスト_タグ_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await postWithTag(page, tag, title);
  await page.getByRole("link", { name: `#${tag}` }).click();
  await expect(page).toHaveURL(new RegExp(`/tags/${encodeURIComponent(tag.toLowerCase())}$`));
  await expect(page.getByRole("heading", { name: `#${tag}` })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("a tag can be searched from the top page", async ({ page }) => {
  const tag = `テスト${randomUUID().slice(0, 6)}`;
  const title = `テスト_検索_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await postWithTag(page, tag, title);
  await gotoHydrated(page, "/");
  // トップの欄は検索 (S6f)。# を付けて書いてもタグとして探す
  await page.getByRole("searchbox", { name: "写真を探す" }).fill(`#${tag}`);
  await page.getByRole("searchbox", { name: "写真を探す" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("the author of a post leads to their page of public posts", async ({ page }) => {
  const user = lumorphiaUser();
  const shown = `テスト_公開_${randomUUID().slice(0, 8)}`;
  const hidden = `テスト_非公開_${randomUUID().slice(0, 8)}`;
  await login(page, user);
  await post(page, "非公開", hidden);
  await post(page, undefined, shown);
  await page.getByTestId("post-author").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/u/${user.handle}$`));
  await expect(page.getByRole("heading", { name: user.name })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(shown) })).toBeVisible();
  await expect(page.getByText(hidden)).toHaveCount(0);
});

test("a person nobody is shows that they cannot be found", async ({ page }) => {
  await gotoHydrated(page, "/u/test_nobody");
  await expect(page.getByText("利用者が見つかりません")).toBeVisible();
});
