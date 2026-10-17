import type { Browser, Page } from "@playwright/test";
import { approveLumorphia, lumorphiaUser, type MockLumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect } from "./test.ts";
import { gotoHydrated, openEditorWithImage } from "./helpers.ts";
import { LUMORPHIA } from "./lumorphia.ts";

/**
 * 偽の発行元で user を承認し、トップからログインする。既定で規約への同意まで済ませる (ADR-0023)。
 * E2E の DB は実行をまたいで残るので、もう同意している人 (運営者など) もいる。要るときだけ同意する
 */
export async function login(
  page: Page,
  user: MockLumorphiaUser,
  { consent = true }: { consent?: boolean } = {},
) {
  await approveLumorphia(page, user, LUMORPHIA);
  await gotoHydrated(page, "/");
  await page.getByRole("link", { name: "ログイン" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText(`@${user.handle}`);
  if (!consent) return;
  const me = await page.evaluate(() =>
    fetch("/api/me").then((r) => r.json() as Promise<{ user: { needsConsent: boolean } | null }>),
  );
  if (!me.user?.needsConsent) return;
  await gotoHydrated(page, "/welcome");
  await page.getByLabel("15 歳以上です").check();
  await page.getByLabel("利用規約とプライバシーポリシーに同意します").check();
  await page.getByRole("button", { name: "同意して始める" }).click();
  await expect(page).not.toHaveURL(/\/welcome/);
}

/** 現像の画面に画像を入れて、投稿画面に進む */
export async function sendToPostForm(page: Page, colors?: readonly string[]) {
  await openEditorWithImage(page, colors);
  await page.getByRole("button", { name: "Scenoteへ投稿" }).click();
  await expect(page).toHaveURL(/\/post\/new$/);
  await expect(page.getByTestId("post-preview")).toBeVisible();
}

/** もう 1 人の利用者でログインしたページで、url を開く */
export async function asSomeoneElse(browser: Browser, url: string) {
  const other = await browser.newPage();
  await login(other, lumorphiaUser());
  await other.goto(url);
  return other;
}

/** 投稿して、仕上がった投稿のページまで進む */
export async function post(
  page: Page,
  visibility?: "公開" | "限定公開" | "非公開",
  title?: string,
) {
  await sendToPostForm(page);
  if (title) await page.getByLabel("タイトル (任意)").fill(title);
  if (visibility) await page.getByRole("radio", { name: new RegExp(`^${visibility}`) }).check();
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
}
