import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PostList, type PostCard } from "../features/post-list/PostList.tsx";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Scenote" }];
}

type Page = { items: PostCard[]; nextCursor: string | null };

async function fetchPage(cursor: string | null): Promise<Page> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/posts${query}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return (await res.json()) as Page;
}

/** トップ。公開の写真の一覧 (S6a、ADR-0016) */
export default function Home() {
  const [items, setItems] = useState<PostCard[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(cursor: string | null) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchPage(cursor);
      setItems((before) => [...(cursor ? (before ?? []) : []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(null);
  }, []);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scenote</h1>
          <p className="mt-1 text-sm text-ink-muted">
            FINAL FANTASY XIV で撮った風景や日常を、現像して残す場所です。
          </p>
        </div>
        <Link
          to="/edit"
          className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
        >
          現像する
        </Link>
      </section>

      {items === null && !failed ? (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className="text-sm text-ink-muted">まだ公開された写真がありません。</p>
      ) : null}
      {items !== null && items.length > 0 ? <PostList items={items} /> : null}
      {failed ? (
        <p role="alert" className="text-sm">
          写真を読み込めませんでした。
          <button
            type="button"
            onClick={() => void load(items === null ? null : nextCursor)}
            className="ml-2 underline"
          >
            もう一度読み込む
          </button>
        </p>
      ) : null}
      {nextCursor && !failed ? (
        <p className="text-center">
          <button
            type="button"
            onClick={() => void load(nextCursor)}
            disabled={loading}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover disabled:opacity-60"
          >
            {loading ? "読み込んでいます…" : "もっと見る"}
          </button>
        </p>
      ) : null}
    </main>
  );
}
