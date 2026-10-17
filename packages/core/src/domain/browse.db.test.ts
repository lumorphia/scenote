import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { newImageKeyBase, variantKey } from "../storage-keys.ts";
import { replacePostTags, validateTags } from "./tags.ts";
import { canView, VISIBILITIES, type PostStatus, type Visibility } from "./posts.ts";
import { listPublicPosts } from "./browse.ts";

const databaseUrl = process.env.DATABASE_URL;
const IMAGE_BASE = "https://img.example.invalid";

// 投稿一覧 (docs/plan.md の S6a、ADR-0016)。出すのは公開の投稿だけで、見られるかは canView と食い違わない
describe.skipIf(!databaseUrl)("listing public posts (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
  });

  async function user(status: "active" | "deleted" = "active") {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `br_${sub.slice(0, 8)}`,
        image: "https://accounts.example.invalid/test-icon.webp",
        lumorphiaSub: sub,
        status,
        ...(status === "deleted" ? { deletedAt: new Date() } : {}),
      })
      .returning();
    return row!;
  }

  /** 派生画像ができたところの投稿の行を直接置く */
  async function post(
    userId: string,
    fields: {
      status?: PostStatus;
      visibility?: Visibility;
      publishedAt?: Date;
      title?: string;
      tags?: string[];
    } = {},
  ) {
    const id = randomUUID();
    const visibility = fields.visibility ?? "public";
    const status = fields.status ?? "published";
    const [row] = await db
      .insert(schema.posts)
      .values({
        id,
        userId,
        status,
        visibility,
        imageKeyBase: newImageKeyBase(id, visibility),
        width: 1600,
        height: 900,
        blurhash: "test-blurhash",
        title: fields.title ?? null,
        publishedAt: status === "published" ? (fields.publishedAt ?? new Date()) : null,
      })
      .returning();
    if (fields.tags) await replacePostTags(db, id, validateTags(fields.tags));
    return row!;
  }
  const list = (input: { cursor?: string; limit?: number } = {}) =>
    listPublicPosts({ db, imageBaseUrl: IMAGE_BASE }, input);
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));

  it("lists public posts, newest first", async () => {
    const me = await user();
    const older = await post(me.id, { publishedAt: at(1) });
    const newer = await post(me.id, { publishedAt: at(2) });
    expect((await list()).items.map((i) => i.id)).toEqual([newer.id, older.id]);
  });

  it("leaves out posts that are not public or not ready", async () => {
    const me = await user();
    await post(me.id, { visibility: "unlisted" });
    await post(me.id, { visibility: "private" });
    await post(me.id, { status: "processing" });
    await post(me.id, { status: "failed" });
    await post(me.id, { status: "held" });
    expect((await list()).items).toEqual([]);
  });

  it("leaves out the posts of someone who has left Lumorphia", async () => {
    const gone = await user("deleted");
    await post(gone.id);
    expect((await list()).items).toEqual([]);
  });

  it("lists exactly the public posts that anyone can view", async () => {
    const active = await user();
    const gone = await user("deleted");
    const statuses: PostStatus[] = ["processing", "published", "failed", "held"];
    const rows = [];
    for (const author of [active, gone])
      for (const status of statuses)
        for (const visibility of VISIBILITIES)
          rows.push({ author, row: await post(author.id, { status, visibility }) });
    const expected = rows
      .filter(({ author, row }) => row.visibility === "public" && canView(row, author.status, null))
      .map(({ row }) => row.id);
    expect((await list({ limit: 60 })).items.map((i) => i.id).sort()).toEqual(expected.sort());
  });

  it("shows the thumbnail, the size, the author and the tags", async () => {
    const me = await user();
    const row = await post(me.id, {
      title: "テスト_夕焼け",
      tags: ["#海", "旅"],
      publishedAt: at(3),
    });
    expect((await list()).items[0]).toEqual({
      id: row.id,
      title: "テスト_夕焼け",
      thumb: `${IMAGE_BASE}/${variantKey(row.imageKeyBase, "thumb")}`,
      width: 1600,
      height: 900,
      blurhash: "test-blurhash",
      author: { handle: me.handle, name: "テスト_利用者", image: me.image },
      tags: [
        { name: "海", displayName: "海" },
        { name: "旅", displayName: "旅" },
      ],
      publishedAt: at(3),
    });
  });

  it("reads the next page from where the last one ended", async () => {
    const me = await user();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.unshift((await post(me.id, { publishedAt: at(i) })).id);
    const first = await list({ limit: 2 });
    const second = await list({ limit: 2, cursor: first.nextCursor! });
    const third = await list({ limit: 2, cursor: second.nextCursor! });
    expect([...first.items, ...second.items, ...third.items].map((i) => i.id)).toEqual(ids);
    expect(third.nextCursor).toBeNull();
  });

  it("keeps posts published at the same moment apart across pages", async () => {
    const me = await user();
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) ids.add((await post(me.id, { publishedAt: at(5) })).id);
    const first = await list({ limit: 2 });
    const second = await list({ limit: 2, cursor: first.nextCursor! });
    expect(new Set([...first.items, ...second.items].map((i) => i.id))).toEqual(ids);
  });

  it("says there is no next page when the last page is exactly full", async () => {
    const me = await user();
    await post(me.id, { publishedAt: at(1) });
    await post(me.id, { publishedAt: at(2) });
    expect((await list({ limit: 2 })).nextCursor).toBeNull();
  });

  it("refuses a cursor it did not make", async () => {
    await expect(list({ cursor: "test-not-a-cursor" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("does not list a post once it is made private", async () => {
    const me = await user();
    const row = await post(me.id);
    await db.update(schema.posts).set({ visibility: "private" }).where(eq(schema.posts.id, row.id));
    expect((await list()).items).toEqual([]);
  });
});
