import { describe, expect, it } from "vitest";
import { SCENOTE_EDITOR_IDB, scenoteEditorHost } from "./scenote-host.ts";

describe("SCENOTE_EDITOR_IDB", () => {
  it("keeps Scenote's drafts under a name of its own", () => {
    expect(SCENOTE_EDITOR_IDB).toEqual({ dbName: "scenote-editor", storeName: "kv" });
  });
});

describe("scenoteEditorHost", () => {
  const host = scenoteEditorHost({ initialDraftId: "d1", onInitialDraftConsumed: () => {} });

  it("shows the editor in Japanese", () => {
    expect(host.locale).toBe("ja");
  });

  it("offers only saving to the device until posting is connected", () => {
    expect(host.destinations).toEqual([]);
  });

  it("reopens the draft it was given", () => {
    expect(host.initialDraftId).toBe("d1");
  });

  it("names saved files with the -scenote suffix", () => {
    expect(host.download?.fileSuffix).toBe("-scenote");
  });

  it("exposes the E2E hook under the name the specs read", () => {
    expect(host.testHook?.globalName).toBe("__scenoteEditor");
  });
});
