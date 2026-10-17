import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formatConsentVersion,
  needsReconsent,
  parseConsentVersion,
  parseLegalDocument,
  type LegalVersions,
} from "@lumorphia/legal";

/**
 * 規約とプライバシーポリシーの今の版 (ADR-0023)。画面と同じ docs/legal/*.md の frontmatter を読む
 * (lumorphia/prismtone と同じ)。サーバーは Vite の ?raw が使えないので fs で読む。改定はデプロイを伴うので、起動して 1 回で足りる
 */
const LEGAL_DIR = fileURLToPath(new URL("../../../docs/legal/", import.meta.url));

const versionOf = (file: string) =>
  parseLegalDocument(readFileSync(`${LEGAL_DIR}${file}`, "utf8")).version;

let cached: LegalVersions | null = null;

export function readLegalVersions(): LegalVersions {
  cached ??= { terms: versionOf("terms.md"), privacy: versionOf("privacy.md") };
  return cached;
}

/** 今の版に同意していないか (同意が無い、読めない、メジャーが違う) */
export function needsConsent(accepted: string | null): boolean {
  return needsReconsent(parseConsentVersion(accepted), readLegalVersions());
}

/** 今の版を、同意の記録の形にする */
export function currentConsentVersion(): string {
  return formatConsentVersion(readLegalVersions());
}
