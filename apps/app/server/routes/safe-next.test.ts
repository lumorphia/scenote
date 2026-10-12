import { describe, expect, it } from "vitest";
import { safeNext } from "./lumorphia.ts";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/edit?draft=1")).toBe("/edit?draft=1");
  });

  it("falls back to the top page without a path", () => {
    expect(safeNext(undefined)).toBe("/");
  });

  it.each(["https://evil.example/", "//evil.example/", "/\\evil.example/", "edit"])(
    "does not leave the site for %s",
    (input) => {
      expect(safeNext(input)).toBe("/");
    },
  );
});
