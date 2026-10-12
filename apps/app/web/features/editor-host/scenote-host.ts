import { createDraftStore, idbKeyValue } from "@lumorphia/editor-engine";
import type { EditorHost } from "@lumorphia/editor-react";

/**
 * 現像の下書きの置き場所 (IndexedDB)。名前を変えると利用者の下書きが読めなくなる (lumorphia/editor の ADR-0009)。
 * prismtone (prismtone-editor)・単独アプリ (lumorphia-editor) とはオリジンも名前も分ける
 */
export const SCENOTE_EDITOR_IDB = { dbName: "scenote-editor", storeName: "kv" } as const;

/**
 * Scenote の /edit が渡すホスト。表示は日本語だけ (要件定義書 17 章)。
 * 「Scenoteへ投稿」の送り先は投稿の段 (docs/plan.md の S5) で足す。それまでは「端末に保存」だけ
 */
export function scenoteEditorHost(options: {
  initialDraftId: string | null;
  onInitialDraftConsumed: () => void;
}): EditorHost {
  return {
    locale: "ja",
    drafts: createDraftStore(idbKeyValue(SCENOTE_EDITOR_IDB.dbName, SCENOTE_EDITOR_IDB.storeName)),
    initialDraftId: options.initialDraftId,
    onInitialDraftConsumed: options.onInitialDraftConsumed,
    destinations: [],
    download: { fileSuffix: "-scenote" },
    testHook: {
      globalName: "__scenoteEditor",
      enabled: () => Boolean((window as { __SCENOTE_E2E__?: boolean }).__SCENOTE_E2E__),
    },
  };
}
