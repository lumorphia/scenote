import { createDraftStore, idbKeyValue } from "@lumorphia/editor-engine";
import type { EditorDestination, EditorHost } from "@lumorphia/editor-react";
import type { PendingPost } from "../post-form/pending.ts";

/**
 * 現像の下書きの置き場所 (IndexedDB)。名前を変えると利用者の下書きが読めなくなる (lumorphia/editor の ADR-0009)。
 * prismtone (prismtone-editor)・単独アプリ (lumorphia-editor) とはオリジンも名前も分ける
 */
export const SCENOTE_EDITOR_IDB = { dbName: "scenote-editor", storeName: "kv" } as const;

/** 「Scenoteへ投稿」の送り先の id */
export const POST_DESTINATION_ID = "scenote-post";

/** 「Scenoteへ投稿」: 書き出した画像を端末に置いて、投稿画面へ進む。ログインに出ても失わない */
export function postDestination(options: {
  save: (pending: PendingPost) => Promise<void>;
  goToPostForm: () => void;
}): EditorDestination {
  return {
    id: POST_DESTINATION_ID,
    label: { ja: "Scenoteへ投稿", en: "Post to Scenote" },
    primary: true,
    async send({ blob, recipe, original, draftId }) {
      await options.save({
        draftId,
        blob,
        recipe,
        lastModified: original instanceof File ? original.lastModified : null,
        createdAt: Date.now(),
      });
      options.goToPostForm();
    },
  };
}

/** Scenote の /edit が渡すホスト。表示は日本語だけ (要件定義書 17 章) */
export function scenoteEditorHost(options: {
  initialDraftId: string | null;
  onInitialDraftConsumed: () => void;
  goToPostForm: () => void;
  /** テストで差し替える。既定は IndexedDB (post-form/pending.ts) */
  savePending?: (pending: PendingPost) => Promise<void>;
}): EditorHost {
  return {
    locale: "ja",
    drafts: createDraftStore(idbKeyValue(SCENOTE_EDITOR_IDB.dbName, SCENOTE_EDITOR_IDB.storeName)),
    initialDraftId: options.initialDraftId,
    onInitialDraftConsumed: options.onInitialDraftConsumed,
    destinations: [
      postDestination({
        save:
          options.savePending ??
          (async (pending) => (await import("../post-form/pending.ts")).savePendingPost(pending)),
        goToPostForm: options.goToPostForm,
      }),
    ],
    download: { fileSuffix: "-scenote" },
    testHook: {
      globalName: "__scenoteEditor",
      enabled: () => Boolean((window as { __SCENOTE_E2E__?: boolean }).__SCENOTE_E2E__),
    },
  };
}
