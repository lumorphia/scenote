import { describe, expect, it } from "vitest";
import { loginErrorMessage, loginHref, safeNext } from "./login.ts";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/edit")).toBe("/edit");
  });

  it.each([null, "https://evil.example/", "//evil.example/", "/\\evil.example/"])(
    "falls back to the top page for %s",
    (input) => {
      expect(safeNext(input)).toBe("/");
    },
  );
});

describe("loginHref", () => {
  it("starts the login and comes back to the page", () => {
    expect(loginHref("/edit?draft=1")).toBe("/api/lumorphia/login?next=%2Fedit%3Fdraft%3D1");
  });
});

describe("loginErrorMessage", () => {
  it("asks to log in again when the login took too long", () => {
    expect(loginErrorMessage("state_mismatch")).toMatch(/時間が経った/);
  });

  it("says login is not available when Lumorphia is not connected", () => {
    expect(loginErrorMessage("login_unavailable")).toMatch(/いまはログインできません/);
  });

  it("says the login failed for any other reason", () => {
    expect(loginErrorMessage("something_else")).toMatch(/^ログインできませんでした/);
  });

  it("says nothing without an error", () => {
    expect(loginErrorMessage(null)).toBeNull();
  });
});
