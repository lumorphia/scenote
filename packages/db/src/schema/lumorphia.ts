import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./_common.ts";

/**
 * 受け取った Lumorphia の back-channel logout の知らせ (ADR-0009)。同じ知らせ (jti) を 1 回だけ処理するため、
 * セッションの削除と同じトランザクションで記録する。期限の 1 日後に消す (lumorphia/prismtone と同じ)
 */
export const lumorphiaLogoutReceipts = pgTable(
  "lumorphia_logout_receipts",
  {
    id: id(),
    issuer: text("issuer").notNull(),
    clientId: text("client_id").notNull(),
    jti: text("jti").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lumorphia_logout_receipts_jti_idx").on(t.issuer, t.clientId, t.jti),
    index("lumorphia_logout_receipts_expires_idx").on(t.expiresAt),
  ],
);
