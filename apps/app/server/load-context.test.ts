import { describe, expect, it } from "vitest";
import { absoluteUrl } from "./load-context.ts";

// SSR の loader に渡すもの (S6e、ADR-0018)
describe("absoluteUrl", () => {
  it("keeps an image URL that is already absolute", () => {
    expect(absoluteUrl("https://img.example.invalid/a.jpg", "https://site.example.invalid")).toBe(
      "https://img.example.invalid/a.jpg",
    );
  });

  it("puts the site in front of a path (the app serves the images in development)", () => {
    expect(absoluteUrl("/_storage/a.jpg", "https://site.example.invalid/")).toBe(
      "https://site.example.invalid/_storage/a.jpg",
    );
  });
});
