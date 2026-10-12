import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, like, lt } from "drizzle-orm";
import type { Database } from "@lumorphia-scenote/db";
import { schema } from "@lumorphia-scenote/db";

/**
 * Lumorphia のログアウト (ADR-0009。lumorphia/prismtone から写した)。
 * - back-channel logout: accounts から届いた知らせで、その Lumorphia のセッション (sid) に
 *   結び付いた Scenote のセッションだけを消す。同じ人のほかの端末は消さない
 * - RP から始めるログアウト: accounts の end-session に渡す state を作り、戻ってきたら照合して消す
 */

export type LumorphiaLogoutEvent = {
  issuer: string;
  clientId: string;
  sub: string;
  sid: string;
  jti: string;
  expiresAt: Date;
};

/** 期限を過ぎた受け取りの記録を残す長さ。auth-client は期限の 5 秒後まで残すことを求める */
const RECEIPT_RETENTION_MS = 86_400_000;

/**
 * back-channel logout の知らせを 1 回だけ当てる。記録とセッションの削除は同じトランザクションで、
 * 削除に失敗したら記録も残らないので、accounts が送り直したときにもう一度処理できる
 */
export async function applyLumorphiaLogout(
  db: Database,
  event: LumorphiaLogoutEvent,
  now: Date = new Date(),
): Promise<{ repeated: boolean; ended: number }> {
  return db.transaction(async (tx) => {
    await tx
      .delete(schema.lumorphiaLogoutReceipts)
      .where(
        lt(
          schema.lumorphiaLogoutReceipts.expiresAt,
          new Date(now.getTime() - RECEIPT_RETENTION_MS),
        ),
      );
    const [receipt] = await tx
      .insert(schema.lumorphiaLogoutReceipts)
      .values({
        issuer: event.issuer,
        clientId: event.clientId,
        jti: event.jti,
        expiresAt: event.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: schema.lumorphiaLogoutReceipts.id });
    if (!receipt) return { repeated: true, ended: 0 };
    const owners = tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.lumorphiaSub, event.sub));
    const ended = await tx
      .delete(schema.sessions)
      .where(
        and(eq(schema.sessions.lumorphiaSid, event.sid), inArray(schema.sessions.userId, owners)),
      )
      .returning({ id: schema.sessions.id });
    return { repeated: false, ended: ended.length };
  });
}

const STATE_PREFIX = "lumorphia-logout:";
const STATE_TTL_MS = 10 * 60_000;

/** end-session に渡す state を作る。10 分で切れる */
export async function createLumorphiaLogoutState(
  db: Database,
  now: Date = new Date(),
): Promise<string> {
  // 使われずに切れた state を溜めない
  await db
    .delete(schema.verifications)
    .where(
      and(
        like(schema.verifications.identifier, `${STATE_PREFIX}%`),
        lt(schema.verifications.expiresAt, now),
      ),
    );
  const state = randomBytes(24).toString("base64url");
  await db.insert(schema.verifications).values({
    identifier: `${STATE_PREFIX}${state}`,
    value: "1",
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  return state;
}

/** accounts から戻ってきた state を照合して消す。知らない・切れた・使い済みなら false */
export async function consumeLumorphiaLogoutState(
  db: Database,
  state: string,
  now: Date = new Date(),
): Promise<boolean> {
  const consumed = await db
    .delete(schema.verifications)
    .where(
      and(
        eq(schema.verifications.identifier, `${STATE_PREFIX}${state}`),
        gt(schema.verifications.expiresAt, now),
      ),
    )
    .returning({ id: schema.verifications.id });
  return consumed.length > 0;
}
