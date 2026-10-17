import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import type { Browser } from "@playwright/test";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { e2eOperator } from "./lumorphia.ts";
import { asSomeoneElse, login, post } from "./posting.ts";

// 通報と運営の対応 (docs/plan.md の S7b-1、ADR-0021)

async function asOperator(browser: Browser, tab: "通報" | "非表示") {
  const operator = await browser.newPage();
  await login(operator, e2eOperator());
  await gotoHydrated(operator, "/admin");
  await operator.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
  return operator;
}

test("someone reports a photo, and the operator hides and then restores it", async ({
  page,
  browser,
}) => {
  const title = `テスト_通報_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  const url = page.url();

  const reporter = await asSomeoneElse(browser, url);
  try {
    await reporter.getByRole("button", { name: "通報する" }).click();
    await reporter.getByRole("radio", { name: /写り込/ }).check();
    await reporter.getByLabel("詳しく (任意)").fill("テスト_自分が写っています");
    await reporter.getByRole("button", { name: "通報を送る" }).click();
    await expect(reporter.getByText("通報を受け付けました")).toBeVisible();
  } finally {
    await reporter.close();
  }

  const operator = await asOperator(browser, "通報");
  try {
    const item = operator.getByRole("article").filter({ hasText: title });
    await expect(item).toContainText("テスト_自分が写っています");
    await item.getByLabel("理由").fill("テスト_写り込み");
    await item.getByRole("button", { name: "非表示にする" }).click();
    await expect(item).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("post-hidden")).toBeVisible();

    await operator.getByRole("tab", { name: /^非表示/ }).click();
    const hidden = operator.getByRole("article").filter({ hasText: title });
    await hidden.getByLabel("理由").fill("テスト_誤り");
    await hidden.getByRole("button", { name: "公開に戻す" }).click();
    await expect(hidden).toHaveCount(0);
  } finally {
    await operator.close();
  }
  await page.reload();
  await expect(page.getByTestId("post-hidden")).toHaveCount(0);
});

test("the operator dismisses a report and the photo stays", async ({ page, browser }) => {
  const title = `テスト_退ける_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  const reporter = await asSomeoneElse(browser, page.url());
  try {
    await reporter.getByRole("button", { name: "通報する" }).click();
    await reporter.getByRole("radio", { name: /規約/ }).check();
    await reporter.getByRole("button", { name: "通報を送る" }).click();
    await expect(reporter.getByText("通報を受け付けました")).toBeVisible();
  } finally {
    await reporter.close();
  }
  const operator = await asOperator(browser, "通報");
  try {
    const item = operator.getByRole("article").filter({ hasText: title });
    await item.getByLabel("理由").fill("テスト_問題なし");
    await item.getByRole("button", { name: "退ける" }).click();
    await expect(item).toHaveCount(0);
  } finally {
    await operator.close();
  }
  await page.reload();
  await expect(page.getByTestId("post-hidden")).toHaveCount(0);
});

test("a visitor is asked to log in to report", async ({ page, browser }) => {
  await login(page, lumorphiaUser());
  await post(page);
  const visitor = await browser.newPage();
  try {
    await gotoHydrated(visitor, new URL(page.url()).pathname);
    await visitor.getByRole("button", { name: "通報する" }).click();
    await expect(visitor.getByRole("link", { name: "ログインして通報する" })).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test("the owner is not offered to report their own photo", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page);
  await expect(page.getByRole("button", { name: "通報する" })).toHaveCount(0);
});
