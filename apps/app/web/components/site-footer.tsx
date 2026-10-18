import { Link } from "react-router";

/** フッター。規約とプライバシーポリシーへのリンク (ADR-0023) */
export function SiteFooter() {
  return (
    <footer className="journal-footer">
      <Link to="/" className="journal-brand">
        Scenote
      </Link>
      <p className="journal-footer-description">FINAL FANTASY XIVの風景と日常を残す写真日誌。</p>
      <nav aria-label="Scenote について" className="flex flex-wrap gap-4">
        <Link to="/terms" className="hover:underline">
          利用規約
        </Link>
        <Link to="/privacy" className="hover:underline">
          プライバシーポリシー
        </Link>
      </nav>
      <p className="mt-3 text-xs">
        FINAL FANTASY XIV © SQUARE ENIX. Scenote
        はスクウェア・エニックスの承認・後援を受けたものではありません。
      </p>
    </footer>
  );
}
