import { useCallback, useEffect, useState } from "react";
import { PostList, type PostCard } from "./PostList.tsx";

export type PostPage = { items: PostCard[]; nextCursor: string | null };

/** 一覧の API の問い合わせ。絞り込み (tag・author) とカーソルをつなぐ */
export function postsUrl(filter: Record<string, string>, cursor: string | null): string {
  const params = new URLSearchParams({ ...filter, ...(cursor ? { cursor } : {}) });
  const query = params.toString();
  return `/api/posts${query ? `?${query}` : ""}`;
}

/**
 * 公開の投稿の一覧と「もっと見る」(S6a・S6c、ADR-0016)。filter が変わったら最初から読み直す。
 * トップ・タグ・利用者のページが使う
 */
export function PostFeed({
  filter = {},
  emptyMessage,
  initialPage,
}: {
  filter?: Record<string, string>;
  emptyMessage: string;
  initialPage?: PostPage | undefined;
}) {
  const key = JSON.stringify(filter);
  const [items, setItems] = useState<PostCard[] | null>(initialPage?.items ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage?.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(postsUrl(JSON.parse(key) as Record<string, string>, cursor), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`list failed: ${res.status}`);
        const page = (await res.json()) as PostPage;
        setItems((before) => [...(cursor ? (before ?? []) : []), ...page.items]);
        setNextCursor(page.nextCursor);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (initialPage) {
      setItems(initialPage.items);
      setNextCursor(initialPage.nextCursor);
      return;
    }
    setItems(null);
    setNextCursor(null);
    void load(null);
  }, [load, initialPage]);

  return (
    <>
      {items === null && !failed ? (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
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
    </>
  );
}
