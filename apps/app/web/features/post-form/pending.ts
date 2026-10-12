import { createStore, del, get, set } from "idb-keyval";
import { upgradeStoredRecipe, type EditRecipe } from "@lumorphia/editor-recipe";
import { SCENOTE_EDITOR_IDB } from "../editor-host/scenote-host.ts";

/** 現像から投稿画面へ渡す、書き出した画像。1 投稿 1 枚なので 1 つだけ持つ */
export type PendingPost = {
  draftId: string;
  blob: Blob;
  recipe: EditRecipe;
  /** 原本のファイルの更新日時 (撮影日の既定値)。ファイルでなければ null */
  lastModified: number | null;
  createdAt: number;
};

const KEY = "pending-post";
// 現像の下書きと同じ IndexedDB に同居する (名前を変えると下書きが読めなくなる)
const store = () => createStore(SCENOTE_EDITOR_IDB.dbName, SCENOTE_EDITOR_IDB.storeName);

export async function savePendingPost(pending: PendingPost): Promise<void> {
  await set(KEY, pending, store());
}

/** ログインに出て戻ってきても残っている。レシピは古い版なら今の版に読み替える */
export async function loadPendingPost(): Promise<PendingPost | null> {
  const value = await get<PendingPost>(KEY, store());
  if (!value) return null;
  const recipe = upgradeStoredRecipe(value.recipe);
  return recipe ? { ...value, recipe } : null;
}

export async function clearPendingPost(): Promise<void> {
  await del(KEY, store());
}
