import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post } from "./posting.ts";

// マイページと削除 (docs/plan.md の S6d、要件定義書 15 章)

test("my page lists my posts of every visibility", async ({ page }) => {
  const open = `テスト_公開_${randomUUID().slice(0, 8)}`;
  const hidden = `テスト_非公開_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await post(page, undefined, open);
  await post(page, "非公開", hidden);
  await page.getByRole("link", { name: "自分の投稿" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("link", { name: new RegExp(open) })).toBeVisible();
  const card = page.getByRole("link", { name: new RegExp(hidden) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("非公開");
});

test("the owner can delete a post after confirming", async ({ page }) => {
  const title = `テスト_削除_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  const url = page.url();
  await page.getByRole("button", { name: "この投稿を消す" }).click();
  await expect(page.getByText("消すと元に戻せません")).toBeVisible();
  await page.getByRole("button", { name: "消す", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText(title)).toHaveCount(0);
  await gotoHydrated(page, new URL(url).pathname);
  await expect(page.getByText("投稿が見つかりません")).toBeVisible();
});

test("changing one's mind keeps the post", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page);
  await page.getByRole("button", { name: "この投稿を消す" }).click();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByText("消すと元に戻せません")).toHaveCount(0);
  await expect(page.getByTestId("post-image")).toBeVisible();
});

test("my page asks a visitor to log in", async ({ page }) => {
  await gotoHydrated(page, "/me");
  await expect(page.getByText("ログインすると、自分の投稿を見られます")).toBeVisible();
});
