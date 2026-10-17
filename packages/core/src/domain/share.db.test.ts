import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { newImageKeyBase, variantKey } from "../storage-keys.ts";
import type { PostStatus, Visibility } from "./posts.ts";
import { getPostShare } from "./share.ts";

const databaseUrl = process.env.DATABASE_URL;
const IMAGE_BASE = "https://img.example.invalid";

// 共有 (S6e、要件定義書 9.1・16 章)。OGP を出すのは公開と限定公開の、ほかの人が見られる投稿だけ
describe.skipIf(!databaseUrl)("sharing a post (PostgreSQL)", () => {
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
        handle: `sh_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
        status,
        ...(status === "deleted" ? { deletedAt: new Date() } : {}),
      })
      .returning();
    return row!;
  }
  async function post(
    userId: string,
    fields: { status?: PostStatus; visibility?: Visibility; title?: string; body?: string } = {},
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
        imageKeyBase: newImageKeyBase(id, status === "held" ? "private" : visibility),
        width: 1600,
        height: 900,
        title: fields.title ?? null,
        body: fields.body ?? null,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning();
    return row!;
  }
  const share = (postId: string) => getPostShare({ db, imageBaseUrl: IMAGE_BASE }, postId);

  it("shares a public post with its title, words and sharing image", async () => {
    const me = await user();
    const row = await post(me.id, { title: "テスト_夕焼け", body: "テスト_本文" });
    expect(await share(row.id)).toEqual({
      title: "テスト_夕焼け",
      description: "テスト_本文",
      image: `${IMAGE_BASE}/${variantKey(row.imageKeyBase, "ogp")}`,
      author: { handle: me.handle, name: "テスト_利用者" },
      visibility: "public",
    });
  });

  it("shares an unlisted post too", async () => {
    const me = await user();
    const row = await post(me.id, { visibility: "unlisted" });
    expect((await share(row.id))?.visibility).toBe("unlisted");
  });

  it("names the photo after its author when it has no title", async () => {
    const me = await user();
    const row = await post(me.id);
    expect(await share(row.id)).toMatchObject({
      title: "テスト_利用者 さんの写真",
      description: null,
    });
  });

  it.each([
    ["a private post", { visibility: "private" as const }],
    ["a held post", { status: "held" as const }],
    ["a post still being made", { status: "processing" as const }],
    ["a refused post", { status: "failed" as const }],
  ])("shares nothing for %s", async (_, fields) => {
    const me = await user();
    const row = await post(me.id, fields);
    expect(await share(row.id)).toBeNull();
  });

  it("shares nothing for the post of someone who has left", async () => {
    const gone = await user("deleted");
    const row = await post(gone.id);
    expect(await share(row.id)).toBeNull();
  });

  it("shares nothing for a post that does not exist", async () => {
    expect(await share(randomUUID())).toBeNull();
    expect(await share("test-not-an-id")).toBeNull();
  });
});
