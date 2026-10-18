/** 検索の言葉とタグの長さの上限。API (GET /api/posts) が受け付ける長さと同じ */
export const MAX_QUERY_LENGTH = 200;

/** 検索のページの絞り込み (S6f、ADR-0028)。API の名前 (placeId) に合わせ、URL では place と書く */
export type SearchFilter = { q?: string; tag?: string; placeId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: string | null) =>
  [...(value ?? "").trim()].slice(0, MAX_QUERY_LENGTH).join("");

/** URL から絞り込みを読む。空のものは無いことにし、id でない地点は無視する (ページを壊さない) */
export function readSearch(params: URLSearchParams): SearchFilter {
  const q = text(params.get("q"));
  const tag = text(params.get("tag"));
  const place = params.get("place") ?? "";
  return {
    ...(q ? { q } : {}),
    ...(tag ? { tag } : {}),
    ...(UUID.test(place) ? { placeId: place } : {}),
  };
}

/** 絞り込みを検索のページの URL にする */
export function searchHref(filter: SearchFilter): string {
  const params = new URLSearchParams({
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
    ...(filter.placeId ? { place: filter.placeId } : {}),
  });
  const query = params.toString();
  return `/search${query ? `?${query}` : ""}`;
}

/** ページの題 */
export function searchTitle(filter: SearchFilter): string {
  if (filter.q) return `「${filter.q}」の写真 - Scenote`;
  if (filter.tag) return `#${filter.tag} の写真 - Scenote`;
  return "写真を探す - Scenote";
}
