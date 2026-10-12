import { randomBytes } from "node:crypto";

/**
 * Scenote のオブジェクトのキーの付け方。境界 (ObjectStorage) と実装は @lumorphia/storage にある。
 * tmp/ は受け取った画像の一時置き場で、派生画像を作ったら消す (ADR-0003)
 */
export const TMP_PREFIX = "tmp/";
export const POSTS_PREFIX = "posts/";

export const tmpKey = (uploadId: string) => `${TMP_PREFIX}${uploadId}`;

/** 派生画像のキーの頭。投稿 ID に推測できない値を足す (限定公開の画像 URL のため。ADR-0004) */
export const newImageKeyBase = (postId: string) =>
  `${POSTS_PREFIX}${postId}/${randomBytes(16).toString("base64url")}`;

export type Variant = "display" | "thumb";
export const variantKey = (base: string, variant: Variant) => `${base}/${variant}.webp`;
