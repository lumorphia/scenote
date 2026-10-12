import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { PlaceRecord } from "../adapters/xivapi-places.ts";

/**
 * 地名の候補を同期する。同じ場所 (source_id) は名前を書き換え、無くなった場所は消さずに retired_at を付ける
 * (投稿が指しているため)。空の答えは XIVAPI の不調とみなして何も変えない
 */
export async function syncPlaces(
  db: Database,
  records: readonly PlaceRecord[],
  now: Date = new Date(),
): Promise<{ added: number; updated: number; retired: number }> {
  if (records.length === 0)
    throw new Error("place source returned nothing; refusing to retire every place");
  return db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ sourceId: schema.places.sourceId }).from(schema.places)).map(
        (r) => r.sourceId,
      ),
    );
    for (const r of records)
      await tx
        .insert(schema.places)
        .values({ ...r, syncedAt: now })
        .onConflictDoUpdate({
          target: schema.places.sourceId,
          set: {
            regionSourceId: r.regionSourceId,
            regionName: r.regionName,
            name: r.name,
            kind: r.kind,
            syncedAt: now,
            retiredAt: null,
          },
        });
    const retired = await tx
      .update(schema.places)
      .set({ retiredAt: now })
      .where(
        and(
          isNull(schema.places.retiredAt),
          notInArray(
            schema.places.sourceId,
            records.map((r) => r.sourceId),
          ),
        ),
      )
      .returning({ id: schema.places.id });
    const added = records.filter((r) => !existing.has(r.sourceId)).length;
    return { added, updated: records.length - added, retired: retired.length };
  });
}

export type PlaceRegion = {
  name: string;
  places: { id: string; name: string; kind: PlaceRecord["kind"] }[];
};

/** 候補を地域ごとに。並びはゲームの順 (row_id) */
export async function listPlaces(db: Database): Promise<PlaceRegion[]> {
  const rows = await db
    .select()
    .from(schema.places)
    .where(isNull(schema.places.retiredAt))
    .orderBy(asc(schema.places.regionSourceId), asc(schema.places.sourceId));
  const regions: PlaceRegion[] = [];
  for (const row of rows) {
    const last = regions.at(-1);
    const place = { id: row.id, name: row.name, kind: row.kind };
    if (last && last.name === row.regionName) last.places.push(place);
    else regions.push({ name: row.regionName, places: [place] });
  }
  return regions;
}

/** 候補として選べる場所か (退いた場所は新しく選べない) */
export async function isOfferedPlace(db: Database, placeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.places.id })
    .from(schema.places)
    .where(and(eq(schema.places.id, placeId), isNull(schema.places.retiredAt)));
  return Boolean(row);
}
