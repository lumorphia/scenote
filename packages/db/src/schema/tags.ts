import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id } from "./_common.ts";
import { posts } from "./posts.ts";

/**
 * タグ (要件定義書 11 章)。name は表記のゆれをそろえたもの (NFKC・小文字)、display_name は最初に書かれた形。
 * どの投稿にも使われなくなったら消す (upload-cleanup)。投稿の数は持たず、要るときに数える
 */
export const tags = pgTable(
  "tags",
  {
    id: id(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      // 掃除がタグを消すのと、同じタグを付けるのがぶつかったら、掃除のほうを失敗させる (タグを黙って外さない)
      .references(() => tags.id, { onDelete: "restrict" }),
    /** 利用者が付けた順 */
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index("post_tags_tag_idx").on(t.tagId)],
);
