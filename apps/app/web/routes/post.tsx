import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { visibilityLabel, type Visibility } from "../features/post-form/visibility.ts";
import { blockedFieldMessage, blockedFieldOf } from "../features/post-form/blocked.ts";
import { VisibilityField } from "../features/post-form/VisibilityField.tsx";
import { TagsField } from "../features/post-form/TagsField.tsx";
import {
  PlaceField,
  type PlaceRegion,
  type PlaceValue,
} from "../features/post-form/PlaceField.tsx";
import { formatDate, formatTakenOn } from "../lib/format-date.ts";
import { CopyUrlButton } from "../features/post-detail/CopyUrlButton.tsx";
import type { Route } from "./+types/post";

export function meta(_: Route.MetaArgs) {
  return [{ title: "投稿 - Scenote" }, { name: "robots", content: "noindex" }];
}

type OwnPost = {
  id: string;
  status: "processing" | "published" | "failed" | "held";
  visibility: Visibility;
  isOwner: boolean;
  failureReason: string | null;
  author: { handle: string; name: string; image: string | null };
  title: string | null;
  body: string | null;
  takenOn: string | null;
  tags: { name: string; displayName: string }[];
  place: { id: string | null; regionName: string | null; name: string } | null;
  image: { display: string; width: number; height: number } | null;
  publishedAt: string | null;
};

/**
 * 投稿詳細 (要件定義書 13 章)。画像をできるだけ大きく出し、下にタイトル・投稿者・本文・撮影日・撮影場所・投稿日・タグ。
 * 本人は、派生画像を作っている間は待ち、公開範囲・タグ・撮影場所を変えられる (ADR-0004、ADR-0011)。
 * 保留した投稿は本人にだけ案内を出す (ADR-0014)
 */
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
  const shareable =
    post.status === "published" && (post.visibility === "public" || post.visibility === "unlisted");
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
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
      {post.status === "held" ? (
        <p data-testid="post-held" role="status" className="text-sm">
          運営が、FF14
          の画面か、安全上の問題がないかを確認しています。確認が終わるまで、ほかの人には表示されません。
        </p>
      ) : null}
      {post.image ? (
        <figure className="flex justify-center">
          <img
            src={post.image.display}
            width={post.image.width}
            height={post.image.height}
            alt={post.title ?? `${post.author.name} さんの写真`}
            data-testid="post-image"
            className="h-auto max-h-[85vh] w-auto max-w-full rounded-md object-contain"
          />
        </figure>
      ) : null}

      <article className="mx-auto max-w-3xl space-y-4">
        {post.title ? <h1 className="text-2xl font-semibold">{post.title}</h1> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p data-testid="post-author" className="flex min-w-0 items-center gap-2 text-sm">
            {post.author.image ? (
              <img src={post.author.image} alt="" width={28} height={28} className="rounded-full" />
            ) : null}
            <span className="truncate">{post.author.name}</span>
            <span className="text-ink-muted">@{post.author.handle}</span>
          </p>
          {shareable ? <CopyUrlButton /> : null}
        </div>
        {post.body ? <p className="whitespace-pre-wrap leading-relaxed">{post.body}</p> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {post.takenOn ? (
            <>
              <dt className="text-ink-muted">撮影日</dt>
              <dd data-testid="post-taken-on">{formatTakenOn(post.takenOn)}</dd>
            </>
          ) : null}
          {post.place ? (
            <>
              <dt className="text-ink-muted">撮影場所</dt>
              <dd data-testid="post-place">
                {post.place.regionName ? `${post.place.regionName} / ` : ""}
                {post.place.name}
              </dd>
            </>
          ) : null}
          {post.publishedAt ? (
            <>
              <dt className="text-ink-muted">投稿日</dt>
              <dd>
                <time data-testid="post-published-on" dateTime={post.publishedAt}>
                  {formatDate(post.publishedAt)}
                </time>
              </dd>
            </>
          ) : null}
        </dl>
        {post.tags.length ? (
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="タグ" data-testid="post-tags">
            {post.tags.map((tag) => (
              <li key={tag.name} className="rounded-full bg-surface-muted px-3 py-1">
                #{tag.displayName}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      {post.isOwner ? (
        <section className="mx-auto max-w-3xl space-y-4 border-t border-line-soft pt-6">
          <h2 className="text-lg font-semibold">投稿の設定</h2>
          <PlaceEditor
            postId={post.id}
            value={post.place}
            onSaved={(place) => setPost({ ...post, place })}
          />
          <TagsEditor
            postId={post.id}
            value={post.tags.map((t) => t.displayName)}
            onSaved={(tags) => setPost({ ...post, tags })}
          />
          <VisibilityEditor
            postId={post.id}
            value={post.visibility}
            onChanged={(visibility) => setPost({ ...post, visibility })}
          />
        </section>
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

/** 保存できなかったときの文言。NG 語に当たったら、その欄を案内する (ADR-0015) */
async function saveFailedMessage(res: Response | null, what: string): Promise<string> {
  const blocked = res?.status === 400 ? blockedFieldOf(await res.json().catch(() => null)) : null;
  return blocked
    ? blockedFieldMessage(blocked)
    : `${what}を保存できませんでした。もう一度お試しください。`;
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
    } else setMessage(await saveFailedMessage(res, "タグ"));
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

/** 本人だけ。撮影場所を付け直す */
function PlaceEditor({
  postId,
  value,
  onSaved,
}: {
  postId: string;
  value: OwnPost["place"];
  onSaved: (place: OwnPost["place"]) => void;
}) {
  const [regions, setRegions] = useState<PlaceRegion[] | null>(null);
  const [draft, setDraft] = useState<PlaceValue>({
    placeId: value?.id ?? null,
    placeText: value && !value.id ? value.name : "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/places")
      .then((res) =>
        res.ok ? (res.json() as Promise<{ regions: PlaceRegion[] }>) : { regions: [] },
      )
      .then((data) => {
        if (active) setRegions(data.regions);
      })
      .catch(() => {
        if (active) setRegions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        place: { placeId: draft.placeId, placeText: draft.placeText.trim() || null },
      }),
    }).catch(() => null);
    const reread = res?.ok
      ? await fetch(`/api/posts/${encodeURIComponent(postId)}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? (r.json() as Promise<{ place: OwnPost["place"] }>) : null))
          .catch(() => null)
      : null;
    setBusy(false);
    if (reread) {
      onSaved(reread.place);
      setMessage("撮影場所を保存しました。");
    } else setMessage(await saveFailedMessage(res, "撮影場所"));
  }

  if (!regions) return null;
  return (
    <section className="space-y-3 rounded-md border border-line-soft p-4">
      <PlaceField regions={regions} value={draft} onChange={setDraft} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
      >
        撮影場所を保存する
      </button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
