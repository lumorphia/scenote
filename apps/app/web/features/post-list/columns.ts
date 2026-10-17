/** 縦横比を保って並べる写真 (一覧のカード) */
export type Sized = { width: number; height: number };

/**
 * 写真を、いちばん低い列に順に積む (S6a、ADR-0016)。高さは横幅をそろえたときの比 (height / width) で比べる。
 * 前から順に決めるので、続きを足しても前の写真の置き場所は変わらない
 */
export function layoutColumns<T extends Sized>(items: readonly T[], count: number): T[][] {
  const { columns } = items.reduce(
    (acc, item) => {
      const lowest = acc.heights.indexOf(Math.min(...acc.heights));
      return {
        columns: acc.columns.map((column, i) => (i === lowest ? [...column, item] : column)),
        heights: acc.heights.map((h, i) => (i === lowest ? h + item.height / item.width : h)),
      };
    },
    {
      columns: Array.from({ length: count }, () => [] as T[]),
      heights: Array.from({ length: count }, () => 0),
    },
  );
  return columns;
}

/** 画面の幅から列の数を決める (Tailwind の sm・lg・2xl の区切りに近い) */
export function columnCountFor(width: number): number {
  if (width >= 1536) return 5;
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}
