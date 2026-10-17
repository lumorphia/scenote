/** NG 語に当たった欄 (サーバーの check-text と error.issues の path。ADR-0015) */
export type BlockedField = "title" | "body" | "tags" | "placeText";

const FIELDS: readonly BlockedField[] = ["title", "body", "tags", "placeText"];

const LABELS: Record<BlockedField, string> = {
  title: "タイトル",
  body: "ひとこと",
  tags: "タグ",
  placeText: "撮影場所",
};

/** API のエラー応答から、NG 語に当たった欄を読む。欄の名前でなければ null */
export function blockedFieldOf(answer: unknown): BlockedField | null {
  const issues = (answer as { error?: { issues?: { path?: unknown }[] } } | null)?.error?.issues;
  const path = issues?.[0]?.path;
  return FIELDS.find((field) => field === path) ?? null;
}

/** どの語かは言わず、欄だけを案内する */
export function blockedFieldMessage(field: BlockedField): string {
  return `${LABELS[field]}に使えない語が含まれています。書き直してください。`;
}
