import { eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import { DomainError } from "./errors.ts";

/** 1 投稿のタグの数と、1 つの長さの上限 (lumorphia/prismtone と同じ) */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export type TagInput = { name: string; displayName: string };

const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * 表記のゆれをそろえる (lumorphia/prismtone の normalizeTag)。NFKC・小文字・空白をまとめる。
 * 要件定義書の書き方 (#風景) に合わせ、先頭の # (全角も) は外す。表示は書かれた形を保つ
 */
export function normalizeTag(input: string): TagInput {
  const displayName = [
    ...input
      .replace(CONTROL, "")
      .trim()
      .replace(/^[#＃]+/u, "")
      .trim(),
  ]
    .slice(0, MAX_TAG_LENGTH)
    .join("");
  const name = displayName.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return { name, displayName };
}

/** そろえて重なりを除き、書かれた順に並べる。空のものは捨てる */
export function validateTags(input: readonly string[]): TagInput[] {
  const seen = new Map<string, TagInput>();
  for (const raw of input) {
    const tag = normalizeTag(raw);
    if (tag.name && !seen.has(tag.name)) seen.set(tag.name, tag);
  }
  if (seen.size > MAX_TAGS) throw new DomainError("validation", `at most ${MAX_TAGS} tags`);
  return [...seen.values()];
}

/** 投稿のタグを付け直す。トランザクションの中で呼ぶ */
export async function replacePostTags(
  tx: Database,
  postId: string,
  tags: readonly TagInput[],
): Promise<void> {
  await tx.delete(schema.postTags).where(eq(schema.postTags.postId, postId));
  if (tags.length === 0) return;
  await tx
    .insert(schema.tags)
    .values(tags.map((t) => ({ name: t.name, displayName: t.displayName })))
    .onConflictDoNothing({ target: schema.tags.name });
  const rows = await tx
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(
      inArray(
        schema.tags.name,
        tags.map((t) => t.name),
      ),
    );
  const idOf = new Map(rows.map((r) => [r.name, r.id]));
  await tx
    .insert(schema.postTags)
    .values(tags.map((t, position) => ({ postId, tagId: idOf.get(t.name)!, position })));
}

/** 投稿のタグを、付けた順に */
export async function tagsOf(db: Database, postId: string): Promise<TagInput[]> {
  return db
    .select({ name: schema.tags.name, displayName: schema.tags.displayName })
    .from(schema.postTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.postTags.tagId))
    .where(eq(schema.postTags.postId, postId))
    .orderBy(schema.postTags.position);
}
