import { formatUpdatedAt } from "../lib/legal.ts";

/** 規約のページの見た目 (/terms・/privacy で共通) */
export function LegalPageView({
  version,
  updatedAt,
  html,
}: {
  version: string;
  updatedAt: string;
  html: string;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <p className="text-sm text-ink-muted">
        版 {version} / 改定日 {formatUpdatedAt(updatedAt)}
      </p>
      <div
        className="legal space-y-3 leading-relaxed [&_a]:underline [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line-soft [&_td]:p-2 [&_th]:border [&_th]:border-line-soft [&_th]:p-2 [&_ul]:list-disc"
        // 本文は docs/legal の Markdown で、生の HTML は通さない (@lumorphia/legal)
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
