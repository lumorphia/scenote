import {
  BLOCKED_TERM_MESSAGE,
  BLOCKED_TERMS,
  findBlockedInPost,
  findBlockedTerm,
} from "@lumorphia/moderation/text";
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
 * 利用者が書いたものを NG 語の一覧 (@lumorphia/moderation/text の組み込み) と照合し、当たった欄を返す (ADR-0015)。
 * 表記のゆれ (全角・大文字・空白) はパッケージがそろえる。どの語に当たったかは返さない。
 * 運営が足す辞書は S7 でここに合わせる
 */
export function findBlockedText(input: BlockedTextInput): BlockedTextField | null {
  const hit = findBlockedInPost(
    { title: input.title, description: input.body, tags: input.tags },
    BLOCKED_TERMS,
  );
  if (hit) return hit.field === "description" ? "body" : hit.field;
  if (input.placeText && findBlockedTerm(input.placeText, "contains", BLOCKED_TERMS))
    return "placeText";
  return null;
}

/** 当たったら、その欄を issues に入れた validation で断る */
export function assertNoBlockedText(input: BlockedTextInput): void {
  const field = findBlockedText(input);
  if (field)
    throw new DomainError("validation", BLOCKED_TERM_MESSAGE, [
      { path: field, message: BLOCKED_TERM_MESSAGE },
    ]);
}
