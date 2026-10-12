/** 公開範囲の選択肢と説明 (ADR-0004、要件定義書 9.1)。何を選んでいるかがひと目で分かるようにする */
export const VISIBILITY_OPTIONS = [
  { value: "public", label: "公開", description: "一覧やタグ検索に出て、誰でも見られます" },
  {
    value: "unlisted",
    label: "限定公開",
    description: "一覧には出ません。URL を知っている人だけが見られます",
  },
  { value: "private", label: "非公開", description: "自分だけが見られます" },
] as const;

export type Visibility = (typeof VISIBILITY_OPTIONS)[number]["value"];

export function visibilityLabel(value: Visibility): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)!.label;
}
