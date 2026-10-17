import { randomUUID } from "node:crypto";
import { lumorphiaUser } from "@lumorphia/e2e/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";
import { login, post } from "./posting.ts";

// 共有 (docs/plan.md の S6e、要件定義書 16 章)。リンクのプレビューは JavaScript を動かさないので、SSR の HTML を見る

/** JavaScript を動かさずに読んだ HTML (ログインの Cookie を付けない) の meta の content */
async function metaOf(page: Page, url: string, key: string): Promise<string | null> {
  const html = await page.evaluate(
    (u) => fetch(u, { credentials: "omit" }).then((r) => r.text()),
    url,
  );
  return page.evaluate(
    ([h, k]) => {
      const doc = new DOMParser().parseFromString(h!, "text/html");
      const el = doc.querySelector(`meta[property="${k}"], meta[name="${k}"]`);
      return el?.getAttribute("content") ?? null;
    },
    [html, key] as const,
  );
}

test("a public post shows its photo large when the URL is shared", async ({ page }) => {
  const title = `テスト_共有_${randomUUID().slice(0, 8)}`;
  await login(page, lumorphiaUser());
  await post(page, undefined, title);
  const url = page.url();
  expect(await metaOf(page, url, "og:title")).toBe(title);
  expect(await metaOf(page, url, "og:url")).toBe(url);
  expect(await metaOf(page, url, "twitter:card")).toBe("summary_large_image");
  expect(await metaOf(page, url, "robots")).toBeNull();
  const image = (await metaOf(page, url, "og:image"))!;
  const res = await page.evaluate(
    (u) => fetch(u).then((r) => ({ status: r.status, type: r.headers.get("content-type") })),
    image,
  );
  expect(res).toEqual({ status: 200, type: "image/jpeg" });
});

test("an unlisted post is shared but kept out of search engines", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page, "限定公開");
  expect(await metaOf(page, page.url(), "og:image")).not.toBeNull();
  expect(await metaOf(page, page.url(), "robots")).toBe("noindex");
});

test("a private post shares nothing", async ({ page }) => {
  await login(page, lumorphiaUser());
  await post(page, "非公開");
  expect(await metaOf(page, page.url(), "og:image")).toBeNull();
  expect(await metaOf(page, page.url(), "robots")).toBe("noindex");
});
