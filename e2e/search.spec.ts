import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post, sendToPostForm } from "./posting.ts";

// 検索 (docs/plan.md の S6f、ADR-0028)。E2E の DB はほかのテストと同じなので、印の付いた言葉で探す

const marker = () => `テスト検索${randomUUID().slice(0, 8)}`;

async function postAt(page: Page, title: string, place: { region: string; name: string } | null) {
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill(title);
  if (place) {
    await page.getByRole("combobox", { name: "地域" }).selectOption(place.region);
    await page
      .getByRole("combobox", { name: "場所", exact: true })
      .selectOption({ label: place.name });
  }
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
}

test("the search box on the top page finds a photo by a word in its title", async ({ page }) => {
  const word = marker();
  const title = `テスト_${word}の夕暮れ`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  await post(page, "非公開", `テスト_${word}の非公開`);
  await gotoHydrated(page, "/");
  await page.getByRole("searchbox", { name: "写真を探す" }).fill(word);
  await page.getByRole("searchbox", { name: "写真を探す" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByText(`テスト_${word}の非公開`)).toHaveCount(0);
});

test("a word finds a photo by its place, and the place list narrows the results", async ({
  page,
}) => {
  const word = marker();
  const there = `テスト_${word}_中央`;
  const elsewhere = `テスト_${word}_ほか`;
  await login(page, lumorphiaUser());
  await postAt(page, there, { region: "ラノシア", name: "中央ラノシア" });
  await postAt(page, elsewhere, null);

  await gotoHydrated(page, `/search?q=${encodeURIComponent(word)}`);
  await expect(page.getByRole("link", { name: new RegExp(there) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(elsewhere) })).toBeVisible();

  await page.getByRole("combobox", { name: "地点" }).selectOption({ label: "中央ラノシア" });
  await page.getByRole("button", { name: "探す" }).click();
  await expect(page).toHaveURL(/place=/);
  await expect(page.getByRole("link", { name: new RegExp(there) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(elsewhere) })).toHaveCount(0);
});

test("a tag in the search can be taken off", async ({ page }) => {
  const word = marker();
  const title = `テスト_${word}_タグなし`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  await gotoHydrated(
    page,
    `/search?q=${encodeURIComponent(word)}&tag=${encodeURIComponent("テスト_無いタグ")}`,
  );
  await expect(page.getByText("当てはまる公開の写真はありません。")).toBeVisible();
  await page.getByRole("link", { name: "タグ #テスト_無いタグ を外す" }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("the header leads to the search page", async ({ page }) => {
  await gotoHydrated(page, "/");
  await page.getByRole("banner").getByRole("link", { name: "写真を探す" }).first().click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("写真を探す");
});
