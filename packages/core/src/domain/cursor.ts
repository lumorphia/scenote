import { DomainError } from "./errors.ts";

/** 一覧の続きを指す。並べた日時と ID の組 (lumorphia/prismtone の browse と同じ形) */
export type Cursor = { at: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** 自分が出したカーソルでなければ validation で断る */
export function decodeCursor(cursor: string): { at: Date; id: string } {
  let parsed: Partial<Cursor> | null = null;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<Cursor>;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed.at !== "string" || typeof parsed.id !== "string")
    throw new DomainError("validation", "invalid cursor");
  const at = new Date(parsed.at);
  if (Number.isNaN(at.getTime())) throw new DomainError("validation", "invalid cursor");
  return { at, id: parsed.id };
}
