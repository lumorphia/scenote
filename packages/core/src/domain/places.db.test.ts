import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import type { PlaceRecord } from "../adapters/xivapi-places.ts";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { tmpKey } from "../storage-keys.ts";
import { createUpload } from "./uploads.ts";
import { changePlace, createPost, getPost, MAX_PLACE_TEXT_LENGTH } from "./posts.ts";
import { listPlaces, syncPlaces } from "./places.ts";

const databaseUrl = process.env.DATABASE_URL;

const limsa: PlaceRecord = {
  sourceId: 28,
  regionSourceId: 22,
  regionName: "ラノシア",
  name: "リムサ・ロミンサ：上甲板層",
  kind: "town",
};
const middle: PlaceRecord = { ...limsa, sourceId: 30, name: "中央ラノシア", kind: "field" };
const gridania: PlaceRecord = {
  sourceId: 52,
  regionSourceId: 23,
  regionName: "黒衣森",
  name: "グリダニア：新市街",
  kind: "town",
};

// 撮影場所 (要件定義書 10 章、docs/plan.md の S5e)
describe.skipIf(!databaseUrl)("places (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    await db.delete(schema.places);
    storage = new MemoryStorage();
  });

  describe("syncPlaces", () => {
    it("adds the places it is given", async () => {
      expect(await syncPlaces(db, [limsa, middle])).toMatchObject({ added: 2, retired: 0 });
      expect((await listPlaces(db)).flatMap((r) => r.places.map((p) => p.name))).toEqual([
        "リムサ・ロミンサ：上甲板層",
        "中央ラノシア",
      ]);
    });

    it("follows a renamed place without making a new one", async () => {
      await syncPlaces(db, [limsa]);
      await syncPlaces(db, [{ ...limsa, name: "テスト_新しい名前" }]);
      const rows = await db.select().from(schema.places);
      expect(rows.map((r) => r.name)).toEqual(["テスト_新しい名前"]);
    });

    it("stops offering a place the game no longer has, but keeps it", async () => {
      await syncPlaces(db, [limsa, middle]);
      expect(await syncPlaces(db, [limsa])).toMatchObject({ retired: 1 });
      expect((await listPlaces(db)).flatMap((r) => r.places.map((p) => p.name))).toEqual([
        "リムサ・ロミンサ：上甲板層",
      ]);
      expect(await db.select().from(schema.places)).toHaveLength(2);
    });

    it("offers a place again when it comes back", async () => {
      await syncPlaces(db, [limsa, middle]);
      await syncPlaces(db, [limsa]);
      await syncPlaces(db, [limsa, middle]);
      expect((await listPlaces(db))[0]!.places).toHaveLength(2);
    });

    it("refuses to retire everything when the source answers nothing", async () => {
      await syncPlaces(db, [limsa]);
      await expect(syncPlaces(db, [])).rejects.toThrow();
      expect((await listPlaces(db))[0]!.places).toHaveLength(1);
    });
  });

  describe("listPlaces", () => {
    it("groups places by region in the order the game has them", async () => {
      await syncPlaces(db, [gridania, limsa, middle]);
      expect((await listPlaces(db)).map((r) => r.name)).toEqual(["ラノシア", "黒衣森"]);
    });
  });

  describe("on a post", () => {
    async function upload(userId: string) {
      const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, userId, {
        mime: "image/webp",
        bytes: 1,
      });
      await storage.put({
        key: tmpKey(uploadId),
        body: new Uint8Array([1]),
        contentType: "image/webp",
      });
      return uploadId;
    }
    async function user() {
      const sub = randomUUID();
      const [row] = await db
        .insert(schema.users)
        .values({
          name: "テスト_利用者",
          email: `${sub}@lumorphia.placeholder.invalid`,
          handle: `pl_${sub.slice(0, 8)}`,
          lumorphiaSub: sub,
        })
        .returning();
      return row!;
    }
    const deps = () => ({ db, storage, jobs: new MemoryJobQueue() });
    const view = (userId: string, postId: string) =>
      getPost({ db, imageBaseUrl: "https://img.example.invalid" }, userId, postId);

    it("keeps a place chosen from the list", async () => {
      await syncPlaces(db, [limsa]);
      const [place] = await db.select().from(schema.places);
      const me = await user();
      const { postId } = await createPost(deps(), me.id, {
        uploadId: await upload(me.id),
        placeId: place!.id,
      });
      expect((await view(me.id, postId)).place).toEqual({
        id: place!.id,
        regionName: "ラノシア",
        name: "リムサ・ロミンサ：上甲板層",
      });
    });

    it("keeps a place written freely", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, {
        uploadId: await upload(me.id),
        placeText: "  テスト_ゴールドソーサー ",
      });
      expect((await view(me.id, postId)).place).toEqual({
        id: null,
        regionName: null,
        name: "テスト_ゴールドソーサー",
      });
    });

    it("has no place when none is given", async () => {
      const me = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await upload(me.id) });
      expect((await view(me.id, postId)).place).toBeNull();
    });

    it("refuses a place that is not offered", async () => {
      await syncPlaces(db, [limsa, middle]);
      await syncPlaces(db, [limsa]);
      const retired = (await db.select().from(schema.places)).find(
        (p) => p.sourceId === middle.sourceId,
      )!;
      const me = await user();
      await expect(
        createPost(deps(), me.id, { uploadId: await upload(me.id), placeId: retired.id }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("refuses both a chosen and a written place at once", async () => {
      await syncPlaces(db, [limsa]);
      const [place] = await db.select().from(schema.places);
      const me = await user();
      await expect(
        createPost(deps(), me.id, {
          uploadId: await upload(me.id),
          placeId: place!.id,
          placeText: "テスト_どこか",
        }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("refuses a written place that is too long", async () => {
      const me = await user();
      await expect(
        createPost(deps(), me.id, {
          uploadId: await upload(me.id),
          placeText: "あ".repeat(MAX_PLACE_TEXT_LENGTH + 1),
        }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("lets the owner change the place, and nobody else", async () => {
      await syncPlaces(db, [limsa]);
      const [place] = await db.select().from(schema.places);
      const me = await user();
      const other = await user();
      const { postId } = await createPost(deps(), me.id, { uploadId: await upload(me.id) });
      await changePlace({ db }, me.id, postId, { placeId: place!.id });
      expect((await view(me.id, postId)).place?.name).toBe("リムサ・ロミンサ：上甲板層");
      await changePlace({ db }, me.id, postId, {});
      expect((await view(me.id, postId)).place).toBeNull();
      await expect(changePlace({ db }, other.id, postId, { placeText: "x" })).rejects.toMatchObject(
        {
          code: "not_found",
        },
      );
    });

    it("keeps showing a chosen place after the game drops it", async () => {
      await syncPlaces(db, [limsa, middle]);
      const place = (await db.select().from(schema.places)).find(
        (p) => p.sourceId === middle.sourceId,
      )!;
      const me = await user();
      const { postId } = await createPost(deps(), me.id, {
        uploadId: await upload(me.id),
        placeId: place.id,
      });
      await syncPlaces(db, [limsa]);
      expect((await view(me.id, postId)).place?.name).toBe("中央ラノシア");
    });
  });
});
