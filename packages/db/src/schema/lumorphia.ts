import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

/**
 * 受け取った Lumorphia の退会・復旧・物理削除の知らせ (ADR-0010)。同じ知らせ (event_id) を 1 回だけ当て、
 * sub ごとに最後に当てた revision より古いものは当てない (lumorphia/prismtone の ADR-0058 と同じ)
 */
export const lumorphiaAccountEvents = pgTable(
  "lumorphia_account_events",
  {
    eventId: text("event_id").primaryKey(),
    sub: text("sub").notNull(),
    revision: integer("revision").notNull(),
    state: text("state", { enum: ["active", "deleted", "purged"] }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lumorphia_account_events_sub_idx").on(t.sub, t.revision)],
);
