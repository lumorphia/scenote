import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common.ts";

// 認証のテーブル。列名は Better Auth の Drizzle adapter (usePlural) に合わせる (lumorphia/prismtone と同じ)。
// ログインは Lumorphia アカウントだけ (ADR-0005、ADR-0009)

export const users = pgTable(
  "users",
  {
    id: id(),
    /** 表示名。Lumorphia の写しで、ログインのたびに書き換える (ADR-0009) */
    name: text("name").notNull(),
    /** Better Auth が必須にする。本物は保存せず `<sub>@lumorphia.placeholder.invalid` (ADR-0009) */
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** アイコンの URL (accounts の配信元)。Lumorphia の写し */
    image: text("image"),
    /** Lumorphia の handle の写し。重なったら古い写しの側を仮の値 (u_...) にする (ADR-0009) */
    handle: text("handle").notNull(),
    /** Lumorphia アカウントの sub */
    lumorphiaSub: text("lumorphia_sub").notNull(),
    /** 退会は accounts で始まり、知らせで deleted にする。30 日以内の復旧で active に戻る (ADR-0010) */
    status: text("status", { enum: ["active", "deleted"] })
      .notNull()
      .default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * 同意した規約とプライバシーポリシーの版 ("terms=1.0;privacy=1.0"、@lumorphia/legal の形) と日時 (ADR-0023)。
     * 15 歳以上であることの確認も、同じ同意で受ける
     */
    termsAcceptedVersion: text("terms_accepted_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_handle_idx").on(t.handle),
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_lumorphia_sub_idx").on(t.lumorphiaSub),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Lumorphia のセッション ID (sid)。back-channel logout で、このセッションだけを消すのに使う */
    lumorphiaSid: text("lumorphia_sid"),
    /** このセッションでのログインの ID トークン。end-session の id_token_hint に使う。画面には返さない */
    lumorphiaIdToken: text("lumorphia_id_token"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_token_idx").on(t.token),
    index("sessions_user_idx").on(t.userId),
    index("sessions_lumorphia_sid_idx").on(t.lumorphiaSid),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
