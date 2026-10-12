import { and, eq, lt, max, ne } from "drizzle-orm";
import type { Database } from "@lumorphia-scenote/db";
import { schema } from "@lumorphia-scenote/db";

/**
 * Lumorphia の退会・復旧・物理削除の知らせ (ADR-0010。lumorphia/prismtone の ADR-0058 から)。
 * 退会は accounts で始まり、知らせで Scenote に当てる。30 日を過ぎると accounts が purged を送る
 */

/** 退会から復旧できる日数。過ぎると accounts が物理削除し、purged を送る */
export const ACCOUNT_RECOVERY_DAYS = 30;

/** auth-client の AccountEvent のうち、Scenote が当てるのに使うもの */
export type LumorphiaAccountEvent = {
  eventId: string;
  sub: string;
  revision: number;
  state: "active" | "deleted" | "purged";
  deletedAt: Date | null;
};

/**
 * 知らせを当てる。記録と状態の変更は同じトランザクション。同じ知らせは 1 回だけ、sub ごとに最後に
 * 当てた revision より古いものは当てない。物理削除では、その人の知らせの記録も消す
 */
export async function applyLumorphiaAccountEvent(
  db: Database,
  event: LumorphiaAccountEvent,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.lumorphiaSub, event.sub))
      .for("update");
    // Scenote に来たことが無い人の知らせは、当てるものも覚えるものも無い (消えた人の ID を残さない)
    if (!user) return;
    const [receipt] = await tx
      .insert(schema.lumorphiaAccountEvents)
      .values({
        eventId: event.eventId,
        sub: event.sub,
        revision: event.revision,
        state: event.state,
      })
      .onConflictDoNothing()
      .returning({ eventId: schema.lumorphiaAccountEvents.eventId });
    if (!receipt) return;
    const [latest] = await tx
      .select({ revision: max(schema.lumorphiaAccountEvents.revision) })
      .from(schema.lumorphiaAccountEvents)
      .where(
        and(
          eq(schema.lumorphiaAccountEvents.sub, event.sub),
          ne(schema.lumorphiaAccountEvents.eventId, event.eventId),
        ),
      );
    if (latest?.revision != null && latest.revision >= event.revision) return;
    if (event.state === "deleted") {
      await tx
        .update(schema.users)
        .set({ status: "deleted", deletedAt: event.deletedAt ?? now })
        .where(eq(schema.users.id, user.id));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
      return;
    }
    if (event.state === "active") {
      await tx
        .update(schema.users)
        .set({ status: "active", deletedAt: null })
        .where(eq(schema.users.id, user.id));
      return;
    }
    await tx.delete(schema.users).where(eq(schema.users.id, user.id));
    await tx
      .delete(schema.lumorphiaAccountEvents)
      .where(eq(schema.lumorphiaAccountEvents.sub, event.sub));
  });
}

/**
 * ログインの前に呼ぶ。退会から 30 日を過ぎた人がまだ残っていれば (purged が届いていない)、先に消して
 * 新しい利用者として始めさせる (auth-client の README)
 */
export async function prepareLoginAfterDeletion(
  db: Database,
  sub: string,
  now: Date = new Date(),
): Promise<void> {
  const expiredBefore = new Date(now.getTime() - ACCOUNT_RECOVERY_DAYS * 86_400_000);
  await db
    .delete(schema.users)
    .where(
      and(
        eq(schema.users.lumorphiaSub, sub),
        eq(schema.users.status, "deleted"),
        lt(schema.users.deletedAt, expiredBefore),
      ),
    );
}

/**
 * ログインが完了したら、退会中の人を戻す。accounts はサービスだけの退会中のログインを完了させないので、
 * ここまで来たなら accounts では active。知らせより先にログインしたときのため
 */
export async function restoreOnLogin(db: Database, userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ status: "active", deletedAt: null })
    .where(and(eq(schema.users.id, userId), eq(schema.users.status, "deleted")));
}
