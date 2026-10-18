import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, sendToPostForm } from "./posting.ts";

test("the album hero keeps photos inside a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await gotoHydrated(page, "/");
  await expect(page.getByTestId("journal-album")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a theme choice survives a page reload", async ({ page }) => {
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "ダークテーマに切り替える" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("an area map leads to a public photo taken there", async ({ page }) => {
  const title = `テスト_地図_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await sendToPostForm(page);
  await page.getByLabel("タイトル (任意)").fill(title);
  await page
    .getByRole("combobox", { name: "地域", exact: true })
    .selectOption({ label: "ラノシア" });
  await page
    .getByRole("combobox", { name: "場所", exact: true })
    .selectOption({ label: "中央ラノシア" });
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByTestId("post-image")).toBeVisible();
  const url = page.url();
  await expect(
    page.locator("#location").getByRole("img", { name: "中央ラノシアのエリアマップ" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "写真を拡大する" }).click();
  await expect(page.getByRole("dialog", { name: "拡大した写真" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await gotoHydrated(page, "/#map");
  const map = page.locator("#map");
  await map.getByRole("combobox", { name: "地域", exact: true }).selectOption("ラノシア");
  await map
    .getByRole("combobox", { name: "エリア", exact: true })
    .selectOption({ label: "中央ラノシア" });
  await expect(map.getByRole("img", { name: "中央ラノシアのエリアマップ" })).toBeVisible();
  const mapImage = map.getByRole("img", { name: "中央ラノシアのエリアマップ" });
  const before = await mapImage.evaluate((el) => el.getBoundingClientRect().width);
  await map.getByRole("button", { name: "地図を拡大する" }).click();
  await expect
    .poll(() => mapImage.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(before);
  await map.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(url);
});
