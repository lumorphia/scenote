import { createDatabase } from "@lumorphia-scenote/db";
import { HttpPlaceSource } from "@lumorphia-scenote/core/adapters/xivapi-places";
import { syncPlaces } from "@lumorphia-scenote/core/domain/places";
import { XIVAPI_USER_AGENT } from "./worker.ts";

/**
 * 撮影場所の候補を今すぐ同期する。開発 (アプリの中のジョブは cron を回さない) と、本番の最初の 1 回に使う。
 * 以後は worker が週 1 回同期する (place-sync)
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, close } = createDatabase(url);
try {
  const source = new HttpPlaceSource({
    baseUrl: process.env.XIVAPI_BASE_URL || "https://v2.xivapi.com/api",
    userAgent: XIVAPI_USER_AGENT,
  });
  console.log(await syncPlaces(db, await source.fetchPlaces()));
} finally {
  await close();
}
