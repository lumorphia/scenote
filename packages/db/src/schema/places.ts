import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./_common.ts";

/**
 * 撮影場所の候補 (要件定義書 10 章)。XIVAPI の地名を同期して持ち、投稿のたびに外へ聞かない
 * (lumorphia/prismtone の ADR-0008 の考え方)。地域 → 場所の 2 階層。
 * 投稿が指すので消さない。ゲームから消えたら retired_at を付けて候補に出さない
 */
export const places = pgTable(
  "places",
  {
    id: id(),
    /** XIVAPI の PlaceName の row_id (場所の名前)。同期で同じ場所を見分ける */
    sourceId: integer("source_id").notNull(),
    /** 地域 (PlaceNameRegion) の row_id と名前 */
    regionSourceId: integer("region_source_id").notNull(),
    regionName: text("region_name").notNull(),
    name: text("name").notNull(),
    /** town: 街、field: フィールド、inn: 宿屋、housing: ハウジングエリア */
    kind: text("kind", { enum: ["town", "field", "inn", "housing"] }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("places_source_idx").on(t.sourceId),
    index("places_region_idx").on(t.regionSourceId),
  ],
);
