import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@lumorphia/storage";
import { createDatabase, schema, type Database } from "@lumorphia-scenote/db";
import { createUpload, MAX_PENDING_UPLOADS, UPLOAD_TTL_MS } from "./uploads.ts";
import { tmpKey } from "../storage-keys.ts";

const databaseUrl = process.env.DATABASE_URL;
const MAX_BYTES = 1000;

// 画像の受け取りの枠 (docs/plan.md の S5a)
describe.skipIf(!databaseUrl)("uploads (PostgreSQL)", () => {
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
    storage = new MemoryStorage({ publicBaseUrl: "https://storage.example.invalid" });
  });

  async function user() {
    const sub = randomUUID();
    const [row] = await db
      .insert(schema.users)
      .values({
        name: "テスト_利用者",
        email: `${sub}@lumorphia.placeholder.invalid`,
        handle: `up_${sub.slice(0, 8)}`,
        lumorphiaSub: sub,
      })
      .returning();
    return row!;
  }
  const deps = () => ({ db, storage, maxBytes: MAX_BYTES });

  it("gives a signed PUT for the temporary place", async () => {
    const me = await user();
    const grant = await createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 });
    expect(grant.upload.url).toContain(tmpKey(grant.uploadId));
    expect(grant.upload.method).toBe("PUT");
  });

  it("remembers what the browser declared", async () => {
    const me = await user();
    const grant = await createUpload(deps(), me.id, { mime: "image/jpeg", bytes: 500 });
    const row = await db.query.uploads.findFirst({ where: eq(schema.uploads.id, grant.uploadId) });
    expect(row).toMatchObject({
      userId: me.id,
      declaredMime: "image/jpeg",
      declaredBytes: 500,
      status: "pending",
    });
  });

  it("lets the upload expire after a day", async () => {
    const me = await user();
    const now = new Date("2026-10-12T00:00:00.000Z");
    const grant = await createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 }, now);
    const row = await db.query.uploads.findFirst({ where: eq(schema.uploads.id, grant.uploadId) });
    expect(row?.expiresAt).toEqual(new Date(now.getTime() + UPLOAD_TTL_MS));
  });

  it("refuses a file larger than the limit", async () => {
    const me = await user();
    await expect(
      createUpload(deps(), me.id, { mime: "image/webp", bytes: MAX_BYTES + 1 }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("refuses an empty file", async () => {
    const me = await user();
    await expect(
      createUpload(deps(), me.id, { mime: "image/webp", bytes: 0 }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("refuses too many uploads waiting at once", async () => {
    const me = await user();
    for (let i = 0; i < MAX_PENDING_UPLOADS; i++)
      await createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 });
    await expect(
      createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("does not count expired uploads as waiting", async () => {
    const me = await user();
    const past = new Date(Date.now() - 2 * UPLOAD_TTL_MS);
    for (let i = 0; i < MAX_PENDING_UPLOADS; i++)
      await createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 }, past);
    await expect(
      createUpload(deps(), me.id, { mime: "image/webp", bytes: 500 }),
    ).resolves.toBeDefined();
  });
});
