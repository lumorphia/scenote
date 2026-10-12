import { z } from "zod";

/** 撮影場所の候補の 1 件。XIVAPI の PlaceName と PlaceNameRegion の row_id で見分ける */
export type PlaceRecord = {
  sourceId: number;
  regionSourceId: number;
  regionName: string;
  name: string;
  kind: "town" | "field" | "inn" | "housing";
};

export interface PlaceSource {
  fetchPlaces(): Promise<PlaceRecord[]>;
}

/**
 * TerritoryType の用途 (TerritoryIntendedUse) のうち、候補にするもの。ID・討滅戦・イベント・
 * ハウジングの屋内は、同じ名前の版がいくつもあり候補が濁るので入れない (自由入力で書ける)
 */
const KINDS: Record<number, PlaceRecord["kind"]> = {
  0: "town",
  1: "field",
  2: "inn",
  13: "housing",
};
/** 地域の名前が決まっていない行 (エウレカなど) */
const UNKNOWN_REGION = /^[？?]+$/;

const named = z.object({
  row_id: z.number().int().nonnegative(),
  fields: z.object({ Name: z.string().optional() }),
});
const pageSchema = z.object({
  rows: z.array(
    z.object({
      row_id: z.number().int().nonnegative(),
      fields: z.object({
        "TerritoryIntendedUse@as(raw)": z.number().int(),
        PlaceNameRegion: named,
        PlaceName: named,
      }),
    }),
  ),
});

const PAGE_SIZE = 500;

/** XIVAPI v2 から地名を読む (lumorphia/prismtone の XIVAPI の読み方と同じ v2) */
export class HttpPlaceSource implements PlaceSource {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  constructor(options: { baseUrl: string; userAgent: string; fetch?: typeof fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.userAgent = options.userAgent;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetchPlaces(): Promise<PlaceRecord[]> {
    const found = new Map<number, PlaceRecord>();
    for (let after = 0; ;) {
      const url = new URL(`${this.baseUrl}/sheet/TerritoryType`);
      url.searchParams.set(
        "fields",
        "PlaceNameRegion.Name,PlaceName.Name,TerritoryIntendedUse@as(raw)",
      );
      url.searchParams.set("language", "ja");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("after", String(after));
      const res = await this.fetchImpl(url, { headers: { "user-agent": this.userAgent } });
      if (!res.ok) throw new Error(`xivapi TerritoryType: ${res.status}`);
      const page = pageSchema.parse(await res.json());
      if (page.rows.length === 0) break;
      for (const r of page.rows) {
        const kind = KINDS[r.fields["TerritoryIntendedUse@as(raw)"]];
        const region = r.fields.PlaceNameRegion.fields.Name?.trim() ?? "";
        const name = r.fields.PlaceName.fields.Name?.trim() ?? "";
        if (!kind || !region || !name || UNKNOWN_REGION.test(region)) continue;
        if (found.has(r.fields.PlaceName.row_id)) continue;
        found.set(r.fields.PlaceName.row_id, {
          sourceId: r.fields.PlaceName.row_id,
          regionSourceId: r.fields.PlaceNameRegion.row_id,
          regionName: region,
          name,
          kind,
        });
      }
      after = page.rows.at(-1)!.row_id;
    }
    return [...found.values()];
  }
}
