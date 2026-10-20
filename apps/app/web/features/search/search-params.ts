/** 検索の言葉とタグの長さの上限。API (GET /api/posts) が受け付ける長さと同じ */
export const MAX_QUERY_LENGTH = 200;
/** 絞り込むタグの数の上限。1 投稿に付けられる数 (domain/tags.ts の MAX_TAGS) と同じ */
export const MAX_SEARCH_TAGS = 10;

/**
 * 写真を探すページ (/posts) の条件 (S6f、ADR-0028)。lumorphia/prismtone の /posts と同じく、
 * 言葉 (q) と、繰り返せるタグ (tag、全部が付いているもの)。地点は API の名前 (placeId) で持ち、URL では place
 */
export type SearchFilter = { q?: string; tags: readonly string[]; placeId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: string | null) =>
  [...(value ?? "").trim()].slice(0, MAX_QUERY_LENGTH).join("");

/** URL から条件を読む。空のものは無いことにし、id でない地点は無視する (ページを壊さない) */
export function readSearch(params: URLSearchParams): SearchFilter {
  const q = text(params.get("q"));
  const tags = [...new Set(params.getAll("tag").map(text).filter(Boolean))].slice(
    0,
    MAX_SEARCH_TAGS,
  );
  const place = params.get("place") ?? "";
  return {
    ...(q ? { q } : {}),
    tags,
    ...(UUID.test(place) ? { placeId: place } : {}),
  };
}

/** 条件を URL の query にする (cursor は含めない) */
export function searchParams(filter: SearchFilter): URLSearchParams {
  return new URLSearchParams([
    ...(filter.q ? [["q", filter.q]] : []),
    ...filter.tags.map((t) => ["tag", t]),
    ...(filter.placeId ? [["place", filter.placeId]] : []),
  ]);
}

/** 条件を写真を探すページの URL にする */
export function searchHref(filter: SearchFilter): string {
  const query = searchParams(filter).toString();
  return `/posts${query ? `?${query}` : ""}`;
}

/** 何か条件があるか */
export function hasSearch(filter: SearchFilter): boolean {
  return Boolean(filter.q || filter.tags.length > 0 || filter.placeId);
}

/** ページの題 (lumorphia/prismtone と同じ書き方) */
export function searchTitle(filter: SearchFilter): string {
  return filter.q ? `「${filter.q}」の検索 - Scenote` : "写真を探す - Scenote";
}
