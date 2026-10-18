import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { newImageKeyBase, variantKey } from "../storage-keys.ts";
import { replacePostTags, validateTags } from "./tags.ts";
import { canView, VISIBILITIES, type PostStatus, type Visibility } from "./posts.ts";
import { getPublicProfile, listPublicPosts } from "./browse.ts";

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
      placeId?: string;
      placeText?: string;
      takenOn?: string;
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
        placeId: fields.placeId ?? null,
        placeText: fields.placeText ?? null,
        takenOn: fields.takenOn ?? null,
        publishedAt: status === "published" ? (fields.publishedAt ?? new Date()) : null,
      })
      .returning();
    if (fields.tags) await replacePostTags(db, id, validateTags(fields.tags));
    return row!;
  }
  const list = (
    input: {
      cursor?: string;
      limit?: number;
      tag?: string;
      author?: string;
      placeId?: string;
      q?: string;
    } = {},
  ) => listPublicPosts({ db, imageBaseUrl: IMAGE_BASE }, input);
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));

  it("lists only public photos from the selected place", async () => {
    const me = await user();
    const [place] = await db
      .insert(schema.places)
      .values({
        sourceId: 30,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "中央ラノシア",
        kind: "field",
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.places.sourceId, set: { name: "中央ラノシア" } })
      .returning();
    const matching = await post(me.id, { placeId: place!.id });
    await post(me.id);
    await post(me.id, { placeId: place!.id, visibility: "unlisted" });
    await post(me.id, { placeId: place!.id, visibility: "private" });
    expect((await list({ placeId: place!.id })).items.map((p) => p.id)).toEqual([matching.id]);
  });

  it("includes the shooting date and place in a photo card", async () => {
    const me = await user();
    const [place] = await db
      .insert(schema.places)
      .values({
        sourceId: 2956,
        regionSourceId: 2950,
        regionName: "ノルヴラント",
        name: "イル・メグ",
        kind: "field",
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.places.sourceId, set: { name: "イル・メグ" } })
      .returning();
    await post(me.id, { placeId: place!.id, takenOn: "2026-10-12" });
    expect((await list()).items[0]).toMatchObject({
      takenOn: "2026-10-12",
      place: { id: place!.id, sourceId: 2956, name: "イル・メグ", regionName: "ノルヴラント" },
    });
  });

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
      takenOn: null,
      place: null,
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
  // タグ検索 (S6c、要件定義書 11 章)。出るのは公開の投稿だけ
  describe("by tag", () => {
    it("lists the public posts with the tag", async () => {
      const me = await user();
      const tagged = await post(me.id, { tags: ["夕焼け"] });
      await post(me.id, { tags: ["夜景"] });
      expect((await list({ tag: "夕焼け" })).items.map((i) => i.id)).toEqual([tagged.id]);
    });

    it("finds the tag however it is written", async () => {
      const me = await user();
      const tagged = await post(me.id, { tags: ["Gold Saucer"] });
      await post(me.id);
      expect((await list({ tag: "#ｇｏｌｄ  saucer" })).items.map((i) => i.id)).toEqual([
        tagged.id,
      ]);
    });

    it("leaves out tagged posts that are not public", async () => {
      const me = await user();
      await post(me.id, { tags: ["夕焼け"], visibility: "unlisted" });
      await post(me.id, { tags: ["夕焼け"], status: "held" });
      expect((await list({ tag: "夕焼け" })).items).toEqual([]);
    });

    it("pages within the tag", async () => {
      const me = await user();
      for (let i = 0; i < 3; i++) await post(me.id, { tags: ["旅"], publishedAt: at(i) });
      await post(me.id, { publishedAt: at(9) });
      const first = await list({ tag: "旅", limit: 2 });
      const second = await list({ tag: "旅", limit: 2, cursor: first.nextCursor! });
      expect(first.items.length + second.items.length).toBe(3);
      expect(second.nextCursor).toBeNull();
    });

    it("finds nothing for a tag nobody uses", async () => {
      expect((await list({ tag: "テスト_無いタグ" })).items).toEqual([]);
    });
  });

  // 検索 (S6f、ADR-0028)。言葉ごとに、タイトル・タグ・地点のどれかに含む公開の投稿
  describe("by words", () => {
    async function place(sourceId: number, regionName: string, name: string) {
      const [row] = await db
        .insert(schema.places)
        .values({
          sourceId,
          regionSourceId: 22,
          regionName,
          name,
          kind: "field",
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({ target: schema.places.sourceId, set: { regionName, name } })
        .returning();
      return row!;
    }
    const ids = async (input: Parameters<typeof list>[0]) =>
      (await list(input)).items.map((i) => i.id).sort();

    it("finds a word inside a title", async () => {
      const me = await user();
      const hit = await post(me.id, { title: "テスト_浜辺の夕焼けと船" });
      await post(me.id, { title: "テスト_朝の市場" });
      await post(me.id);
      expect(await ids({ q: "夕焼け" })).toEqual([hit.id]);
    });

    it("finds a word inside a tag", async () => {
      const me = await user();
      const hit = await post(me.id, { tags: ["夕焼け空"] });
      await post(me.id, { tags: ["夜景"] });
      expect(await ids({ q: "夕焼け" })).toEqual([hit.id]);
    });

    it("finds a word in the chosen place, its region, or a place typed in", async () => {
      const me = await user();
      const lavender = await place(9101, "黒衣森", "ラベンダーベッド");
      const byName = await post(me.id, { placeId: lavender.id });
      const byText = await post(me.id, { placeText: "テスト_ラベンダーベッドの裏庭" });
      await post(me.id, { placeText: "テスト_ミスト・ヴィレッジ" });
      expect(await ids({ q: "ラベンダー" })).toEqual([byName.id, byText.id].sort());
      expect(await ids({ q: "黒衣森" })).toEqual([byName.id]);
    });

    it("needs every word to be found somewhere", async () => {
      const me = await user();
      const lavender = await place(9102, "黒衣森", "ラベンダーベッド");
      const both = await post(me.id, { title: "テスト_夕焼け", placeId: lavender.id });
      await post(me.id, { title: "テスト_夕焼け" });
      await post(me.id, { placeId: lavender.id });
      expect(await ids({ q: "夕焼け ラベンダー" })).toEqual([both.id]);
    });

    it("finds the words however their width and case are written", async () => {
      const me = await user();
      const hit = await post(me.id, { title: "テスト_ＧＯＬＤ Saucer の夜" });
      await post(me.id, { title: "テスト_Gold の夜" });
      expect(await ids({ q: "gold ｓａｕｃｅｒ" })).toEqual([hit.id]);
    });

    it("reads % and _ as letters, not as wildcards", async () => {
      const me = await user();
      const percent = await post(me.id, { title: "テスト 100%の夕焼け" });
      const underscore = await post(me.id, { title: "テスト a_b" });
      await post(me.id, { title: "テスト 1000の夕焼け" });
      await post(me.id, { title: "テスト axb" });
      expect(await ids({ q: "100%" })).toEqual([percent.id]);
      expect(await ids({ q: "a_b" })).toEqual([underscore.id]);
    });

    it("leaves out matching posts that are not public", async () => {
      const me = await user();
      await post(me.id, { title: "テスト_夕焼け", visibility: "unlisted" });
      await post(me.id, { title: "テスト_夕焼け", visibility: "private" });
      await post(me.id, { title: "テスト_夕焼け", status: "held" });
      expect(await ids({ q: "夕焼け" })).toEqual([]);
    });

    it("narrows the words by a tag and a place together", async () => {
      const me = await user();
      const lavender = await place(9103, "黒衣森", "ラベンダーベッド");
      const hit = await post(me.id, { title: "テスト_夕焼け", tags: ["海"], placeId: lavender.id });
      await post(me.id, { title: "テスト_夕焼け", tags: ["海"] });
      await post(me.id, { title: "テスト_夕焼け", placeId: lavender.id });
      expect(await ids({ q: "夕焼け", tag: "海", placeId: lavender.id })).toEqual([hit.id]);
    });

    it("lists every public post when the words are blank", async () => {
      const me = await user();
      const a = await post(me.id, { title: "テスト_一枚目" });
      const b = await post(me.id);
      expect(await ids({ q: "  #  " })).toEqual([a.id, b.id].sort());
    });

    it("pages within the results", async () => {
      const me = await user();
      for (let i = 0; i < 3; i++)
        await post(me.id, { title: `テスト_夕焼け${i}`, publishedAt: at(i) });
      await post(me.id, { title: "テスト_朝", publishedAt: at(9) });
      const first = await list({ q: "夕焼け", limit: 2 });
      const second = await list({ q: "夕焼け", limit: 2, cursor: first.nextCursor! });
      expect(first.items.length + second.items.length).toBe(3);
      expect(second.nextCursor).toBeNull();
    });
  });

  // 利用者のページ (S6c、要件定義書 9.1)。出るのは公開の投稿だけ
  describe("by author", () => {
    it("lists the public posts of one person", async () => {
      const me = await user();
      const other = await user();
      const mine = await post(me.id);
      await post(other.id);
      await post(me.id, { visibility: "private" });
      expect((await list({ author: me.handle })).items.map((i) => i.id)).toEqual([mine.id]);
    });

    it("shows a person's name and icon", async () => {
      const me = await user();
      expect(await getPublicProfile(db, me.handle)).toEqual({
        handle: me.handle,
        name: "テスト_利用者",
        image: me.image,
      });
    });

    it("does not show someone who has left Lumorphia", async () => {
      const gone = await user("deleted");
      await expect(getPublicProfile(db, gone.handle)).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("does not show a handle nobody has", async () => {
      await expect(getPublicProfile(db, "test_nobody")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });
});
