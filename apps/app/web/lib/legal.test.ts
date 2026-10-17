import { describe, expect, it } from "vitest";
import { legalPage } from "./legal.ts";

// 規約の本文 (ADR-0023)。docs/legal/*.md を取り込んで HTML にする
describe("legalPage", () => {
  it.each([
    ["terms", "利用規約"],
    ["privacy", "プライバシーポリシー"],
  ] as const)("turns %s into HTML with its version", (key, heading) => {
    const page = legalPage(key);
    expect(page.version).toMatch(/^\d+\.\d+$/);
    expect(page.html).toContain(`<h1>${heading}</h1>`);
  });
});
