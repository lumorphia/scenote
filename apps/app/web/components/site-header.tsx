import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

type Me = {
  user: { handle: string; name: string; image: string | null } | null;
  loginAvailable: boolean;
};

/** ヘッダー。ログインの状態は本人の API (/api/me) から読む。読み終わるまではログインの欄を出さない */
export function SiteHeader() {
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((data) => {
        if (active) setMe(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [location.key]);

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
    <header className="flex items-center justify-between gap-4 border-b border-line-soft px-4 py-3">
      <Link to="/" className="shrink-0 font-semibold">
        Scenote
      </Link>
      {me?.user ? (
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <Link to="/me" className="shrink-0 whitespace-nowrap hover:underline">
            自分の投稿
          </Link>
          {/* 狭い画面では表示名を隠し、アイコンと handle だけにする */}
          <span data-testid="signed-in-user" className="flex min-w-0 items-center gap-2">
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
