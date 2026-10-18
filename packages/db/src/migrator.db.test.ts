import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "./client.ts";
import { pendingMigrations } from "./migrator.ts";
import journal from "../drizzle/meta/_journal.json" with { type: "json" };

const url = process.env.DATABASE_URL;

// 当たっていないマイグレーション (S7e、ADR-0024)。開発の DB に当て忘れると、ログインした人の操作が落ちた
describe.skipIf(!url)("pendingMigrations", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(() => {
    ({ db, close } = createDatabase(url!));
  });
  afterAll(async () => {
    await close();
  });

  it("finds nothing once every migration is applied", async () => {
    expect(await pendingMigrations(db)).toEqual([]);
  });

  it("names a migration the database has not applied", async () => {
    const last = journal.entries.at(-1)!;
    const [row] = await db
      .execute<{ id: number; hash: string; created_at: string }>(
        sql`select id, hash, created_at from drizzle.__drizzle_migrations where created_at = ${last.when}`,
      )
      .then((r) => r.rows);
    await db.execute(sql`delete from drizzle.__drizzle_migrations where id = ${row!.id}`);
    try {
      expect(await pendingMigrations(db)).toEqual([last.tag]);
    } finally {
      await db.execute(
        sql`insert into drizzle.__drizzle_migrations (id, hash, created_at) values (${row!.id}, ${row!.hash}, ${row!.created_at})`,
      );
    }
  });
});
