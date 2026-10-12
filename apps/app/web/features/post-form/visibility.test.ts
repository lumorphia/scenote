import { describe, expect, it } from "vitest";
import { VISIBILITY_OPTIONS, visibilityLabel } from "./visibility.ts";

describe("VISIBILITY_OPTIONS", () => {
  it("offers public first, then unlisted and private", () => {
    expect(VISIBILITY_OPTIONS.map((o) => o.value)).toEqual(["public", "unlisted", "private"]);
  });

  it("names each choice in Japanese", () => {
    expect(visibilityLabel("unlisted")).toBe("限定公開");
  });
});
