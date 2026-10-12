import type { Browser, Page } from "@playwright/test";
import { approveLumorphia, lumorphiaUser, type MockLumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated, openEditorWithImage } from "./helpers.ts";
import { LUMORPHIA } from "./lumorphia.ts";

// 現像から投稿まで (docs/plan.md の S5b、ADR-0011)。画像はテストの中で作る

async function login(page: Page, user: MockLumorphiaUser) {
  await approveLumorphia(page, user, LUMORPHIA);
  await gotoHydrated(page, "/");
  await page.getByRole("link", { name: "ログイン" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText(`@${user.handle}`);
}

async function sendToPostForm(page: Page) {
  await openEditorWithImage(page);
  await page.getByRole("button", { name: "Scenoteへ投稿" }).click();
  await expect(page).toHaveURL(/\/post\/new$/);
  await expect(page.getByTestId("post-preview")).toBeVisible();
}

test("a developed photo can be posted and appears once it is ready", async ({ page }) => {
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill("テスト_夕焼けの港");
  await page.getByLabel("ひとこと (任意)").fill("テスト_本文");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("post-image")).toBeVisible();
  await expect(page.getByRole("heading", { name: "テスト_夕焼けの港" })).toBeVisible();
  await expect(page.getByText("テスト_本文")).toBeVisible();
});

test("the day the photo was taken starts from the file's date", async ({ page }) => {
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await expect(page.getByLabel("撮影日 (任意)")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
});

test("the post form asks for consent from others in the photo", async ({ page }) => {
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await expect(page.getByText("他の人が写っている場合は、本人の了承を得てください")).toBeVisible();
});

test("a visitor logs in from the post form and keeps the photo", async ({ page }) => {
  const user = lumorphiaUser();
  await sendToPostForm(page);
  await approveLumorphia(page, user, LUMORPHIA);
  await page.getByRole("link", { name: "ログインして投稿する" }).click();
  await expect(page).toHaveURL(/\/post\/new$/);
  await expect(page.getByTestId("post-preview")).toBeVisible();
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
});

test("the post form without a photo leads back to the editor", async ({ page }) => {
  await gotoHydrated(page, "/post/new");
  await expect(page.getByText("投稿する写真がありません")).toBeVisible();
  await expect(page.getByRole("link", { name: "現像する" })).toHaveAttribute("href", "/edit");
});

/** もう 1 人の利用者でログインしたページで、url を開く */
async function asSomeoneElse(browser: Browser, url: string) {
  const other = await browser.newPage();
  await login(other, lumorphiaUser());
  await other.goto(url);
  return other;
}

async function post(page: Page, visibility?: "公開" | "限定公開" | "非公開") {
  await sendToPostForm(page);
  if (visibility) await page.getByRole("radio", { name: new RegExp(`^${visibility}`) }).check();
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
}

test("a post is public unless the user chooses otherwise", async ({ page }) => {
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await expect(page.getByRole("radio", { name: /^公開/ })).toBeChecked();
});

test("someone else can see a public post", async ({ page, browser }) => {
  await login(page, lumorphiaUser());
  await post(page);
  const other = await asSomeoneElse(browser, page.url());
  try {
    await expect(other.getByTestId("post-image")).toBeVisible();
    await expect(other.getByTestId("post-visibility")).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("a private post shows its photo to the owner and nothing to others", async ({
  page,
  browser,
}) => {
  await login(page, lumorphiaUser());
  await post(page, "非公開");
  await expect(page.getByTestId("post-visibility")).toHaveText("非公開");
  await expect(page.getByTestId("post-image")).toHaveJSProperty("complete", true);
  expect(
    await page.getByTestId("post-image").evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  const other = await asSomeoneElse(browser, page.url());
  try {
    await expect(other.getByText("投稿が見つかりません")).toBeVisible();
    await expect(other.getByTestId("post-image")).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("making a post private hides it from others at once", async ({ page, browser }) => {
  await login(page, lumorphiaUser());
  await post(page);
  await page.getByRole("radio", { name: /^非公開/ }).check();
  await page.getByRole("button", { name: "公開範囲を変える" }).click();
  await expect(page.getByTestId("post-visibility")).toHaveText("非公開");
  const other = await asSomeoneElse(browser, page.url());
  try {
    await expect(other.getByText("投稿が見つかりません")).toBeVisible();
  } finally {
    await other.close();
  }
  await page.reload();
  await expect(page.getByTestId("post-image")).toBeVisible();
});

test("tags written on the form appear on the post", async ({ page }) => {
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  const tag = page.getByRole("textbox", { name: /タグ/ });
  await tag.fill("#夕焼け");
  await tag.press("Enter");
  await tag.fill("旅");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("list", { name: "付けたタグ" })).toContainText("#夕焼け");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-tags")).toHaveText(/#夕焼け\s*#旅/);
});

test("the owner can change the tags of a post", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page);
  const tag = page.getByRole("textbox", { name: /タグ/ });
  await tag.fill("夜景");
  await tag.press("Enter");
  await page.getByRole("button", { name: "タグを保存する" }).click();
  await expect(page.getByTestId("post-tags")).toHaveText("#夜景");
  await page.getByRole("button", { name: "#夜景 を外す" }).click();
  await page.getByRole("button", { name: "タグを保存する" }).click();
  await expect(page.getByTestId("post-tags")).toHaveCount(0);
});
