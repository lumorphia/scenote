/** 通報の理由 (ADR-0021)。サーバーの REPORT_REASONS と同じ */
export const REPORT_REASONS = [
  { value: "rights", label: "権利侵害", hint: "著作権・肖像権などを侵害している" },
  {
    value: "depicted",
    label: "写り込んだ本人からの削除依頼",
    hint: "自分のキャラクターや名前が写っている",
  },
  { value: "terms", label: "規約違反", hint: "FFXIV 以外の画像、不適切な画像など" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export function reportReasonLabel(value: ReportReason): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}
