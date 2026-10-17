import { describe, expect, it } from "vitest";
import { readLegalVersions } from "./legal.ts";

// 規約とプライバシーポリシーの今の版 (docs/legal/*.md の frontmatter。ADR-0023)
describe("readLegalVersions", () => {
  it("reads the versions of the terms and the privacy policy", () => {
    expect(readLegalVersions()).toEqual({
      terms: expect.stringMatching(/^\d+\.\d+$/),
      privacy: expect.stringMatching(/^\d+\.\d+$/),
    });
  });
});
