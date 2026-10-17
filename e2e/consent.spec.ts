import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { login } from "./posting.ts";

// 規約とプライバシーポリシーへの同意 (docs/plan.md の S7d、ADR-0023)

test("someone logging in for the first time agrees before going on", async ({ page }) => {
  await login(page, lumorphiaUser(), { consent: false });
  await expect(page).toHaveURL(/\/welcome/);
  const start = page.getByRole("button", { name: "同意して始める" });
  await expect(start).toBeDisabled();
  await page.getByLabel("15 歳以上です").check();
  await expect(start).toBeDisabled();
  await page.getByLabel("利用規約とプライバシーポリシーに同意します").check();
  await start.click();
  await expect(page).toHaveURL(/\/$/);
  await gotoHydrated(page, "/edit");
  await expect(page).toHaveURL(/\/edit$/);
});

test("the terms and the privacy policy are pages anyone can read", async ({ page }) => {
  await gotoHydrated(page, "/terms");
  await expect(page.getByRole("heading", { name: "利用規約", level: 1 })).toBeVisible();
  await expect(page.getByText(/^版 \d+\.\d+/)).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "プライバシーポリシー" }).click();
  await expect(page.getByRole("heading", { name: "プライバシーポリシー", level: 1 })).toBeVisible();
});

test("the welcome page links to the terms it asks agreement to", async ({ page }) => {
  await login(page, lumorphiaUser(), { consent: false });
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole("main").getByRole("link", { name: "利用規約" })).toHaveAttribute(
    "href",
    "/terms",
  );
});
