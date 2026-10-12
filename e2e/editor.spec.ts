import { expect, test } from "./test.ts";
import { gotoHydrated, openEditorWithImage } from "./helpers.ts";

// 現像は @lumorphia/editor-* (lumorphia/editor)。描画・マスク・推論そのものの E2E はあちらにあり、ここでは
// Scenote に組み込んだつなぎ目だけを確かめる: cross-origin isolation、CSP の下での Worker と WASM、
// /models/ の配信、UI のクラスが CSS に入っていること (lumorphia/editor の ADR-0009)

test("the top page leads to the editor", async ({ page }) => {
  await gotoHydrated(page, "/");
  await page.getByRole("link", { name: "現像する" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole("button", { name: "画像を開く" })).toBeVisible();
});

test("the editor page is cross-origin isolated", async ({ page }) => {
  await gotoHydrated(page, "/edit");
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
});

test("other pages are not cross-origin isolated", async ({ page }) => {
  await gotoHydrated(page, "/");
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false);
});

test("an opened image can be saved to the device", async ({ page }) => {
  await openEditorWithImage(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "端末に保存" }).click();
  expect((await download).suggestedFilename()).toMatch(/-scenote\.(webp|jpe?g)$/);
});

test("the editor canvas takes over touch gestures from the page", async ({ page }) => {
  // Tailwind が node_modules の editor-react を走査していないと touch-none が CSS に入らない
  await gotoHydrated(page, "/edit");
  await expect(page.getByTestId("canvas-host")).toHaveCSS("touch-action", "none");
});

test("face detection runs in the browser with Scenote's /models/ and sends nothing out", async ({
  page,
}) => {
  // 顔の認識のモデル (WASM) の読み込みを待つ。遅い CI では読み込みだけで 20 秒近くかかる (lumorphia/editor と同じ)
  test.setTimeout(180_000);
  const foreign: string[] = [];
  page.on("request", (req) => {
    if (
      new URL(req.url()).hostname !== "scenote.lumorphia.test" &&
      !/^(data|blob):/.test(req.url())
    )
      foreign.push(req.url());
  });
  const failures: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /detection failed/.test(msg.text())) failures.push(msg.text());
  });
  await openEditorWithImage(page);
  await page.getByRole("tab", { name: "部分補正" }).click();
  // 色のブロックに顔は無い。検出が最後まで走れば「自動選択できませんでした」、モデルや Worker が
  // 読めなければ "face detection failed" が console に出る
  await page.getByRole("button", { name: "美肌", exact: true }).click();
  await expect(page.getByTestId("local-notice")).toContainText("自動選択できませんでした", {
    timeout: 60_000,
  });
  expect(failures).toEqual([]);
  expect(foreign).toEqual([]);
});
