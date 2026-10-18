import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";

/** 地名同期と同じ対象のエリア地図を、閲覧時の外部通信なしで配信できるよう用意する。 */
const named = z.object({
  row_id: z.number().int(),
  fields: z.object({ Name: z.string().optional() }),
});
const pageSchema = z.object({
  rows: z.array(
    z.object({
      row_id: z.number().int(),
      fields: z.object({
        Map: z.object({ fields: z.object({ Id: z.string() }) }),
        PlaceName: named,
        PlaceNameRegion: named,
        "TerritoryIntendedUse@as(raw)": z.number().int(),
      }),
    }),
  ),
});
type Area = {
  sourceId: number;
  name: string;
  regionName: string;
  mapId: string;
  territoryId: number;
};
const found = new Map<number, Area>();
const seen = new Set<number>();
for (let after = 0; ;) {
  const url = new URL("https://v2.xivapi.com/api/sheet/TerritoryType");
  url.search = new URLSearchParams({
    limit: "500",
    after: String(after),
    language: "ja",
    fields: "Map.Id,PlaceName.Name,PlaceNameRegion.Name,TerritoryIntendedUse@as(raw)",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TerritoryType: ${res.status}`);
  const { rows } = pageSchema.parse(await res.json());
  if (!rows.length) break;
  for (const row of rows) {
    const f = row.fields;
    const sourceId = f.PlaceName.row_id;
    const name = f.PlaceName.fields.Name?.trim();
    const regionName = f.PlaceNameRegion.fields.Name?.trim();
    if (
      ![0, 1, 2, 13].includes(f["TerritoryIntendedUse@as(raw)"]) ||
      !name ||
      !regionName ||
      /^[？?]+$/.test(regionName) ||
      seen.has(sourceId)
    )
      continue;
    seen.add(sourceId);
    const mapId = f.Map.fields.Id;
    if (/^[a-z0-9]+\/\d{2}$/.test(mapId))
      found.set(sourceId, { sourceId, name, regionName, mapId, territoryId: row.row_id });
  }
  after = rows.at(-1)!.row_id;
}
if (!found.size) throw new Error("No maps returned; keeping the current catalogue");
const root = new URL("../public/maps/", import.meta.url);
await mkdir(root, { recursive: true });
for (const area of found.values()) {
  const [zone, level] = area.mapId.split("/");
  const url = new URL("https://v2.xivapi.com/api/asset");
  url.search = new URLSearchParams({
    path: `ui/map/${area.mapId}/${zone}${level}_m.tex`,
    format: "png",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map ${area.sourceId}: ${res.status}`);
  await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(1024)
    .webp({ quality: 78 })
    .toFile(new URL(`${area.sourceId}.webp`, root).pathname);
}
const catalogue = [...found.values()];
await writeFile(
  new URL("sources.json", root),
  JSON.stringify(
    {
      copyright: "© SQUARE ENIX",
      retrievedAt: new Date().toISOString().slice(0, 10),
      source: "https://v2.xivapi.com/api/sheet/TerritoryType",
      maps: catalogue,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  new URL("../web/features/journal/mapped-place-ids.ts", import.meta.url),
  `// scripts/sync-map-assets.ts が作る地図の対応表。出典は public/maps/sources.json。\nexport const MAPPED_PLACE_IDS: readonly number[] = ${JSON.stringify(catalogue.map((p) => p.sourceId))};\n`,
);
console.log(`${found.size} area maps saved. Run pnpm format before committing.`);
