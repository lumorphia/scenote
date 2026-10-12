import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import type { PlaceSource } from "../adapters/xivapi-places.ts";
import { createPlaceSyncJob } from "./place-sync.ts";

const url = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// 撮影場所の候補の同期 (週 1 回、worker)
describe.skipIf(!url)("place-sync job (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(url!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.places);
  });

  const source = (records: Awaited<ReturnType<PlaceSource["fetchPlaces"]>>): PlaceSource => ({
    fetchPlaces: async () => records,
  });

  it("stores the places the source gives", async () => {
    const job = createPlaceSyncJob(
      source([
        {
          sourceId: 30,
          regionSourceId: 22,
          regionName: "ラノシア",
          name: "中央ラノシア",
          kind: "field",
        },
      ]),
    );
    await job.handler({}, { db, storage: new MemoryStorage(), log: silent });
    expect((await db.select().from(schema.places)).map((p) => p.name)).toEqual(["中央ラノシア"]);
  });

  it("runs once a week", () => {
    expect(createPlaceSyncJob(source([])).cron).toBe("30 4 * * 1");
  });
});
