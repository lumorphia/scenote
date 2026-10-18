import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AreaMap } from "./AreaMap.tsx";
import { areaMap } from "./maps.ts";
import type { JournalPlace, MapRegion } from "./maps.ts";
import type { PostPage } from "../post-list/PostFeed.tsx";

/** 地域とエリアから公開写真を探す。場所を切り替えると地図と写真を一緒に読み直す。 */
export function PlacesExplorer({
  regions,
  preferredPlaceId,
}: {
  regions: readonly MapRegion[];
  preferredPlaceId?: string | undefined;
}) {
  const places = regions.flatMap((region) =>
    region.places
      .filter((p) => areaMap(p.sourceId))
      .map((p) => ({ ...p, regionName: region.name })),
  );
  const [placeId, setPlaceId] = useState(preferredPlaceId ?? places[0]?.id ?? "");
  const place = places.find((p) => p.id === placeId) ?? places[0];
  const [result, setResult] = useState<{
    placeId: string;
    page: PostPage | null;
    failed: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!place) return;
    const id = place.id;
    const controller = new AbortController();
    void fetch(`/api/posts?placeId=${encodeURIComponent(id)}&limit=6`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("place photos unavailable");
        return res.json() as Promise<PostPage>;
      })
      .then((page) => {
        if (!controller.signal.aborted) setResult({ placeId: id, page, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ placeId: id, page: null, failed: true });
      });
    return () => controller.abort();
  }, [place?.id, attempt]);
  const current = result?.placeId === place?.id ? result : null;
  return (
    <section id="map" className="journal-map-section" aria-labelledby="map-title">
      <div className="journal-section-heading">
        <div>
          <p className="journal-eyebrow">PLACES & MEMORIES</p>
          <h2 id="map-title">地図から写真を探す</h2>
        </div>
      </div>
      {!place ? (
        <p className="text-sm text-ink-muted">撮影場所の地図を準備しています。</p>
      ) : (
        <>
          <div className="journal-place-selectors">
            <label>
              地域
              <select
                value={place.regionName}
                onChange={(event) =>
                  setPlaceId(places.find((p) => p.regionName === event.target.value)!.id)
                }
              >
                {regions
                  .filter((r) => places.some((p) => p.regionName === r.name))
                  .map((r) => (
                    <option key={r.name}>{r.name}</option>
                  ))}
              </select>
            </label>
            <label>
              エリア
              <select value={place.id} onChange={(event) => setPlaceId(event.target.value)}>
                {places
                  .filter((p) => p.regionName === place.regionName)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="journal-map-layout">
            <AreaMap key={place.id} place={place} />
            <div className="journal-map-note">
              <p className="journal-eyebrow">{place.regionName}</p>
              <h3>{place.name}</h3>
              <p className="journal-map-description">このエリアで撮られた公開写真</p>
              <div aria-live="polite">
                {!current ? (
                  <p className="text-sm text-ink-muted">写真を読み込んでいます…</p>
                ) : current.failed ? (
                  <p role="alert">
                    写真を読み込めませんでした。
                    <button
                      type="button"
                      onClick={() => setAttempt(attempt + 1)}
                      className="underline"
                    >
                      もう一度読み込む
                    </button>
                  </p>
                ) : current.page?.items.length ? (
                  <ul className="journal-map-photos">
                    {current.page.items.map((p) => (
                      <li key={p.id}>
                        <Link to={`/posts/${p.id}`}>
                          <img
                            src={p.thumb}
                            alt=""
                            width={p.width}
                            height={p.height}
                            loading="lazy"
                          />
                          <span>{p.title ?? `${p.author.name} さんの写真`}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">このエリアの公開写真はまだありません。</p>
                )}
              </div>
              <p className="journal-map-footnote">地図はエリア全体を示しています。</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** 自由入力や未登録の場合に別の場所を推測しない。 */
export function PostLocation({ place }: { place: JournalPlace | null }) {
  return (
    <section id="location" className="journal-map-section" aria-labelledby="location-title">
      <div className="journal-section-heading">
        <div>
          <p className="journal-eyebrow">LOCATION</p>
          <h2 id="location-title">この写真の撮影場所</h2>
        </div>
      </div>
      {place ? (
        <div className="journal-map-layout">
          <AreaMap key={place.sourceId} place={place} />
          <div className="journal-map-note">
            <p className="journal-eyebrow">{place.regionName}</p>
            <h3>{place.name}</h3>
            <p className="journal-map-footnote">地図はエリア全体を示しています。</p>
            <Link to="/#map" className="journal-text-link">
              地図からほかの写真を探す ↗
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">撮影場所は登録されていません。</p>
      )}
    </section>
  );
}
