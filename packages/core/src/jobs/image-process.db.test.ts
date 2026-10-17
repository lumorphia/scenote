import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SharpImageProcessor } from "@lumorphia/media";
import {
  CompositeImageModerator,
  DEFAULT_MODERATION_THRESHOLDS,
  FakeGameImageClassifier,
  FakeImageModerator,
} from "@lumorphia/moderation/image";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { createUpload } from "../domain/uploads.ts";
import { createPost } from "../domain/posts.ts";
import { isPrivateKey, tmpKey, variantKey } from "../storage-keys.ts";
import { MemoryJobQueue } from "./queue.ts";
import {
  createImageProcessJob,
  PRIVATE_IMAGE_CACHE_CONTROL,
  PUBLIC_IMAGE_CACHE_CONTROL,
} from "./image-process.ts";
import type { JobContext } from "./context.ts";

const databaseUrl = process.env.DATABASE_URL;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

/** WebP の RIFF のチャンクの名前を並べる */
function webpChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const size = view.getUint32(at + 4, true);
    names.push(new TextDecoder().decode(bytes.subarray(at, at + 4)));
    at += 8 + size + (size % 2);
  }
  return names;
}

/** 再編集用 WebP のように、知らないチャンク (同梱した元画像の代わり) を後ろに足す */
function withExtraChunk(webp: Uint8Array, fourcc: string, payload: Uint8Array): Uint8Array {
  const pad = payload.byteLength % 2;
  const out = new Uint8Array(webp.byteLength + 8 + payload.byteLength + pad);
  out.set(webp);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(fourcc), webp.byteLength);
  view.setUint32(webp.byteLength + 4, payload.byteLength, true);
  out.set(payload, webp.byteLength + 8);
  view.setUint32(4, out.byteLength - 8, true);
  return out;
}

/** テストの中で作る画像。EXIF と知らないチャンクを持つ WebP */
async function webpWithMetadata(): Promise<Uint8Array> {
  const base = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .withExif({ IFD0: { Artist: "test-artist", ImageDescription: "test-secret-place" } })
    .webp()
    .toBuffer();
  return withExtraChunk(
    new Uint8Array(base),
    "LMRC",
    new TextEncoder().encode("test-original-image"),
  );
}

// 派生画像のジョブ (docs/plan.md の S5a、ADR-0003)
describe.skipIf(!databaseUrl)("image-process job (PostgreSQL)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  let ctx: JobContext;
  const job = createImageProcessJob(new SharpImageProcessor());
  beforeAll(async () => {
    ({ db, close } = createDatabase(databaseUrl!));
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(schema.users);
    storage = new MemoryStorage();
    ctx = { db, storage, log: silent };
  });

  /** 受け取りから投稿を作るところまで (ブラウザが bytes を PUT した形) */
  async function postWith(
    bytes: Uint8Array,
    mime: "image/webp" | "image/jpeg" | "image/png",
    visibility: "public" | "unlisted" | "private" = "public",
  ) {
    const sub = randomUUID();
    const [me] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `ip_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    const { uploadId } = await createUpload({ db, storage, maxBytes: 30_000_000 }, me!.id, {
      mime,
      bytes: bytes.byteLength,
    });
    await storage.put({ key: tmpKey(uploadId), body: bytes, contentType: mime });
    const { postId } = await createPost({ db, storage, jobs: new MemoryJobQueue() }, me!.id, {
      uploadId,
      visibility,
    });
    const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
    return { postId, uploadId, base: post!.imageKeyBase };
  }
  const reload = (postId: string) =>
    db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });

  it("puts the display and thumbnail images as WebP", async () => {
    const { postId, base } = await postWith(await webpWithMetadata(), "image/webp");
    await job.handler({ postId }, ctx);
    for (const variant of ["display", "thumb"] as const)
      expect(await storage.head(variantKey(base, variant))).toMatchObject({
        contentType: "image/webp",
        cacheControl: PUBLIC_IMAGE_CACHE_CONTROL,
      });
  });

  it("publishes the post with the image's size", async () => {
    const { postId } = await postWith(await webpWithMetadata(), "image/webp");
    await job.handler({ postId }, ctx);
    const post = await reload(postId);
    expect(post).toMatchObject({ status: "published", width: 1600, height: 900, uploadId: null });
    expect(post?.publishedAt).toBeInstanceOf(Date);
    expect(post?.blurhash).toBeTruthy();
  });

  it("forgets the received image once the variants are made", async () => {
    const { postId, uploadId } = await postWith(await webpWithMetadata(), "image/webp");
    await job.handler({ postId }, ctx);
    expect(await storage.get(tmpKey(uploadId))).toBeNull();
  });

  it("drops EXIF and the bundled original from what it serves", async () => {
    const input = await webpWithMetadata();
    // 確かめる意味があるよう、元の画像には両方が入っている
    expect(webpChunks(input)).toEqual(expect.arrayContaining(["EXIF", "LMRC"]));
    const { postId, base } = await postWith(input, "image/webp");
    await job.handler({ postId }, ctx);
    for (const variant of ["display", "thumb"] as const) {
      const bytes = (await storage.get(variantKey(base, variant)))!;
      expect(webpChunks(bytes)).not.toContain("EXIF");
      expect(webpChunks(bytes)).not.toContain("LMRC");
      expect(Buffer.from(bytes).includes("test-secret-place")).toBe(false);
      expect(Buffer.from(bytes).includes("test-original-image")).toBe(false);
    }
  });

  it("accepts a JPEG", async () => {
    const jpeg = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const { postId } = await postWith(new Uint8Array(jpeg), "image/jpeg");
    await job.handler({ postId }, ctx);
    expect((await reload(postId))?.status).toBe("published");
  });

  it("marks the post failed when the content is not what was declared", async () => {
    const { postId } = await postWith(await webpWithMetadata(), "image/png");
    await job.handler({ postId }, ctx);
    expect(await reload(postId)).toMatchObject({
      status: "failed",
      failureReason: "mime_mismatch",
    });
  });

  it("forgets a received image it refused", async () => {
    const { postId, uploadId } = await postWith(new Uint8Array([1, 2, 3, 4]), "image/webp");
    await job.handler({ postId }, ctx);
    expect(await reload(postId)).toMatchObject({
      status: "failed",
      failureReason: "unsupported_format",
    });
    expect(await storage.get(tmpKey(uploadId))).toBeNull();
  });

  it("marks the post failed when the received image is gone", async () => {
    const { postId, uploadId } = await postWith(await webpWithMetadata(), "image/webp");
    await storage.delete([tmpKey(uploadId)]);
    await job.handler({ postId }, ctx);
    expect(await reload(postId)).toMatchObject({
      status: "failed",
      failureReason: "missing_upload",
    });
  });

  it("does nothing for a post that is already published", async () => {
    const { postId, base } = await postWith(await webpWithMetadata(), "image/webp");
    await job.handler({ postId }, ctx);
    await storage.delete([variantKey(base, "display")]);
    await job.handler({ postId }, ctx);
    expect(await storage.get(variantKey(base, "display"))).toBeNull();
  });

  it("does nothing for a post that no longer exists", async () => {
    await expect(job.handler({ postId: randomUUID() }, ctx)).resolves.toBeUndefined();
  });
  it("leaves a post unjudged when no moderator is given", async () => {
    const { postId } = await postWith(await webpWithMetadata(), "image/webp");
    await job.handler({ postId }, ctx);
    expect(await reload(postId)).toMatchObject({ moderationState: null, moderatedAt: null });
  });

  // 自動モデレーション (docs/plan.md の S5f、ADR-0014)。しきい値は書かず、パッケージの既定から決める (ADR-0007)
  describe("with a moderator", () => {
    const thresholds = DEFAULT_MODERATION_THRESHOLDS;
    const nsfw = new FakeImageModerator();
    const game = new FakeGameImageClassifier();
    const judged = createImageProcessJob(new SharpImageProcessor(), {
      moderator: new CompositeImageModerator(nsfw, game),
      thresholds,
    });
    beforeEach(() => {
      nsfw.reset();
      game.reset();
    });

    it("judges the display image, not the received one", async () => {
      const { postId, base } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      expect(nsfw.classified).toHaveLength(1);
      expect(Buffer.from(nsfw.classified[0]!)).toEqual(
        Buffer.from((await storage.get(variantKey(base, "display")))!),
      );
    });

    it("publishes a clear post and records the judgement", async () => {
      nsfw.nextScore(0);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      const post = await reload(postId);
      expect(post).toMatchObject({
        status: "published",
        moderationState: "clear",
        moderationScore: 0,
      });
      expect(post?.moderationLabels).toMatchObject({ nsfw: 0 });
      expect(post?.moderatedAt).toBeInstanceOf(Date);
    });

    it("publishes a flagged post but marks it for review", async () => {
      nsfw.nextScore((thresholds.review + thresholds.held) / 2);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      expect(await reload(postId)).toMatchObject({
        status: "published",
        moderationState: "flagged",
      });
    });

    it("holds a post whose image looks unsafe", async () => {
      nsfw.nextScore(1);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      const post = await reload(postId);
      expect(post).toMatchObject({ status: "held", moderationState: "held", publishedAt: null });
    });

    it("holds a post whose image does not look like the game", async () => {
      game.nextScore(0);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      expect(await reload(postId)).toMatchObject({ status: "held", moderationState: "held" });
    });

    it("keeps a held public post's images out of the public place", async () => {
      nsfw.nextScore(1);
      const { postId, base } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      const post = await reload(postId);
      expect(isPrivateKey(post!.imageKeyBase)).toBe(true);
      expect(await storage.get(variantKey(base, "display"))).toBeNull();
      for (const variant of ["display", "thumb"] as const)
        expect(await storage.head(variantKey(post!.imageKeyBase, variant))).toMatchObject({
          cacheControl: PRIVATE_IMAGE_CACHE_CONTROL,
        });
    });

    it("keeps a held post's chosen visibility", async () => {
      nsfw.nextScore(1);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp", "unlisted");
      await judged.handler({ postId }, ctx);
      expect((await reload(postId))?.visibility).toBe("unlisted");
    });

    it("forgets the received image of a held post", async () => {
      nsfw.nextScore(1);
      const { postId, uploadId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      expect(await storage.get(tmpKey(uploadId))).toBeNull();
    });

    it("does nothing for a post that is already held", async () => {
      nsfw.nextScore(1);
      const { postId } = await postWith(await webpWithMetadata(), "image/webp");
      await judged.handler({ postId }, ctx);
      await judged.handler({ postId }, ctx);
      expect(nsfw.classified).toHaveLength(1);
    });
  });
});
