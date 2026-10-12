import type { Page } from "@playwright/test";
import {
  approveLumorphia,
  lumorphiaUser,
  sendBackchannelLogout,
  type MockLumorphiaUser,
} from "@lumorphia/e2e/playwright";
import { expect, test } from "./test.ts";
import { gotoHydrated } from "./helpers.ts";
import { LUMORPHIA } from "./lumorphia.ts";

// Lumorphia でログイン・ログアウト (ADR-0009)。発行元は @lumorphia/e2e のふりで、認可の画面はその場で承認する

async function login(page: Page, user: MockLumorphiaUser) {
  await approveLumorphia(page, user, LUMORPHIA);
  await gotoHydrated(page, "/");
  await page.getByRole("link", { name: "ログイン" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText(`@${user.handle}`);
}

test("logging in with Lumorphia shows the user in the header", async ({ page }) => {
  const user = lumorphiaUser();
  await login(page, user);
  await expect(page.getByTestId("signed-in-user")).toContainText(user.name);
});

test("logging in from the editor brings the user back to the editor", async ({ page }) => {
  const user = lumorphiaUser();
  await approveLumorphia(page, user, LUMORPHIA);
  await gotoHydrated(page, "/edit");
  await page.getByRole("link", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByTestId("signed-in-user")).toContainText(`@${user.handle}`);
});

test("logging out ends the session and comes back from Lumorphia", async ({ page }) => {
  await login(page, lumorphiaUser());
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("link", { name: "ログイン" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("a logout at Lumorphia ends the Scenote session too", async ({ page }) => {
  const user = lumorphiaUser();
  await login(page, user);
  expect(await sendBackchannelLogout(page, user, LUMORPHIA)).toBe(200);
  await gotoHydrated(page, "/");
  await expect(page.getByRole("link", { name: "ログイン" })).toBeVisible();
});

test("a failed login says so and offers to try again", async ({ page }) => {
  await gotoHydrated(page, "/login?error=state_mismatch");
  await expect(page.getByRole("alert")).toContainText("ログインできませんでした");
  await expect(page.getByRole("link", { name: "Lumorphia アカウントでログイン" })).toBeVisible();
});
