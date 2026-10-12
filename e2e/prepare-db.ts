import { createDatabase, schema } from "@lumorphia-scenote/db";
import { ensureDatabase } from "@lumorphia-scenote/db/test-database";
import { DEFAULT_DATABASE_URL } from "./database.ts";

/**
 * E2E の DB を用意する (無ければ作り、マイグレーションを当てる)。Playwright は globalSetup より先に webServer を
 * 立ち上げるので、webServer のコマンドの先頭で走らせる (lumorphia/prismtone と同じ)。
 * DATABASE_URL は E2E の DB (アプリが使う)、E2E_BASE_DATABASE_URL はそれを作るための開発の DB
 */
const target = process.env.DATABASE_URL;
if (!target) throw new Error("DATABASE_URL (E2E の DB) が要る");
const name = new URL(target).pathname.slice(1);
await ensureDatabase(process.env.E2E_BASE_DATABASE_URL ?? DEFAULT_DATABASE_URL, name);

// 撮影場所の候補 (S5e)。本番と開発は XIVAPI から同期するが、E2E は外へ出ないよう少しだけ入れる
const { db, close } = createDatabase(target);
try {
  await db
    .insert(schema.places)
    .values(
      [
        {
          sourceId: 28,
          regionSourceId: 22,
          regionName: "ラノシア",
          name: "リムサ・ロミンサ：上甲板層",
          kind: "town" as const,
        },
        {
          sourceId: 30,
          regionSourceId: 22,
          regionName: "ラノシア",
          name: "中央ラノシア",
          kind: "field" as const,
        },
        {
          sourceId: 52,
          regionSourceId: 23,
          regionName: "黒衣森",
          name: "グリダニア：新市街",
          kind: "town" as const,
        },
      ].map((p) => ({ ...p, syncedAt: new Date() })),
    )
    .onConflictDoNothing();
} finally {
  await close();
}
console.log(`e2e database ready: ${name}`);
