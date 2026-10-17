import { and, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import {
  BLOCKED_TERMS,
  normalizeForBlocklist,
  parseTermList,
  type BlockedTerm,
} from "@lumorphia/moderation/text";
import { schema, type Database } from "@lumorphia-scenote/db";
import { recordAdminAction } from "./admin.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { DomainError } from "./errors.ts";

export type TermMatch = "exact" | "contains";
export const TERM_MAX_LENGTH = 64;
export const IMPORT_MAX_TERMS = 20_000;

/** 照合に使う語のキャッシュ。管理画面で変えたらすぐ消し、ほかのプロセスでも 30 秒で入れ替わる */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; terms: readonly BlockedTerm[] } | null = null;

export function invalidateBlockedTermsCache(): void {
  cache = null;
}

/** 組み込みの一覧 (@lumorphia/moderation/text) と、辞書の有効な語 (ADR-0022) */
export async function activeBlockedTerms(db: Database): Promise<readonly BlockedTerm[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.terms;
  const rows = await db
    .select({ term: schema.blockedTerms.term, match: schema.blockedTerms.match })
    .from(schema.blockedTerms)
    .where(eq(schema.blockedTerms.enabled, true));
  const terms = [...BLOCKED_TERMS, ...rows];
  cache = { at: Date.now(), terms };
  return terms;
}

export type BlockedTermView = {
  id: string;
  term: string;
  match: TermMatch;
  source: string;
  enabled: boolean;
  createdAt: Date;
};

const toView = (row: typeof schema.blockedTerms.$inferSelect): BlockedTermView => ({
  id: row.id,
  term: row.term,
  match: row.match,
  source: row.source,
  enabled: row.enabled,
  createdAt: row.createdAt,
});

/** 辞書の語を新しい順に。q を含む語だけに絞れる (表記のゆれはそろえて探す) */
export async function listBlockedTerms(
  db: Database,
  input: { q?: string | undefined; cursor?: string | undefined; limit?: number | undefined },
): Promise<{ items: BlockedTermView[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  const q = input.q ? normalizeForBlocklist(input.q) : "";
  const conditions: (SQL | undefined)[] = [];
  if (q)
    conditions.push(ilike(schema.blockedTerms.normalized, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  if (after)
    conditions.push(
      or(
        lt(schema.blockedTerms.createdAt, after.at),
        and(eq(schema.blockedTerms.createdAt, after.at), lt(schema.blockedTerms.id, after.id)),
      ),
    );
  const rows = await db
    .select()
    .from(schema.blockedTerms)
    .where(and(...conditions))
    .orderBy(sql`${schema.blockedTerms.createdAt} desc`, sql`${schema.blockedTerms.id} desc`)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toView),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

/** 1 語を足す。表記のゆれをそろえて同じ語があれば conflict */
export async function addBlockedTerm(
  db: Database,
  adminSub: string,
  input: { term: string; match: TermMatch; reason: string },
): Promise<BlockedTermView> {
  const term = input.term.trim();
  const normalized = normalizeForBlocklist(term);
  if (!normalized || [...term].length > TERM_MAX_LENGTH)
    throw new DomainError("validation", `term must be 1..${TERM_MAX_LENGTH} chars`);
  const view = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.blockedTerms)
      .values({ term, normalized, match: input.match, source: "manual" })
      .onConflictDoNothing({ target: schema.blockedTerms.normalized })
      .returning();
    if (!row) throw new DomainError("conflict", "term already exists");
    await recordAdminAction(tx, {
      adminSub,
      action: "blocked_term_added",
      targetType: "term",
      targetId: row.id,
      reason: input.reason,
    });
    return toView(row);
  });
  invalidateBlockedTermsCache();
  return view;
}

/**
 * 辞書 (1 行 1 語、# 始まりはコメント) をまとめて入れる。あった語は飛ばす。
 * 1 回 20,000 語まで、1 語 64 文字まで。記録は辞書の名前で 1 行
 */
export async function importBlockedTerms(
  db: Database,
  adminSub: string,
  input: { text: string; match: TermMatch; source: string; reason: string },
): Promise<{ added: number; skipped: number }> {
  const source = input.source.trim();
  if (!source || [...source].length > 80)
    throw new DomainError("validation", "source must be 1..80 chars");
  const terms = parseTermList(input.text).filter((t) => [...t].length <= TERM_MAX_LENGTH);
  if (terms.length === 0) throw new DomainError("validation", "no terms");
  if (terms.length > IMPORT_MAX_TERMS)
    throw new DomainError("validation", `at most ${IMPORT_MAX_TERMS} terms per import`);
  const rows = terms.map((term) => ({
    term,
    normalized: normalizeForBlocklist(term),
    match: input.match,
    source,
  }));
  const result = await db.transaction(async (tx) => {
    await recordAdminAction(tx, {
      adminSub,
      action: "blocked_terms_imported",
      targetType: "term",
      targetId: source,
      reason: input.reason,
    });
    const chunks = Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) =>
      rows.slice(i * 500, i * 500 + 500),
    );
    const counts = await chunks.reduce(
      async (sum, chunk) =>
        (await sum) +
        (
          await tx
            .insert(schema.blockedTerms)
            .values(chunk)
            .onConflictDoNothing({ target: schema.blockedTerms.normalized })
            .returning({ id: schema.blockedTerms.id })
        ).length,
      Promise.resolve(0),
    );
    return { added: counts, skipped: rows.length - counts };
  });
  invalidateBlockedTermsCache();
  return result;
}

/** 照合に使うかを切り替える */
export async function setBlockedTermEnabled(
  db: Database,
  adminSub: string,
  id: string,
  enabled: boolean,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.blockedTerms)
      .set({ enabled })
      .where(eq(schema.blockedTerms.id, id))
      .returning({ id: schema.blockedTerms.id });
    if (!row) throw new DomainError("not_found", "term not found");
    await recordAdminAction(tx, {
      adminSub,
      action: enabled ? "blocked_term_enabled" : "blocked_term_disabled",
      targetType: "term",
      targetId: id,
      reason,
    });
  });
  invalidateBlockedTermsCache();
}

export async function deleteBlockedTerm(
  db: Database,
  adminSub: string,
  id: string,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.blockedTerms)
      .where(eq(schema.blockedTerms.id, id))
      .returning({ id: schema.blockedTerms.id });
    if (!row) throw new DomainError("not_found", "term not found");
    await recordAdminAction(tx, {
      adminSub,
      action: "blocked_term_deleted",
      targetType: "term",
      targetId: id,
      reason,
    });
  });
  invalidateBlockedTermsCache();
}
