import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BLOCKED_TERMS } from "@lumorphia/moderation/text";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import {
  activeBlockedTerms,
  addBlockedTerm,
  deleteBlockedTerm,
  importBlockedTerms,
  invalidateBlockedTermsCache,
  listBlockedTerms,
  setBlockedTermEnabled,
} from "./blocked-terms.ts";
import { checkText } from "./blocked-text.ts";

const databaseUrl = process.env.DATABASE_URL;
const ADMIN = "test-admin-sub";

// 運営が足す NG 語の辞書 (docs/plan.md の S7b-2、ADR-0022)。語は DB にだけ置き、リポジトリに書かない (ADR-0007)
describe.skipIf(!databaseUrl)("the blocked terms dictionary (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.blockedTerms);
    await db.delete(schema.adminAuditLogs);
    invalidateBlockedTermsCache();
  });

  const add = (term: string, match: "exact" | "contains" = "contains") =>
    addBlockedTerm(db, ADMIN, { term, match, reason: "テスト_理由" });

  it("checks what people write against the words the operator added", async () => {
    expect(await checkText(db, { title: "テスト_夕焼けとテスト禁止語" })).toBeNull();
    await add("テスト禁止語");
    expect(await checkText(db, { title: "テスト_夕焼けとテスト禁止語" })).toBe("title");
  });

  it("keeps the built-in words too", async () => {
    expect(await activeBlockedTerms(db)).toEqual(expect.arrayContaining([...BLOCKED_TERMS]));
  });

  it("matches a tag-only word as the whole tag", async () => {
    await add("テスト語", "exact");
    expect(await checkText(db, { tags: ["テスト語"] })).toBe("tags");
    expect(await checkText(db, { body: "これはテスト語です" })).toBeNull();
  });

  it("refuses the same word twice however it is written", async () => {
    await add("テスト禁止語");
    await expect(add(" ﾃｽﾄ禁止語 ")).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses an empty word or one that is too long", async () => {
    await expect(add("  ")).rejects.toMatchObject({ code: "validation" });
    await expect(add("あ".repeat(65))).rejects.toMatchObject({ code: "validation" });
  });

  it("stops checking a word once it is turned off, and again when turned on", async () => {
    const term = await add("テスト禁止語");
    await setBlockedTermEnabled(db, ADMIN, term.id, false, "テスト_理由");
    expect(await checkText(db, { body: "テスト禁止語" })).toBeNull();
    await setBlockedTermEnabled(db, ADMIN, term.id, true, "テスト_理由");
    expect(await checkText(db, { body: "テスト禁止語" })).toBe("body");
  });

  it("deletes a word", async () => {
    const term = await add("テスト禁止語");
    await deleteBlockedTerm(db, ADMIN, term.id, "テスト_理由");
    expect(await checkText(db, { body: "テスト禁止語" })).toBeNull();
    await expect(deleteBlockedTerm(db, ADMIN, term.id, "テスト_理由")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("imports a word list, skipping comments and words it already has", async () => {
    await add("テスト語一");
    const result = await importBlockedTerms(db, ADMIN, {
      text: "# テスト_コメント\nテスト語一\nテスト語二\n\nテスト語三\nテスト語二\n",
      match: "contains",
      source: "test-dictionary",
      reason: "テスト_理由",
    });
    expect(result).toEqual({ added: 2, skipped: 1 });
    expect(await checkText(db, { body: "テスト語三" })).toBe("body");
  });

  it("records every change without writing the word itself", async () => {
    const term = await add("テスト禁止語");
    await setBlockedTermEnabled(db, ADMIN, term.id, false, "テスト_理由");
    await deleteBlockedTerm(db, ADMIN, term.id, "テスト_理由");
    const logs = await db.select().from(schema.adminAuditLogs);
    expect(logs.map((l) => l.action).sort()).toEqual([
      "blocked_term_added",
      "blocked_term_deleted",
      "blocked_term_disabled",
    ]);
    expect(JSON.stringify(logs)).not.toContain("テスト禁止語");
  });

  it("asks for a reason", async () => {
    await expect(
      addBlockedTerm(db, ADMIN, { term: "テスト禁止語", match: "contains", reason: " " }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await listBlockedTerms(db, {})).toMatchObject({ items: [] });
  });

  it("lists the words newest first and finds them by what they contain", async () => {
    await add("テスト語あ");
    await add("テスト語い");
    expect((await listBlockedTerms(db, {})).items.map((t) => t.term)).toEqual([
      "テスト語い",
      "テスト語あ",
    ]);
    expect((await listBlockedTerms(db, { q: "い" })).items.map((t) => t.term)).toEqual([
      "テスト語い",
    ]);
  });

  it("pages through a long list", async () => {
    for (let i = 0; i < 3; i++) await add(`テスト語${randomUUID().slice(0, 6)}`);
    const first = await listBlockedTerms(db, { limit: 2 });
    const second = await listBlockedTerms(db, { limit: 2, cursor: first.nextCursor! });
    expect(first.items.length + second.items.length).toBe(3);
    expect(second.nextCursor).toBeNull();
  });
});
