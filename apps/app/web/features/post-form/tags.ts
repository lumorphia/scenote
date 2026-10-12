/** タグの入力 (サーバーの packages/core の tags.ts と同じ決まり。最後はサーバーがそろえる) */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

function clean(input: string): string {
  return [
    ...input
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .replace(/^[#＃]+/u, "")
      .trim(),
  ]
    .slice(0, MAX_TAG_LENGTH)
    .join("");
}

const key = (tag: string) => tag.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

/** 書いた形のまま足す。空、重なり、上限を超えるものは足さない */
export function addTag(tags: readonly string[], input: string): string[] {
  const tag = clean(input);
  if (!tag || tags.length >= MAX_TAGS || tags.some((t) => key(t) === key(tag))) return [...tags];
  return [...tags, tag];
}
