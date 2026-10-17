import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./_common.ts";

/**
 * 運営が足す NG 語の辞書 (ADR-0022。lumorphia/prismtone の blocked_terms と同じ形)。
 * @lumorphia/moderation/text の組み込みの一覧と合わせて照合する。語はリポジトリに書かず、ここにだけ置く (ADR-0007)。
 * exact は語全体の一致 (タグ向け)、contains は部分一致
 */
export const blockedTerms = pgTable(
  "blocked_terms",
  {
    id: id(),
    term: text("term").notNull(),
    /** 表記のゆれをそろえたもの (normalizeForBlocklist)。同じものは 1 つだけ */
    normalized: text("normalized").notNull(),
    match: text("match", { enum: ["exact", "contains"] })
      .notNull()
      .default("contains"),
    /** 辞書の名前。手で足したものは manual */
    source: text("source").notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blocked_terms_normalized_idx").on(t.normalized),
    index("blocked_terms_created_idx").on(t.createdAt),
  ],
);
