import { randomBytes } from "node:crypto";

/**
 * Scenote のオブジェクトのキーの付け方。境界 (ObjectStorage) と実装は @lumorphia/storage にある。
 * tmp/ は受け取った画像の一時置き場で、派生画像を作ったら消す (ADR-0003)。
 * 公開・限定公開の画像は posts/ (配信元から誰でも読める)、非公開の画像は private/ (アプリが本人にだけ返す。ADR-0012)
 */
export const TMP_PREFIX = "tmp/";
export const POSTS_PREFIX = "posts/";
export const PRIVATE_PREFIX = "private/";

export const tmpKey = (uploadId: string) => `${TMP_PREFIX}${uploadId}`;

/** 派生画像のキーの頭。投稿 ID に推測できない値を足す (限定公開の画像 URL のため。ADR-0004) */
export const newImageKeyBase = (postId: string, visibility: "public" | "unlisted" | "private") =>
  `${visibility === "private" ? PRIVATE_PREFIX : POSTS_PREFIX}${postId}/${randomBytes(16).toString("base64url")}`;

export const isPrivateKey = (base: string) => base.startsWith(PRIVATE_PREFIX);

export type Variant = "display" | "thumb";
export const VARIANTS: readonly Variant[] = ["display", "thumb"];
export const variantKey = (base: string, variant: Variant) => `${base}/${variant}.webp`;

/** 削除後に CDN やブラウザに長く残らないよう短めにする (lumorphia/prismtone と同じ)。非公開は共有のキャッシュに載せない */
export const PUBLIC_IMAGE_CACHE_CONTROL = "public, max-age=3600, must-revalidate";
export const PRIVATE_IMAGE_CACHE_CONTROL = "private, no-store";
export const imageCacheControl = (base: string) =>
  isPrivateKey(base) ? PRIVATE_IMAGE_CACHE_CONTROL : PUBLIC_IMAGE_CACHE_CONTROL;
