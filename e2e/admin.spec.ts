import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { e2eOperator } from "./lumorphia.ts";
import { login } from "./posting.ts";

// 管理画面の入口 (docs/plan.md の S7a、ADR-0019)

test("an operator on the list opens the admin page", async ({ page }) => {
  await login(page, e2eOperator());
  await gotoHydrated(page, "/admin");
  await expect(page.getByRole("heading", { name: "運営" })).toBeVisible();
});

test("anyone else finds no admin page", async ({ page }) => {
  await login(page, lumorphiaUser());
  await gotoHydrated(page, "/admin");
  await expect(page.getByText("ページが見つかりません")).toBeVisible();
  await expect(page.getByRole("heading", { name: "運営" })).toHaveCount(0);
});
