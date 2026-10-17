import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { MyPostList, type MyPostCard } from "../features/my-posts/MyPostList.tsx";
import type { Route } from "./+types/me";

export function meta(_: Route.MetaArgs) {
  return [{ title: "自分の投稿 - Scenote" }, { name: "robots", content: "noindex" }];
}

type Page = { items: MyPostCard[]; nextCursor: string | null };

/** マイページ (S6d、要件定義書 15 章)。自分の投稿を、公開範囲も状態も問わず新しい順に */
export default function Me() {
  const location = useLocation();
  const [items, setItems] = useState<MyPostCard[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed" | "signed-out">("idle");

  const load = useCallback(async (cursor: string | null) => {
    setState("loading");
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/me/posts${query}`, { credentials: "same-origin" });
      if (res.status === 401) {
        setState("signed-out");
        return;
      }
      if (!res.ok) throw new Error(`my posts failed: ${res.status}`);
      const page = (await res.json()) as Page;
      setItems((before) => [...(cursor ? (before ?? []) : []), ...page.items]);
      setNextCursor(page.nextCursor);
      setState("idle");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  if (state === "signed-out")
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-8">
        <p>ログインすると、自分の投稿を見られます。</p>
        <a
          href={`/login?next=${encodeURIComponent(location.pathname)}`}
          className="inline-block rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
        >
          ログイン
        </a>
      </main>
    );
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">自分の投稿</h1>
      {items === null && state !== "failed" ? (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className="text-sm text-ink-muted">まだ投稿がありません。</p>
      ) : null}
      {items !== null && items.length > 0 ? <MyPostList items={items} /> : null}
      {state === "failed" ? (
        <p role="alert" className="text-sm">
          投稿を読み込めませんでした。
          <button
            type="button"
            onClick={() => void load(items === null ? null : nextCursor)}
            className="ml-2 underline"
          >
            もう一度読み込む
          </button>
        </p>
      ) : null}
      {nextCursor && state !== "failed" ? (
        <p className="text-center">
          <button
            type="button"
            onClick={() => void load(nextCursor)}
            disabled={state === "loading"}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover disabled:opacity-60"
          >
            {state === "loading" ? "読み込んでいます…" : "もっと見る"}
          </button>
        </p>
      ) : null}
    </main>
  );
}
