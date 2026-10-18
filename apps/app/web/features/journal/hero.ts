/** 写真帳の表紙には横写真を優先し、足りない分は縦写真で埋める。投稿順は変えない。 */
export function selectHeroPosts<T extends { width: number; height: number }>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((p) => p.width >= p.height),
    ...items.filter((p) => p.width < p.height),
  ].slice(0, 3);
}
