import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { visibilityLabel, type Visibility } from "../features/post-form/visibility.ts";
import { VisibilityField } from "../features/post-form/VisibilityField.tsx";
import { TagsField } from "../features/post-form/TagsField.tsx";
import type { Route } from "./+types/post";

export function meta(_: Route.MetaArgs) {
  return [{ title: "投稿 - Scenote" }, { name: "robots", content: "noindex" }];
}

type OwnPost = {
  id: string;
  status: "processing" | "published" | "failed";
  visibility: Visibility;
  isOwner: boolean;
  failureReason: string | null;
  title: string | null;
  body: string | null;
  takenOn: string | null;
  tags: { name: string; displayName: string }[];
  image: { display: string; width: number; height: number } | null;
};

/** 投稿。本人は、派生画像を作っている間は待ち、公開範囲を変えられる (ADR-0004、ADR-0011)。詳細の見た目は S6 で作る */
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
      {post.tags.length ? (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label="タグ" data-testid="post-tags">
          {post.tags.map((tag) => (
            <li key={tag.name} className="rounded-full bg-surface-muted px-3 py-1">
              #{tag.displayName}
            </li>
          ))}
        </ul>
      ) : null}
      {post.isOwner ? (
        <TagsEditor
          postId={post.id}
          value={post.tags.map((t) => t.displayName)}
          onSaved={(tags) => setPost({ ...post, tags })}
        />
      ) : null}
      {post.isOwner ? (
        <VisibilityEditor
          postId={post.id}
          value={post.visibility}
          onChanged={(visibility) => setPost({ ...post, visibility })}
        />
      ) : null}
    </main>
  );
}

/** 本人だけ。公開範囲を変えると、画像は新しい URL に移る */
function VisibilityEditor({
  postId,
  value,
  onChanged,
}: {
  postId: string;
  value: Visibility;
  onChanged: (next: Visibility) => void;
}) {
  const [draft, setDraft] = useState<Visibility>(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ visibility: draft }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onChanged(draft);
      setMessage(`公開範囲を「${visibilityLabel(draft)}」にしました。`);
    } else setMessage("公開範囲を変えられませんでした。もう一度お試しください。");
  }

  return (
    <section className="space-y-3 rounded-md border border-line-soft p-4">
      <p className="text-sm">
        いまの公開範囲:{" "}
        <span data-testid="post-visibility" className="font-semibold">
          {visibilityLabel(value)}
        </span>
      </p>
      <VisibilityField value={draft} onChange={setDraft} name="change-visibility" />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || draft === value}
        className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
      >
        公開範囲を変える
      </button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** 本人だけ。タグを付け直す */
function TagsEditor({
  postId,
  value,
  onSaved,
}: {
  postId: string;
  value: string[];
  onSaved: (tags: { name: string; displayName: string }[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = draft.join("\u0000") !== value.join("\u0000");

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ tags: draft }),
    }).catch(() => null);
    const reread = res?.ok
      ? await fetch(`/api/posts/${encodeURIComponent(postId)}`, { credentials: "same-origin" })
          .then((r) =>
            r.ok ? (r.json() as Promise<{ tags: { name: string; displayName: string }[] }>) : null,
          )
          .catch(() => null)
      : null;
    setBusy(false);
    if (reread) {
      onSaved(reread.tags);
      setMessage("タグを保存しました。");
    } else setMessage("タグを保存できませんでした。もう一度お試しください。");
  }

  return (
    <section className="space-y-3 rounded-md border border-line-soft p-4">
      <TagsField value={draft} onChange={setDraft} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !changed}
        className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
      >
        タグを保存する
      </button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
