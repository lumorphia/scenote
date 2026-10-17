import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { e2eOperator } from "./lumorphia.ts";
import { asSomeoneElse, login, sendToPostForm } from "./posting.ts";

// 保留・要確認の投稿の確認 (docs/plan.md の S7a-2、ADR-0020)。E2E の判定器は赤一色を保留にする

async function postHeld(page: Page, title: string) {
  await login(page, lumorphiaUser());
  await sendToPostForm(page, ["rgb(255,0,0)"]);
  await page.getByLabel("タイトル (任意)").fill(title);
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-held")).toBeVisible();
}

/** 運営としてログインし、確認待ちの中の title の投稿を開く */
async function asOperator(browser: Browser, title: string) {
  const operator = await browser.newPage();
  await login(operator, e2eOperator());
  await gotoHydrated(operator, "/admin");
  const item = operator.getByRole("article").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item.getByRole("img")).toHaveJSProperty("complete", true);
  return { operator, item };
}

test("an operator publishes a held photo", async ({ page, browser }) => {
  const title = `テスト_保留_${randomUUID().slice(0, 8)}`;
  await postHeld(page, title);
  const { operator, item } = await asOperator(browser, title);
  try {
    await item.getByLabel("理由").fill("テスト_問題なし");
    await item.getByRole("button", { name: "公開する" }).click();
    await expect(item).toHaveCount(0);
  } finally {
    await operator.close();
  }
  const other = await asSomeoneElse(browser, page.url());
  try {
    await expect(other.getByRole("heading", { name: title })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("an operator hides a held photo, and the owner is told", async ({ page, browser }) => {
  const title = `テスト_非表示_${randomUUID().slice(0, 8)}`;
  await postHeld(page, title);
  const { operator, item } = await asOperator(browser, title);
  try {
    await item.getByLabel("理由").fill("テスト_規約違反");
    await item.getByRole("button", { name: "非表示にする" }).click();
    await expect(item).toHaveCount(0);
  } finally {
    await operator.close();
  }
  await page.reload();
  await expect(page.getByTestId("post-hidden")).toBeVisible();
});

test("a decision needs a reason", async ({ page, browser }) => {
  const title = `テスト_理由_${randomUUID().slice(0, 8)}`;
  await postHeld(page, title);
  const { operator, item } = await asOperator(browser, title);
  try {
    await expect(item.getByRole("button", { name: "公開する" })).toBeDisabled();
  } finally {
    await operator.close();
  }
});
