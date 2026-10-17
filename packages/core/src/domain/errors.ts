export type ErrorCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "upstream_unavailable"
  | "internal";

/** ドメイン層が投げる例外。HTTP への変換は API 層のエラーハンドラが行う (lumorphia/prismtone の docs/design/05 §4 と同じ)。 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  /** どの欄が断られたか (API の error.issues にそのまま出す)。画面が欄ごとに案内するため */
  readonly issues: readonly { path: string; message: string }[] | undefined;
  constructor(
    code: ErrorCode,
    message: string,
    issues?: readonly { path: string; message: string }[],
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.issues = issues;
  }
}
