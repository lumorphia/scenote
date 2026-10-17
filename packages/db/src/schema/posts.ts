import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common.ts";
import { users } from "./users.ts";
import { places } from "./places.ts";

/**
 * ブラウザから署名付き PUT で置く、受け取りの枠 (lumorphia/prismtone の upload_sessions と同じ)。
 * 置いたものは一時置き場 (tmp/) にあり、派生画像を作ったら消す。原本は持たない (ADR-0003)
 */
export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ブラウザが申告した形式と大きさ。中身は派生画像のジョブが先頭のバイトで確かめ直す */
    declaredMime: text("declared_mime").notNull(),
    declaredBytes: integer("declared_bytes").notNull(),
    /** pending: URL を出した。consumed: 投稿に使った */
    status: text("status", { enum: ["pending", "consumed"] })
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("uploads_user_status_idx").on(t.userId, t.status),
    index("uploads_expires_idx").on(t.expiresAt),
  ],
);

/** 投稿。1 投稿 1 枚なので、画像の列も投稿に持つ (要件定義書 9 章) */
export const posts = pgTable(
  "posts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * processing: 派生画像を作っている。published: 見られる。failed: 画像を受け付けなかった。
     * held: 自動モデレーションで保留した。本人にだけ見え、画像は非公開の置き場所にある (ADR-0014)
     */
    status: text("status", { enum: ["processing", "published", "failed", "held"] })
      .notNull()
      .default("processing"),
    /** 公開範囲 (ADR-0004)。既定は公開 */
    visibility: text("visibility", { enum: ["public", "unlisted", "private"] })
      .notNull()
      .default("public"),
    /**
     * 派生画像が今あるキーの頭。推測できない値を含む (限定公開の画像 URL のため。ADR-0004)。
     * 公開・限定公開は posts/、非公開は private/ (ADR-0012)
     */
    imageKeyBase: text("image_key_base").notNull(),
    /** 公開範囲を変えて、画像を移している先。移し終えたら null (image-move ジョブ) */
    pendingImageKeyBase: text("pending_image_key_base"),
    /** 派生画像を作るまでの受け取りの枠。作ったら外す */
    uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    width: integer("width"),
    height: integer("height"),
    blurhash: text("blurhash"),
    bytesDisplay: integer("bytes_display"),
    bytesThumb: integer("bytes_thumb"),
    /** タイトルと本文。どちらも任意で、画像だけでも投稿できる (要件定義書 9 章) */
    title: text("title"),
    body: text("body"),
    /** 撮影日。既定はブラウザが読んだファイルの更新日時の日付。利用者が変えたり消したりできる (要件定義書 9.2) */
    takenOn: date("taken_on"),
    /** 撮影場所。候補から選んだら place_id、自由入力なら place_text (どちらか一方。要件定義書 10 章) */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    placeText: text("place_text"),
    /** 現像のレシピ (@lumorphia/editor-recipe)。画像には埋め込まず、ここに残す (ADR-0003) */
    recipe: jsonb("recipe"),
    /**
     * 自動モデレーションの結果 (@lumorphia/moderation、ADR-0014)。判定していなければ null。
     * flagged は公開したまま運営が確かめるもの、held は保留。score と labels は、しきい値を見直すときの材料
     */
    moderationState: text("moderation_state", { enum: ["clear", "flagged", "held"] }),
    moderationScore: real("moderation_score"),
    moderationLabels: jsonb("moderation_labels").$type<Record<string, number>>(),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    /** 受け付けなかった理由 (@lumorphia/media の ImageRejectedError の reason など) */
    failureReason: text("failure_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("posts_user_created_idx").on(t.userId, t.createdAt)],
);
