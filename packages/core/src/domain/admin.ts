import { and, eq, lt } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import { DomainError } from "./errors.ts";

/** 操作の記録を残す日数 (ポリシーの「保存と削除」に書く。lumorphia/accounts の ADR-0015 と同じ 1 年) */
export const AUDIT_RETENTION_DAYS = 365;

/**
 * 管理画面に入れるか (ADR-0019)。リクエストのたびに、利用者が退会中でなく、その Lumorphia の sub が
 * env の許可リストにあるかを確かめる。DB の値を権限の根拠にしない (外したらすぐに入れなくなる)
 */
export async function isAdmin(
  db: Database,
  userId: string | null,
  adminSubs: readonly string[],
): Promise<boolean> {
  if (!userId || adminSubs.length === 0) return false;
  const [row] = await db
    .select({ sub: schema.users.lumorphiaSub })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.status, "active")));
  return row !== undefined && adminSubs.includes(row.sub);
}

export type AdminAction = {
  adminSub: string;
  action: string;
  targetType: "post" | "user" | "report" | "term";
  targetId: string;
  /** 必須。個人の情報を書かない */
  reason: string;
  at?: Date;
};

/** 管理画面の操作を記録する。操作と同じトランザクションで呼び、書けなければ操作も確定しない */
export async function recordAdminAction(db: Database, entry: AdminAction): Promise<void> {
  const reason = entry.reason.trim();
  if (!reason) throw new DomainError("validation", "a reason is required");
  await db.insert(schema.adminAuditLogs).values({
    adminSub: entry.adminSub,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason,
    ...(entry.at ? { createdAt: entry.at } : {}),
  });
}

/** 保存期間を過ぎた記録を消す。消した数を返す */
export async function purgeOldAuditLogs(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  const deleted = await db
    .delete(schema.adminAuditLogs)
    .where(lt(schema.adminAuditLogs.createdAt, cutoff))
    .returning({ id: schema.adminAuditLogs.id });
  return deleted.length;
}
