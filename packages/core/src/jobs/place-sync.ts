import type { PlaceSource } from "../adapters/xivapi-places.ts";
import { syncPlaces } from "../domain/places.ts";
import type { JobDefinition } from "./context.ts";

/** 撮影場所の候補を XIVAPI から同期する。地名はパッチでしか変わらないので週 1 回 (月曜 4:30) */
export function createPlaceSyncJob(source: PlaceSource): JobDefinition<object> {
  return {
    name: "place-sync",
    cron: "30 4 * * 1",
    async handler(_data, { db, log }) {
      const result = await syncPlaces(db, await source.fetchPlaces());
      log.info(result, "places synced");
    },
  };
}
