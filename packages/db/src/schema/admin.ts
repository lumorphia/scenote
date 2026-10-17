import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "./_common.ts";

/**
 * 管理画面の操作の記録 (ADR-0019。lumorphia/accounts の ADR-0015 と同じ形)。
 * 利用者は Lumorphia の sub か投稿の ID だけで指し、メール・handle・表示名は書かない。
 * 利用者や投稿への FK は持たない (消えたあとも記録を残す)。アプリは追記だけで、古いものは worker が消す
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: id(),
    /** 操作した運営者の Lumorphia の sub */
    adminSub: text("admin_sub").notNull(),
    /** 操作の種類 (例: post_hidden) */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** 理由。必須の自由記述で、個人の情報を書かない (画面に注意を出す) */
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_audit_logs_created_idx").on(t.createdAt)],
);
