import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE } from "@lumorphia/editor-recipe";
import {
  POST_DESTINATION_ID,
  SCENOTE_EDITOR_IDB,
  postDestination,
  scenoteEditorHost,
} from "./scenote-host.ts";

describe("SCENOTE_EDITOR_IDB", () => {
  it("keeps Scenote's drafts under a name of its own", () => {
    expect(SCENOTE_EDITOR_IDB).toEqual({ dbName: "scenote-editor", storeName: "kv" });
  });
});

describe("scenoteEditorHost", () => {
  const host = scenoteEditorHost({
    initialDraftId: "d1",
    onInitialDraftConsumed: () => {},
    goToPostForm: () => {},
  });

  it("shows the editor in Japanese", () => {
    expect(host.locale).toBe("ja");
  });

  it("offers posting to Scenote as the main destination", () => {
    expect(host.destinations.map((d) => [d.id, d.label.ja, d.primary])).toEqual([
      [POST_DESTINATION_ID, "Scenoteへ投稿", true],
    ]);
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

describe("postDestination", () => {
  const blob = new Blob([new Uint8Array([1])], { type: "image/webp" });

  it("keeps the image for the post form and goes there", async () => {
    const saved: unknown[] = [];
    let went = false;
    const destination = postDestination({
      save: async (pending) => {
        saved.push(pending);
      },
      goToPostForm: () => {
        went = true;
      },
    });
    const original = new File([new Uint8Array([2])], "test.png", {
      lastModified: 1_790_000_000_000,
    });
    await destination.send({
      blob,
      recipe: DEFAULT_RECIPE,
      original,
      sourceName: "test.png",
      draftId: "d1",
    });
    expect(saved).toEqual([
      expect.objectContaining({
        draftId: "d1",
        blob,
        recipe: DEFAULT_RECIPE,
        lastModified: 1_790_000_000_000,
      }),
    ]);
    expect(went).toBe(true);
  });

  it("has no file time when the original is not a file", async () => {
    const saved: { lastModified: number | null }[] = [];
    const destination = postDestination({
      save: async (pending) => {
        saved.push(pending);
      },
      goToPostForm: () => {},
    });
    await destination.send({
      blob,
      recipe: DEFAULT_RECIPE,
      original: blob,
      sourceName: "x",
      draftId: "d2",
    });
    expect(saved[0]!.lastModified).toBeNull();
  });
});
