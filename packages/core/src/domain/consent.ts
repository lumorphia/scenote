import { eq } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";

/**
 * 規約とプライバシーポリシーへの同意 (ADR-0023)。版の比べ方は @lumorphia/legal (メジャーが上がったら求め直す)。
 * core は版の形を知らず、同意が要るかの判定は呼ぶ側 (server) が渡す
 */
export async function consentOf(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ version: schema.users.termsAcceptedVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.version ?? null;
}

/** 今の版への同意と、15 歳以上であることの確認を記録する */
export async function acceptTerms(
  db: Database,
  userId: string,
  version: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.users)
    .set({ termsAcceptedVersion: version, termsAcceptedAt: now })
    .where(eq(schema.users.id, userId));
}
