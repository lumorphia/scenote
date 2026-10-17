import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login, post } from "./posting.ts";

// 投稿一覧 (docs/plan.md の S6a、ADR-0016)。E2E の DB はほかのテストと同じなので、自分の投稿をタイトルで探す

test("a public post appears at the top of the list and leads to its page", async ({ page }) => {
  const user = lumorphiaUser();
  const title = `テスト_一覧_${randomUUID().slice(0, 8)}`;
  await login(page, user);
  await post(page, undefined, title);
  const url = page.url();
  await gotoHydrated(page, "/");
  const card = page.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await expect(card).toContainText(`@${user.handle}`);
  await expect(card.getByRole("img")).toHaveJSProperty("complete", true);
  await card.click();
  await expect(page).toHaveURL(url);
});

test("unlisted and private posts stay out of the list", async ({ page }) => {
  await login(page, lumorphiaUser());
  const unlisted = `テスト_限定_${randomUUID().slice(0, 8)}`;
  const hidden = `テスト_非公開_${randomUUID().slice(0, 8)}`;
  await post(page, "限定公開", unlisted);
  await post(page, "非公開", hidden);
  await gotoHydrated(page, "/");
  await expect(page.getByTestId("post-list")).toBeVisible();
  await expect(page.getByText(unlisted)).toHaveCount(0);
  await expect(page.getByText(hidden)).toHaveCount(0);
});
