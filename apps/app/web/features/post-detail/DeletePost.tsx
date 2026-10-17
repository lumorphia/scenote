import { useState } from "react";
import { useNavigate } from "react-router";

/** 本人だけ。投稿を消す (S6d)。消すと戻せないので、一度確かめてから消す */
export function DeletePost({ postId }: { postId: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) void navigate("/me");
    else setMessage("消せませんでした。もう一度お試しください。");
  }

  return (
    <section className="space-y-3 rounded-md border border-line-soft p-4">
      {confirming ? (
        <>
          <p className="text-sm">
            この投稿を消しますか。消すと元に戻せません。写真・タグ・撮影場所もいっしょに消えます。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
            >
              消す
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
            >
              やめる
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
        >
          この投稿を消す
        </button>
      )}
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
