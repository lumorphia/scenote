import { and, eq, gt, sql } from "drizzle-orm";
import type { ObjectStorage, PresignedPut } from "@lumorphia/storage";
import { schema, type Database } from "@lumorphia-scenote/db";
import { tmpKey } from "../storage-keys.ts";
import { DomainError } from "./errors.ts";

/** ブラウザで書き出した画像は WebP (なければ JPEG)。PNG も受ける (要件定義書 7 章) */
export const UPLOAD_MIMES = ["image/webp", "image/jpeg", "image/png"] as const;
export type UploadMime = (typeof UPLOAD_MIMES)[number];

/** 受け取りの枠の期限。過ぎたものは掃除のジョブが消す */
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** 署名付き PUT の期限 (秒) */
export const PRESIGN_TTL_S = 15 * 60;
/** 投稿に使っていない枠を 1 人が同時に持てる数 */
export const MAX_PENDING_UPLOADS = 10;

export type UploadDeps = { db: Database; storage: ObjectStorage; maxBytes: number };
export type UploadGrant = { uploadId: string; upload: PresignedPut };

/** 一時置き場 (tmp/) への署名付き PUT を出す (lumorphia/prismtone の createUploads と同じ) */
export async function createUpload(
  { db, storage, maxBytes }: UploadDeps,
  userId: string,
  file: { mime: UploadMime; bytes: number },
  now: Date = new Date(),
): Promise<UploadGrant> {
  if (file.bytes <= 0 || file.bytes > maxBytes)
    throw new DomainError("validation", `file must be 1..${maxBytes} bytes`);
  const row = await db.transaction(async (tx) => {
    // 同じ人の要求を 1 本にして、数えてから足すまでの間に追い越されないようにする
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const [pending] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.uploads)
      .where(
        and(
          eq(schema.uploads.userId, userId),
          eq(schema.uploads.status, "pending"),
          gt(schema.uploads.expiresAt, now),
        ),
      );
    if ((pending?.n ?? 0) >= MAX_PENDING_UPLOADS)
      throw new DomainError("rate_limited", "too many pending uploads");
    const [inserted] = await tx
      .insert(schema.uploads)
      .values({
        userId,
        declaredMime: file.mime,
        declaredBytes: file.bytes,
        expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
      })
      .returning({ id: schema.uploads.id });
    return inserted!;
  });
  return {
    uploadId: row.id,
    upload: await storage.presignPut({
      key: tmpKey(row.id),
      contentType: file.mime,
      contentLength: file.bytes,
      expiresIn: PRESIGN_TTL_S,
    }),
  };
}
