/** 検索の言葉の数と、1 つの長さの上限 (S6f、ADR-0028) */
export const MAX_SEARCH_WORDS = 5;
export const MAX_WORD_LENGTH = 50;

const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * 検索欄の入力を言葉に分ける。タグの名前 (tags.ts の normalizeTag) と同じく NFKC と小文字でそろえ、
 * 先頭の # は外す。空白 (全角も、NFKC で半角になる) で区切り、重なりは除く
 */
export function searchWords(input: string): string[] {
  const words = input
    .replace(CONTROL, "")
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => [...w.replace(/^#+/, "")].slice(0, MAX_WORD_LENGTH).join(""))
    .filter((w) => w.length > 0);
  return [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
}

/** LIKE で「どこかに含む」を探す形。% と _ と \ は文字として扱う (ESCAPE は既定の \) */
export function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
