import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { ThemeToggle } from "../features/journal/ThemeToggle.tsx";

type Me = {
  user: { handle: string; name: string; image: string | null; needsConsent: boolean } | null;
  loginAvailable: boolean;
};

/** 同意する前でも開けるページ (同意の画面と、同意する中身) */
const CONSENT_FREE = ["/welcome", "/terms", "/privacy"];

/**
 * ヘッダー。ログインの状態は本人の API (/api/me) から読む。読み終わるまではログインの欄を出さない。
 * 今の版の規約に同意していない人は、同意の画面 (/welcome) へ送る (ADR-0023)
 */
export function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  // どのページで読んだ結果かも持つ。同意した直後に前のページの結果で /welcome へ送り返さないため
  const [loaded, setLoaded] = useState<{ me: Me | null; key: string } | null>(null);
  const me = loaded?.me ?? null;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const key = location.key;
    document.querySelector<HTMLDetailsElement>(".journal-mobile-nav")?.removeAttribute("open");
    void fetch("/api/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((data) => {
        if (active) setLoaded({ me: data, key });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [location.key]);

  useEffect(() => {
    if (loaded?.key !== location.key) return;
    if (!loaded.me?.user?.needsConsent || CONSENT_FREE.includes(location.pathname)) return;
    const next = `${location.pathname}${location.search}`;
    void navigate(`/welcome?next=${encodeURIComponent(next)}`, { replace: true });
  }, [loaded, location.key, location.pathname, location.search, navigate]);

  async function logout() {
    setBusy(true);
    try {
      const res = await fetch("/api/lumorphia/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = res.ok ? ((await res.json()) as { url: string | null }) : { url: null };
      // Lumorphia でもログアウトし、戻り先 (/api/lumorphia/signed-out) からトップへ戻る
      window.location.assign(data.url ?? "/");
    } finally {
      setBusy(false);
    }
  }

  const next = `${location.pathname}${location.search}`;
  return (
    <header className="journal-header">
      <Link to="/" className="journal-brand" aria-label="Scenote トップ">
        Scenote<span>A JOURNAL OF EORZEA</span>
      </Link>
      <nav className="journal-header-links" aria-label="メイン">
        <Link to="/#photos">写真を見る</Link>
        <Link to="/#map">地図から探す</Link>
        <Link to="/edit" className="journal-edit-link">
          写真を編集する ↗
        </Link>
      </nav>
      <ThemeToggle />
      <details className="journal-mobile-nav">
        <summary>メニュー</summary>
        <nav aria-label="メイン">
          <Link to="/#photos">写真を見る</Link>
          <Link to="/#map">地図から探す</Link>
          <Link to="/edit">写真を編集する</Link>
          {me?.user ? (
            <>
              <Link to="/me">自分の投稿</Link>
              <button type="button" onClick={() => void logout()} disabled={busy}>
                ログアウト
              </button>
            </>
          ) : null}
        </nav>
      </details>
      {me?.user ? (
        <div className="journal-account">
          <Link to="/me" className="journal-my-posts">
            自分の投稿
          </Link>
          {/* 狭い画面では表示名を隠し、アイコンと handle だけにする */}
          <span data-testid="signed-in-user" className="journal-signed-in-user">
            {me.user.image ? (
              <img
                src={me.user.image}
                alt=""
                width={24}
                height={24}
                className="shrink-0 rounded-full"
              />
            ) : null}
            <span className="hidden truncate sm:inline">{me.user.name}</span>
            <span className="truncate text-ink-muted">@{me.user.handle}</span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="shrink-0 whitespace-nowrap rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
          >
            ログアウト
          </button>
        </div>
      ) : me?.loginAvailable ? (
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
        >
          ログイン
        </a>
      ) : null}
    </header>
  );
}
