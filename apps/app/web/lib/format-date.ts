const day = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});

/** 投稿日などの日時を、日本の日付で (表示は日本語だけ。要件定義書 17 章) */
export function formatDate(iso: string): string {
  return day.format(new Date(iso));
}

/** 撮影日 (YYYY-MM-DD)。時差でずらさず、書かれた日のまま */
export function formatTakenOn(value: string): string {
  const [year, month, date] = value.split("-").map(Number);
  return `${year}年${month}月${date}日`;
}
