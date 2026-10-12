import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { MemoryJobQueue } from "../jobs/queue.ts";
import { uploadCleanupJob } from "../jobs/cleanup.ts";
import { tmpKey } from "../storage-keys.ts";
import { createUpload } from "./uploads.ts";
import { changeTags, createPost, getPost } from "./posts.ts";

const databaseUrl = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

// タグ (要件定義書 11 章、docs/plan.md の S5d)
describe.skipIf(!databaseUrl)("post tags (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  let jobs: MemoryJobQueue;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    await db.delete(schema.tags);
    storage = new MemoryStorage();
    jobs = new MemoryJobQueue();
  });

  async function user() {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `tg_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  async function postWith(userId: string, tags?: string[]) {
    const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, userId, {
      mime: "image/webp",
      bytes: 1,
    });
    await storage.put({
      key: tmpKey(uploadId),
      body: new Uint8Array([1]),
      contentType: "image/webp",
    });
    const { postId } = await createPost({ db, storage, jobs }, userId, {
      uploadId,
      ...(tags ? { tags } : {}),
    });
    return postId;
  }
  const tagsSeenBy = async (viewerId: string, postId: string) =>
    (await getPost({ db, imageBaseUrl: "https://img.example.invalid" }, viewerId, postId)).tags;

  it("keeps the tags in the order they were written", async () => {
    const me = await user();
    const postId = await postWith(me.id, ["#夕焼け", "リムサ・ロミンサ", "旅"]);
    expect((await tagsSeenBy(me.id, postId)).map((t) => t.displayName)).toEqual([
      "夕焼け",
      "リムサ・ロミンサ",
      "旅",
    ]);
  });

  it("lets a post have no tags", async () => {
    const me = await user();
    expect(await tagsSeenBy(me.id, await postWith(me.id))).toEqual([]);
  });

  it("shares one tag between posts that spell it differently", async () => {
    const me = await user();
    await postWith(me.id, ["Night"]);
    await postWith(me.id, ["ＮＩＧＨＴ"]);
    expect(await db.select().from(schema.tags)).toHaveLength(1);
  });

  it("lets the owner change the tags", async () => {
    const me = await user();
    const postId = await postWith(me.id, ["夜景", "旅"]);
    await changeTags({ db }, me.id, postId, ["旅", "#記念撮影"]);
    expect((await tagsSeenBy(me.id, postId)).map((t) => t.name)).toEqual(["旅", "記念撮影"]);
  });

  it("does not let someone else change the tags", async () => {
    const me = await user();
    const other = await user();
    const postId = await postWith(me.id, ["夜景"]);
    await expect(changeTags({ db }, other.id, postId, ["test-x"])).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses more than ten tags", async () => {
    const me = await user();
    const { uploadId } = await createUpload({ db, storage, maxBytes: 1000 }, me.id, {
      mime: "image/webp",
      bytes: 1,
    });
    await storage.put({
      key: tmpKey(uploadId),
      body: new Uint8Array([1]),
      contentType: "image/webp",
    });
    await expect(
      createPost({ db, storage, jobs }, me.id, {
        uploadId,
        tags: Array.from({ length: 11 }, (_, i) => `test-${i}`),
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("forgets tags no post uses any more", async () => {
    const me = await user();
    const postId = await postWith(me.id, ["test-gone", "test-kept"]);
    await postWith(me.id, ["test-kept"]);
    await changeTags({ db }, me.id, postId, []);
    await uploadCleanupJob.handler({}, { db, storage, log: silent });
    expect((await db.select().from(schema.tags)).map((t) => t.name)).toEqual(["test-kept"]);
  });
});
