/**
 * *.lumorphia.test は Chromium の起動オプション (--host-resolver-rules) で 127.0.0.1 に向けている (playwright.config.ts)。
 * ブラウザを通さない `request` フィクスチャ (Node から送る) にはこれが効かず、名前を引けない。
 * API はページから叩く (page.goto や page.evaluate の fetch)
 */
import { expect, type Page } from "@playwright/test";

/** hydration が終わるまで待つ。root の App が html に data-hydrated を付ける */
export async function waitForHydration(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** page.goto して hydration まで待つ。直後にクリックや入力をするときはこちら */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}

/** テスト画像 (4 色のブロック、200x100)。運営者以外の人のデータを入れないよう、画像はテストの中で作る */
export async function makePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 100;
    const ctx = c.getContext("2d")!;
    ["rgb(200,40,60)", "rgb(40,180,80)", "rgb(50,90,220)", "rgb(128,128,128)"].forEach(
      (color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * 50, 0, 50, 100);
      },
    );
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

export async function openEditorWithImage(page: Page) {
  await gotoHydrated(page, "/edit");
  const png = await makePng(page);
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "scene.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "端末に保存" })).toBeEnabled();
}
