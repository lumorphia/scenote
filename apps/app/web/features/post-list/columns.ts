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

/** 写真日誌は PC で 3 列、タブレットとスマートフォンで 2 列。 */
export function columnCountFor(width: number): number {
  return width >= 1024 ? 3 : 2;
}
