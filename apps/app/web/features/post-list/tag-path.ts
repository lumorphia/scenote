/**
 * タグのページの URL。書き方のゆれ (全角・大文字など) はサーバーがそろえるので、ここでは先頭の # と空白だけ落とす。
 * 空なら null
 */
export function tagPath(input: string): string | null {
  const tag = input
    .trim()
    .replace(/^[#＃]+/u, "")
    .trim();
  return tag ? `/tags/${encodeURIComponent(tag)}` : null;
}
