import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/post-new";
import {
  clearPendingPost,
  loadPendingPost,
  type PendingPost,
} from "../features/post-form/pending.ts";
import { submitErrorMessage, submitPost } from "../features/post-form/submit.ts";
import { takenOnFrom } from "../features/post-form/taken-on.ts";
import { loginHref } from "../lib/login.ts";

export function meta(_: Route.MetaArgs) {
  return [{ title: "投稿する - Scenote" }, { name: "robots", content: "noindex" }];
}

// 書き出した画像は端末の IndexedDB にあるので、ブラウザでだけ組み立てる
export async function clientLoader() {
  const [pending, me] = await Promise.all([
    loadPendingPost(),
    fetch("/api/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<{ user: unknown }>) : { user: null }))
      .catch(() => ({ user: null })),
  ]);
  return { pending, signedIn: me.user !== null };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <p className="p-4 text-sm text-ink-muted">投稿の画面を読み込んでいます…</p>;
}

const MAX_TITLE = 100;
const MAX_BODY = 2000;

export default function PostNew({ loaderData }: Route.ComponentProps) {
  const { pending, signedIn } = loaderData;
  if (!pending) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">投稿する</h1>
        <p className="text-sm text-ink-muted">
          投稿する写真がありません。先に写真を現像してください。
        </p>
        <Link
          to="/edit"
          className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
        >
          現像する
        </Link>
      </main>
    );
  }
  return <PostForm pending={pending} signedIn={signedIn} />;
}

function PostForm({ pending, signedIn }: { pending: PendingPost; signedIn: boolean }) {
  const navigate = useNavigate();
  const preview = useMemo(() => URL.createObjectURL(pending.blob), [pending.blob]);
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [takenOn, setTakenOn] = useState(() => takenOnFrom(pending.lastModified));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const postId = await submitPost({
        image: pending.blob,
        title,
        body,
        takenOn,
        recipe: pending.recipe,
      });
      await clearPendingPost();
      navigate(`/posts/${postId}`);
    } catch (e) {
      setError(submitErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">投稿する</h1>
      <img
        src={preview}
        alt="投稿する写真"
        data-testid="post-preview"
        className="max-h-[60vh] w-full rounded-md bg-surface-muted object-contain"
      />
      <p className="text-sm">
        <Link to={`/edit?draft=${encodeURIComponent(pending.draftId)}`} className="underline">
          現像をやり直す
        </Link>
      </p>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-semibold">タイトル (任意)</span>
          <input
            name="title"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(e) => setTitle(e.currentTarget.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">ひとこと (任意)</span>
          <textarea
            name="body"
            value={body}
            maxLength={MAX_BODY}
            rows={4}
            onChange={(e) => setBody(e.currentTarget.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">撮影日 (任意)</span>
          <span className="block text-xs text-ink-muted">
            ファイルの更新日を入れています。違っていたら直すか、消してください。
          </span>
          <input
            type="date"
            name="takenOn"
            value={takenOn}
            onChange={(e) => setTakenOn(e.currentTarget.value)}
            className="rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
        <div className="space-y-1 rounded-md border border-line-soft bg-surface-muted p-3 text-sm">
          <p>
            他の人が写っている場合は、本人の了承を得てください。名前などは現像のぼかしで隠せます。
          </p>
          <p className="text-ink-muted">
            元の画像は保存しません。現像した写真と、現像の設定だけを預かります。
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        {signedIn ? (
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "投稿しています…" : "投稿する"}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              投稿するにはログインしてください。現像した写真はこの端末に残しておきます。
            </p>
            <a
              href={loginHref("/post/new")}
              className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
            >
              ログインして投稿する
            </a>
          </div>
        )}
      </form>
    </main>
  );
}
