import { and, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
import { schema } from "@lumorphia-scenote/db";
import { TMP_PREFIX, tmpKey } from "../storage-keys.ts";
import type { JobDefinition } from "./context.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 期限を過ぎた受け取りの枠と、その画像を消す。派生画像を作っている投稿が指す枠は残す。
 * 枠の無い一時置き場の画像 (PUT だけされたもの、消し損ねたもの) も消す。原本を持たないため (ADR-0003)
 */
export const uploadCleanupJob: JobDefinition<object> = {
  name: "upload-cleanup",
  cron: "17 * * * *",
  async handler(_data, { db, storage, log }) {
    const inUse = db
      .select({ id: schema.posts.uploadId })
      .from(schema.posts)
      .where(isNotNull(schema.posts.uploadId));
    const expired = await db
      .delete(schema.uploads)
      .where(and(lte(schema.uploads.expiresAt, new Date()), notInArray(schema.uploads.id, inUse)))
      .returning({ id: schema.uploads.id });

    const keys = await storage.list(TMP_PREFIX);
    const ids = keys.map((k) => k.slice(TMP_PREFIX.length)).filter((id) => UUID.test(id));
    const known = ids.length
      ? await db
          .select({ id: schema.uploads.id })
          .from(schema.uploads)
          .where(inArray(schema.uploads.id, ids))
      : [];
    const keep = new Set(known.map((r) => tmpKey(r.id)));
    const orphans = keys.filter((k) => !keep.has(k));
    if (orphans.length) await storage.delete(orphans);
    log.info({ expired: expired.length, removed: orphans.length }, "uploads cleaned");
  },
};

export type ImageDeleteData = { keyBases: string[] };

/** 投稿の派生画像をまとめて消す。利用者の物理削除などで投入する */
export const imageDeleteJob: JobDefinition<ImageDeleteData> = {
  name: "image-delete",
  async handler({ keyBases }, { storage, log }) {
    for (const base of keyBases) {
      const keys = await storage.list(`${base}/`);
      if (keys.length) await storage.delete(keys);
    }
    log.info({ posts: keyBases.length }, "images deleted");
  },
};
