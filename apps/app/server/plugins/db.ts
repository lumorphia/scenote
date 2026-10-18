import fp from "fastify-plugin";
import { createDatabase, pendingMigrations, type Database } from "@lumorphia-scenote/db";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export const dbPlugin = fp<{ connectionString: string }>(
  async (app, opts) => {
    const { db, close } = createDatabase(opts.connectionString, {
      onIdleError: (err) => app.log.warn({ err }, "db: idle client disconnected"),
    });
    app.decorate("db", db);
    app.addHook("onClose", async () => {
      await close();
    });
    // 当たっていないマイグレーションがあれば知らせる (ADR-0024)。テストと E2E は自分の DB に当てるので、
    // 開発の DB への当て忘れはここでしか気づけない。起動は止めない (本番は migrate のサービスが先に当てる)
    app.addHook("onReady", async () => {
      const pending = await pendingMigrations(db).catch(() => []);
      if (pending.length)
        app.log.warn({ pending }, "database is missing migrations: run pnpm db:migrate");
    });
  },
  { name: "db" },
);
