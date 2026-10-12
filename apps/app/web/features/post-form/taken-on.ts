/**
 * 撮影日の既定値。ブラウザが読んだファイルの更新日時を、見ている人の時刻で日付にする (要件定義書 9.2)。
 * EXIF とファイル名は使わない。時刻が無ければ空 (撮影日なし)
 */
export function takenOnFrom(lastModified: number | null): string {
  if (lastModified == null) return "";
  const d = new Date(lastModified);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
