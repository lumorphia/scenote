import { useCallback, useEffect, useState } from "react";
import { PostList, type PostCard } from "./PostList.tsx";

export type PostPage = { items: PostCard[]; nextCursor: string | null };

/** 一覧の絞り込み。値を並べたもの (tag) は繰り返して送る */
export type PostFilter = Record<string, string | readonly string[]>;

/** 一覧の API の問い合わせ。絞り込み (tag・author・q など) とカーソルをつなぐ */
export function postsUrl(filter: PostFilter, cursor: string | null): string {
  const params = new URLSearchParams([
    ...Object.entries(filter).flatMap(([key, value]) =>
      (typeof value === "string" ? [value] : value).map((v) => [key, v]),
    ),
    ...(cursor ? [["cursor", cursor]] : []),
  ]);
  const query = params.toString();
  return `/api/posts${query ? `?${query}` : ""}`;
}

/**
 * 公開の投稿をページごとに読む。filter が変わったら最初から読み直す。initialPage (SSR で読んだもの) があれば、
 * 最初のページは読まない。PostFeed と、写真を探すページ (/posts) が使う
 */
export function usePostPages(filter: PostFilter, initialPage?: PostPage) {
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
        const res = await fetch(postsUrl(JSON.parse(key) as PostFilter, cursor), {
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

  return {
    items,
    nextCursor,
    loading,
    failed,
    loadMore: () => void load(nextCursor),
    retry: () => void load(items === null ? null : nextCursor),
  };
}

/** 読み込みの失敗と「もっと見る」 */
export function MorePosts({ pages }: { pages: ReturnType<typeof usePostPages> }) {
  return (
    <>
      {pages.failed ? (
        <p role="alert" className="text-sm">
          写真を読み込めませんでした。
          <button type="button" onClick={pages.retry} className="ml-2 underline">
            もう一度読み込む
          </button>
        </p>
      ) : null}
      {pages.nextCursor && !pages.failed ? (
        <p className="text-center">
          <button
            type="button"
            onClick={pages.loadMore}
            disabled={pages.loading}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover disabled:opacity-60"
          >
            {pages.loading ? "読み込んでいます…" : "もっと見る"}
          </button>
        </p>
      ) : null}
    </>
  );
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
  filter?: PostFilter;
  emptyMessage: string;
  initialPage?: PostPage | undefined;
}) {
  const pages = usePostPages(filter, initialPage);
  const { items, failed } = pages;
  return (
    <>
      {items === null && !failed ? (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      ) : null}
      {items !== null && items.length > 0 ? <PostList items={items} /> : null}
      <MorePosts pages={pages} />
    </>
  );
}
