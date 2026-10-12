import { describe, expect, it } from "vitest";
import { HttpPlaceSource } from "./xivapi-places.ts";

/** TerritoryType の行 (XIVAPI v2 の形)。値はゲームの地名で、利用者のデータではない */
function row(id: number, use: number, region: [number, string], place: [number, string]) {
  return {
    row_id: id,
    fields: {
      "TerritoryIntendedUse@as(raw)": use,
      PlaceNameRegion: { value: region[0], row_id: region[0], fields: { Name: region[1] } },
      PlaceName: { value: place[0], row_id: place[0], fields: { Name: place[1] } },
    },
  };
}

function fakeFetch(pages: object[][]) {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const impl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    headers.push((init?.headers ?? {}) as Record<string, string>);
    // 2 行ずつ返す。after より後の行を出し、尽きたら空
    const after = Number(url.searchParams.get("after") ?? "0");
    const rows = pages
      .flat()
      .filter((r) => (r as { row_id: number }).row_id > after)
      .slice(0, 2);
    return Response.json({ schema: "test", version: "test", rows });
  };
  return { urls, headers, impl: impl as typeof fetch };
}

const source = (impl: typeof fetch) =>
  new HttpPlaceSource({
    baseUrl: "https://xivapi.example.invalid/api",
    userAgent: "test-agent",
    fetch: impl,
  });

describe("HttpPlaceSource", () => {
  it("reads towns, fields, inns and housing areas with their regions", async () => {
    const { impl } = fakeFetch([
      [
        row(1, 0, [22, "ラノシア"], [28, "リムサ・ロミンサ：上甲板層"]),
        row(2, 1, [22, "ラノシア"], [30, "中央ラノシア"]),
        row(3, 2, [22, "ラノシア"], [179, "宿屋「ミズンマスト」"]),
        row(4, 13, [22, "ラノシア"], [425, "ミスト・ヴィレッジ"]),
      ],
    ]);
    expect(await source(impl).fetchPlaces()).toEqual([
      {
        sourceId: 28,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "リムサ・ロミンサ：上甲板層",
        kind: "town",
      },
      {
        sourceId: 30,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "中央ラノシア",
        kind: "field",
      },
      {
        sourceId: 179,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "宿屋「ミズンマスト」",
        kind: "inn",
      },
      {
        sourceId: 425,
        regionSourceId: 22,
        regionName: "ラノシア",
        name: "ミスト・ヴィレッジ",
        kind: "housing",
      },
    ]);
  });

  it("leaves out duties, events and places without a known region", async () => {
    const { impl } = fakeFetch([
      [
        row(1, 3, [22, "ラノシア"], [900, "サスタシャ浸食洞"]),
        row(2, 1, [0, ""], [901, "名前のない場所"]),
        row(3, 41, [999, "？？？？"], [902, "エウレカ：アネモス帯"]),
        row(4, 1, [998, "？？？？"], [903, "テスト_謎の場所"]),
        row(5, 1, [22, "ラノシア"], [0, ""]),
      ],
    ]);
    expect(await source(impl).fetchPlaces()).toEqual([]);
  });

  it("keeps one entry for a place that appears in several territories", async () => {
    const { impl } = fakeFetch([
      [
        row(1, 1, [22, "ラノシア"], [30, "中央ラノシア"]),
        row(2, 1, [22, "ラノシア"], [30, "中央ラノシア"]),
      ],
    ]);
    expect(await source(impl).fetchPlaces()).toHaveLength(1);
  });

  it("reads every page", async () => {
    const { impl, urls } = fakeFetch([
      [
        row(1, 1, [22, "ラノシア"], [30, "中央ラノシア"]),
        row(2, 1, [22, "ラノシア"], [31, "低地ラノシア"]),
        row(3, 1, [22, "ラノシア"], [32, "東ラノシア"]),
      ],
    ]);
    expect((await source(impl).fetchPlaces()).map((p) => p.sourceId)).toEqual([30, 31, 32]);
    expect(urls.length).toBeGreaterThan(1);
  });

  it("asks in Japanese and says who is asking", async () => {
    const { impl, urls, headers } = fakeFetch([
      [row(1, 1, [22, "ラノシア"], [30, "中央ラノシア"])],
    ]);
    await source(impl).fetchPlaces();
    expect(new URL(urls[0]!).searchParams.get("language")).toBe("ja");
    expect(headers[0]!["user-agent"]).toBe("test-agent");
  });

  it("fails on an answer it does not understand", async () => {
    const impl = (async () => Response.json({ unexpected: true })) as unknown as typeof fetch;
    await expect(source(impl).fetchPlaces()).rejects.toThrow();
  });

  it("fails when XIVAPI does not answer", async () => {
    const impl = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(source(impl).fetchPlaces()).rejects.toThrow(/503/);
  });
});
