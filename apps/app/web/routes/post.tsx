import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Route } from "./+types/post";

export function meta(_: Route.MetaArgs) {
  return [{ title: "投稿 - Scenote" }, { name: "robots", content: "noindex" }];
}

type OwnPost = {
  id: string;
  status: "processing" | "published" | "failed";
  failureReason: string | null;
  title: string | null;
  body: string | null;
  takenOn: string | null;
  image: { display: string; width: number; height: number } | null;
};

/** 自分の投稿。派生画像を作っている間は待つ (ADR-0011)。ほかの人に見せる詳細は S6 で作る */
export default function Post() {
  const { id } = useParams();
  const [post, setPost] = useState<OwnPost | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const res = await fetch(`/api/posts/${encodeURIComponent(id ?? "")}`, {
        credentials: "same-origin",
      });
      if (!active) return;
      if (!res.ok) {
        setMissing(true);
        return;
      }
      const data = (await res.json()) as OwnPost;
      setPost(data);
      if (data.status === "processing") timer = setTimeout(() => void load(), 1000);
    };
    void load().catch(() => setMissing(true));
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  if (missing)
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p>投稿が見つかりません。</p>
      </main>
    );
  if (!post) return <p className="p-4 text-sm text-ink-muted">読み込んでいます…</p>;
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
      {post.status === "processing" ? (
        <p data-testid="post-processing" className="text-sm text-ink-muted">
          写真を仕上げています。少し待ってください…
        </p>
      ) : null}
      {post.status === "failed" ? (
        <p role="alert" className="text-sm">
          この写真は受け付けられませんでした。別の形式で書き出して、もう一度投稿してください。
          <Link to="/edit" className="ml-2 underline">
            現像する
          </Link>
        </p>
      ) : null}
      {post.image ? (
        <img
          src={post.image.display}
          width={post.image.width}
          height={post.image.height}
          alt={post.title ?? "投稿した写真"}
          data-testid="post-image"
          className="h-auto w-full rounded-md"
        />
      ) : null}
      {post.title ? <h1 className="text-xl font-semibold">{post.title}</h1> : null}
      {post.takenOn ? <p className="text-sm text-ink-muted">撮影日 {post.takenOn}</p> : null}
      {post.body ? <p className="whitespace-pre-wrap">{post.body}</p> : null}
    </main>
  );
}
