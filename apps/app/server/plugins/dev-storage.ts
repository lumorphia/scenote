import fp from "fastify-plugin";
import { FsStorage, MemoryStorage } from "@lumorphia/storage";
import { DEV_STORAGE_PATH } from "../env.ts";

/**
 * 開発とテスト専用。R2 の代わりに、アプリ自身が /_storage でブラウザからの PUT を受け取り、画像を配る
 * (lumorphia/prismtone と同じ)。production と S3 互換のストレージでは登録しない
 */
export const devStoragePlugin = fp(
  async (app) => {
    const storage = app.storage;
    if (!(storage instanceof MemoryStorage || storage instanceof FsStorage)) return;
    if (app.env.NODE_ENV === "production") return;

    await app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        "*",
        { parseAs: "buffer", bodyLimit: app.env.UPLOAD_MAX_BYTES + 1024 },
        (_req, body, done) => done(null, body),
      );
      scope.put<{ Params: { "*": string } }>(
        `${DEV_STORAGE_PATH}/*`,
        { schema: { hide: true } },
        async (req, reply) => {
          await storage.put({
            key: req.params["*"],
            body: new Uint8Array(req.body as Buffer),
            contentType: req.headers["content-type"] ?? "application/octet-stream",
          });
          return reply.code(200).send();
        },
      );
      scope.get<{ Params: { "*": string } }>(
        `${DEV_STORAGE_PATH}/*`,
        { schema: { hide: true } },
        async (req, reply) => {
          const key = req.params["*"];
          const [meta, body] = await Promise.all([storage.head(key), storage.get(key)]);
          if (!meta || !body) return reply.code(404).send();
          reply.header("content-type", meta.contentType ?? "application/octet-stream");
          if (meta.cacheControl) reply.header("cache-control", meta.cacheControl);
          return reply.send(Buffer.from(body));
        },
      );
    });
    app.log.warn("dev storage enabled: images are put to and served from /_storage");
  },
  { name: "dev-storage", dependencies: ["storage"] },
);
