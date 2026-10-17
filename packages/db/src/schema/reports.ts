import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id } from "./_common.ts";
import { users } from "./users.ts";
import { posts } from "./posts.ts";

/**
 * 通報 (要件定義書 26 章、ADR-0021)。ログインした人が、見えている他人の投稿を通報する。
 * 理由は権利侵害 (rights)・写り込んだ本人からの削除依頼 (depicted)・規約違反 (terms)。
 * 運営には通報した人を見せない。投稿か通報した人が消えたら、通報も消える (操作は admin_audit_logs に残る)
 */
export const reports = pgTable(
  "reports",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: ["rights", "depicted", "terms"] }).notNull(),
    /** 任意の詳しい内容 (1000 文字まで) */
    detail: text("detail"),
    /** open: 対応待ち。hidden: 投稿を非表示にして閉じた。dismissed: 退けた */
    status: text("status", { enum: ["open", "hidden", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    // 同じ人が同じ投稿を、対応待ちのまま二重に通報しない
    uniqueIndex("reports_open_once_idx")
      .on(t.postId, t.reporterId)
      .where(sql`${t.status} = 'open'`),
    index("reports_status_created_idx").on(t.status, t.createdAt),
  ],
);
