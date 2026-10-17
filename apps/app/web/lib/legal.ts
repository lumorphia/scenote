import { parseLegalDocument, renderLegalMarkdown } from "@lumorphia/legal";
import privacySource from "../../../../docs/legal/privacy.md?raw";
import termsSource from "../../../../docs/legal/terms.md?raw";

/**
 * 利用規約とプライバシーポリシーの本文 (ADR-0023)。本文は docs/legal/*.md にあり、ビルドのときに文字列として取り込む。
 * ページの loader が HTML にする (生の HTML は通さない。@lumorphia/legal の renderLegalMarkdown)。
 * サーバーの版の読み取り (server/legal.ts) と同じファイル
 */
export const LEGAL_PAGES = {
  terms: parseLegalDocument(termsSource),
  privacy: parseLegalDocument(privacySource),
} as const;

export type LegalPageKey = keyof typeof LEGAL_PAGES;

export function legalPage(key: LegalPageKey) {
  const page = LEGAL_PAGES[key];
  return {
    version: page.version,
    updatedAt: page.updatedAt,
    html: renderLegalMarkdown(page.markdown),
  };
}

export { formatUpdatedAt } from "@lumorphia/legal";
