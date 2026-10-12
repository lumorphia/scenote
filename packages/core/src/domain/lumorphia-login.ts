import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@lumorphia-scenote/db";
import { schema } from "@lumorphia-scenote/db";

/**
 * Lumorphia でログインした利用者の受け入れと、プロフィールの写し (ADR-0009)。
 * handle・表示名・アイコンは Lumorphia が正で、Scenote の値はログインのたびに書き換える写し
 */

/**
 * Lumorphia でログインした利用者のメールアドレス。Better Auth が必須にするので、本物を入れず sub ごとの値にする
 * (lumorphia/prismtone の ADR-0054 と同じ)
 */
export function lumorphiaPlaceholderEmail(sub: string): string {
  return `${sub}@lumorphia.placeholder.invalid`;
}

export type LumorphiaProfileCopy = {
  handle: string;
  name: string;
  picture: string | null;
};

const placeholderHandle = () => `u_${randomBytes(6).toString("hex")}`;

/**
 * handle をほかの利用者の古い写しから外す。accounts の handle は一意なので、ログインした人の handle を
 * ほかの Scenote 利用者が持っていたら、それは handle を変えてからまだ Scenote に来ていない人の写し。
 * その人は仮の handle (u_ + 12 桁) にし、次のログインで正しい handle に戻る (ADR-0009)
 */
export async function releaseHandle(
  db: Database,
  handle: string,
  exceptUserId?: string,
): Promise<void> {
  await db
    .update(schema.users)
    .set({ handle: placeholderHandle() })
    .where(
      exceptUserId
        ? and(eq(schema.users.handle, handle), ne(schema.users.id, exceptUserId))
        : eq(schema.users.handle, handle),
    );
}

/** ログインのたびに、Lumorphia の handle・表示名・アイコンを写す */
export async function syncLumorphiaProfile(
  db: Database,
  userId: string,
  profile: LumorphiaProfileCopy,
): Promise<void> {
  await db.transaction(async (tx) => {
    await releaseHandle(tx, profile.handle, userId);
    await tx
      .update(schema.users)
      .set({ handle: profile.handle, name: profile.name, image: profile.picture })
      .where(eq(schema.users.id, userId));
  });
}
