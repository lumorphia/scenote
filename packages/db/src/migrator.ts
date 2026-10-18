import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.ts";

export const MIGRATIONS_FOLDER = new URL("../drizzle", import.meta.url).pathname;

/** このパッケージ同梱のマイグレーションを適用する。CLI (migrate.ts) とテスト用 DB の初期化で共用 */
export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

type Journal = { entries: { tag: string; when: number }[] };

/**
 * まだ当たっていないマイグレーションの名前 (ADR-0024)。drizzle は当てたものの created_at に journal の when を残す。
 * 記録の表が無ければ全部。アプリが起動したときに警告するのに使う (開発の DB への当て忘れ)
 */
export async function pendingMigrations(db: Database): Promise<string[]> {
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", `file://${MIGRATIONS_FOLDER}/`), "utf8"),
  ) as Journal;
  const exists = await db.execute<{ found: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') as found`,
  );
  if (!exists.rows[0]?.found) return journal.entries.map((e) => e.tag);
  const applied = await db.execute<{ created_at: string }>(
    sql`select created_at from drizzle.__drizzle_migrations`,
  );
  const done = new Set(applied.rows.map((r) => Number(r.created_at)));
  return journal.entries.filter((e) => !done.has(e.when)).map((e) => e.tag);
}
