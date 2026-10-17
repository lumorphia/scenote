import {
  BLOCKED_TERM_MESSAGE,
  BLOCKED_TERMS,
  findBlockedInPost,
  findBlockedTerm,
  type BlockedTerm,
} from "@lumorphia/moderation/text";
import type { Database } from "@lumorphia-scenote/db";
import { activeBlockedTerms } from "./blocked-terms.ts";
import { DomainError } from "./errors.ts";

/** NG 語を照合する欄。API の issues の path にもこの名前で返す */
export type BlockedTextField = "title" | "body" | "tags" | "placeText";

export type BlockedTextInput = {
  title?: string | null | undefined;
  body?: string | null | undefined;
  tags?: readonly string[] | undefined;
  placeText?: string | null | undefined;
};

/**
 * 利用者が書いたものを NG 語と照合し、当たった欄を返す (ADR-0015)。terms の既定は組み込みの一覧。
 * 表記のゆれ (全角・大文字・空白) はパッケージがそろえる。どの語に当たったかは返さない
 */
export function findBlockedText(
  input: BlockedTextInput,
  terms: readonly BlockedTerm[] = BLOCKED_TERMS,
): BlockedTextField | null {
  const hit = findBlockedInPost(
    { title: input.title, description: input.body, tags: input.tags },
    terms,
  );
  if (hit) return hit.field === "description" ? "body" : hit.field;
  if (input.placeText && findBlockedTerm(input.placeText, "contains", terms)) return "placeText";
  return null;
}

/** 組み込みの一覧と、運営が足した辞書 (ADR-0022) で照合する */
export async function checkText(
  db: Database,
  input: BlockedTextInput,
): Promise<BlockedTextField | null> {
  return findBlockedText(input, await activeBlockedTerms(db));
}

/** 当たったら、その欄を issues に入れた validation で断る */
export async function assertNoBlockedText(db: Database, input: BlockedTextInput): Promise<void> {
  const field = await checkText(db, input);
  if (field)
    throw new DomainError("validation", BLOCKED_TERM_MESSAGE, [
      { path: field, message: BLOCKED_TERM_MESSAGE },
    ]);
}
