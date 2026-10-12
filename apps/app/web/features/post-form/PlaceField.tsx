import { useState } from "react";

export type PlaceRegion = { name: string; places: { id: string; name: string }[] };
export type PlaceValue = { placeId: string | null; placeText: string };

const MAX_PLACE_TEXT = 50;

/**
 * 撮影場所 (任意)。地域 → 場所の候補から選ぶか、候補に無い場所を自由に書く (要件定義書 10 章)。
 * どちらか一方だけを持つ
 */
export function PlaceField({
  regions,
  value,
  onChange,
}: {
  regions: readonly PlaceRegion[];
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
}) {
  const regionOf = (placeId: string | null) =>
    regions.find((r) => r.places.some((p) => p.id === placeId))?.name ?? "";
  const [region, setRegion] = useState(() => regionOf(value.placeId));
  const [writing, setWriting] = useState(() => Boolean(value.placeText));
  const places = regions.find((r) => r.name === region)?.places ?? [];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">撮影場所 (任意)</legend>
      {writing ? (
        <label className="block space-y-1">
          <span className="text-xs text-ink-muted">場所の名前</span>
          <input
            name="placeText"
            value={value.placeText}
            maxLength={MAX_PLACE_TEXT}
            placeholder="例: ゴールドソーサー"
            onChange={(e) => onChange({ placeId: null, placeText: e.currentTarget.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
      ) : (
        <div className="flex flex-wrap gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-ink-muted">地域</span>
            <select
              name="region"
              value={region}
              onChange={(e) => {
                setRegion(e.currentTarget.value);
                onChange({ placeId: null, placeText: "" });
              }}
              className="rounded-md border border-line bg-surface px-3 py-2"
            >
              <option value="">選ばない</option>
              {regions.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-ink-muted">場所</span>
            <select
              name="place"
              value={value.placeId ?? ""}
              disabled={!region}
              onChange={(e) => onChange({ placeId: e.currentTarget.value || null, placeText: "" })}
              className="rounded-md border border-line bg-surface px-3 py-2 disabled:opacity-60"
            >
              <option value="">選ばない</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setWriting(!writing);
          setRegion("");
          onChange({ placeId: null, placeText: "" });
        }}
        className="text-sm underline"
      >
        {writing ? "候補から選ぶ" : "候補に無い場所を書く"}
      </button>
    </fieldset>
  );
}
