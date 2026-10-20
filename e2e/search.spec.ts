import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post, sendToPostForm } from "./posting.ts";

// 写真を探す (/posts、docs/plan.md の S6f、ADR-0028。lumorphia/prismtone の /posts と同じ形)。
// E2E の DB はほかのテストと同じなので、印の付いた言葉で探す

const marker = () => `テスト検索${randomUUID().slice(0, 8)}`;
const search = (word: string) => `/posts?q=${encodeURIComponent(word)}`;

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
  await expect(page).toHaveURL(/\/posts\?q=/);
  // URL は描き替えより先に変わる。トップの表紙にも同じ写真が出るので、検索のページに移ってから見る
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("写真を探す");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByTestId("search-results-count")).toHaveText("1件の写真");
  await expect(page.getByText(`テスト_${word}の非公開`)).toHaveCount(0);
});

test("a word finds a photo by its place, and the place filter narrows the results", async ({
  page,
}) => {
  const word = marker();
  const there = `テスト_${word}_中央`;
  const elsewhere = `テスト_${word}_ほか`;
  await login(page, lumorphiaUser());
  await postAt(page, there, { region: "ラノシア", name: "中央ラノシア" });
  await postAt(page, elsewhere, null);

  await gotoHydrated(page, search(word));
  await expect(page.getByRole("link", { name: new RegExp(there) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(elsewhere) })).toBeVisible();

  await page
    .getByTestId("search-filter-sidebar")
    .getByTestId("filter-place")
    .selectOption({ label: "中央ラノシア" });
  await expect(page).toHaveURL(/place=/);
  await expect(page.getByRole("button", { name: "地点 中央ラノシア の条件を外す" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(there) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(elsewhere) })).toHaveCount(0);
});

test("a condition can be taken off from the chips above the results", async ({ page }) => {
  const word = marker();
  const title = `テスト_${word}_タグなし`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  await gotoHydrated(page, `${search(word)}&tag=${encodeURIComponent("テスト_無いタグ")}`);
  await expect(page.getByTestId("post-grid-empty")).toHaveText(
    "条件に合う公開の写真はありません。",
  );
  await page.getByRole("button", { name: "タグ #テスト_無いタグ の条件を外す" }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("on a narrow screen the filters open in a dialog and apply together", async ({ page }) => {
  const word = marker();
  const there = `テスト_${word}_狭い画面`;
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, lumorphiaUser());
  await postAt(page, there, { region: "ラノシア", name: "中央ラノシア" });

  await gotoHydrated(page, search(word));
  await expect(page.getByTestId("search-filter-sidebar")).toBeHidden();
  await page.getByTestId("search-filter-trigger").click();
  const dialog = page.getByTestId("search-filter-dialog");
  await dialog.getByTestId("filter-place").selectOption({ label: "中央ラノシア" });
  // ダイアログの中では「この条件で探す」まで当てない
  await expect(page).not.toHaveURL(/place=/);
  await dialog.getByTestId("search-filter-apply").click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/place=/);
  await expect(page.getByRole("link", { name: new RegExp(there) })).toBeVisible();
});

test("the header leads to the page to find photos", async ({ page }) => {
  await gotoHydrated(page, "/");
  await page.getByRole("banner").getByRole("link", { name: "写真を探す" }).first().click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("写真を探す");
});
