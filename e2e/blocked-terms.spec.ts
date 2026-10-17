import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { e2eOperator } from "./lumorphia.ts";
import { login, sendToPostForm } from "./posting.ts";

// 運営が足す NG 語の辞書 (docs/plan.md の S7b-2、ADR-0022)。語は実行ごとに作る

test("a word the operator adds stops a post, and deleting it lets the post through", async ({
  page,
  browser,
}) => {
  const word = `テスト語${randomUUID().slice(0, 6)}`;
  const operator = await browser.newPage();
  await login(operator, e2eOperator());
  await gotoHydrated(operator, "/admin");
  await operator.getByRole("tab", { name: /^NG 語/ }).click();
  await operator.getByLabel("この操作の理由").fill("テスト_理由");
  await operator.getByLabel("足す語").fill(word);
  await operator.getByRole("button", { name: "語を足す" }).click();
  const row = operator.getByRole("row").filter({ hasText: word });
  await expect(row).toBeVisible();

  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill(`テスト_${word}の港`);
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByText("タイトルに使えない語が含まれています")).toBeVisible();

  await row.getByRole("button", { name: "消す" }).click();
  await expect(row).toHaveCount(0);
  await operator.close();

  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/);
});

test("the operator imports a word list", async ({ browser }) => {
  const words = [0, 1].map(() => `テスト辞書${randomUUID().slice(0, 6)}`);
  const operator = await browser.newPage();
  try {
    await login(operator, e2eOperator());
    await gotoHydrated(operator, "/admin");
    await operator.getByRole("tab", { name: /^NG 語/ }).click();
    await operator.getByLabel("この操作の理由").fill("テスト_理由");
    await operator.getByText("辞書をまとめて入れる").click();
    await operator.getByLabel("辞書 (1 行 1 語)").fill(words.join("\n"));
    await operator.getByLabel("辞書の名前").fill("test-dictionary");
    await operator.getByRole("button", { name: "辞書を入れる" }).click();
    await expect(operator.getByText("2 語を足しました")).toBeVisible();
  } finally {
    await operator.close();
  }
});
