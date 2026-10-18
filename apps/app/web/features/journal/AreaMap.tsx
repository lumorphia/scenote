import { useState } from "react";
import { areaMap } from "./maps.ts";
import type { JournalPlace } from "./maps.ts";

/** エリア全体の地図。撮影座標は持たないので撮影スポットのピンを作らない。 */
export function AreaMap({ place }: { place: JournalPlace }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const src = areaMap(place.sourceId);
  if (!src || failed)
    return <p className="text-sm text-ink-muted">この撮影場所の地図はまだありません。</p>;
  return (
    <div className="journal-map-stage" data-testid="area-map">
      <div
        className="journal-map-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${place.name}の地図。拡大後はスクロールで移動できます。`}
      >
        <img
          src={src}
          alt={`${place.name}のエリアマップ`}
          width={1024}
          height={1024}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
        />
      </div>
      <div className="journal-map-controls">
        <button
          type="button"
          aria-label="地図を拡大する"
          disabled={zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="地図を縮小する"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
        >
          −
        </button>
        <button type="button" aria-label="地図の倍率を戻す" onClick={() => setZoom(1)}>
          ↺
        </button>
      </div>
      <span className="journal-map-copyright">© SQUARE ENIX</span>
    </div>
  );
}
