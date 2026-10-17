import { useState } from "react";
import { useLocation } from "react-router";
import { REPORT_REASONS, type ReportReason } from "./reasons.ts";

const MAX_DETAIL = 1000;

/**
 * 投稿を通報する (S7b-1、ADR-0021)。ログインが要る。開いたときにログインの状態を確かめ、
 * ログインしていなければログインへ案内する
 */
export function ReportPost({ postId }: { postId: string }) {
  const location = useLocation();
  const [state, setState] = useState<"closed" | "checking" | "form" | "signed-out" | "sent">(
    "closed",
  );
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function open() {
    setState("checking");
    const me = await fetch("/api/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<{ user: unknown }>) : { user: null }))
      .catch(() => ({ user: null }));
    setState(me.user ? "form" : "signed-out");
  }

  async function send() {
    if (!reason) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reason, detail: detail.trim() || null }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setState("sent");
    else if (res?.status === 409)
      setMessage("この投稿はもう通報しています。運営の確認をお待ちください。");
    else if (res?.status === 401) setState("signed-out");
    else setMessage("通報を送れませんでした。もう一度お試しください。");
  }

  if (state === "closed" || state === "checking")
    return (
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === "checking"}
        className="text-sm text-ink-muted underline hover:text-ink"
      >
        通報する
      </button>
    );
  if (state === "signed-out")
    return (
      <p className="text-sm">
        通報には Lumorphia アカウントでのログインが要ります。
        <a href={`/login?next=${encodeURIComponent(location.pathname)}`} className="ml-2 underline">
          ログインして通報する
        </a>
      </p>
    );
  if (state === "sent")
    return (
      <p role="status" className="text-sm">
        通報を受け付けました。運営が確認します。
      </p>
    );
  return (
    <section className="space-y-3 rounded-md border border-line-soft p-4 text-sm">
      <fieldset className="space-y-2">
        <legend className="font-semibold">通報の理由</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r.value} className="flex items-start gap-2">
            <input
              type="radio"
              name="report-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="mt-1"
            />
            <span>
              {r.label}
              <span className="block text-xs text-ink-muted">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="font-semibold">詳しく (任意)</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={MAX_DETAIL}
          rows={3}
          className="w-full rounded-md border border-line bg-surface px-2 py-1"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !reason}
          className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
        >
          通報を送る
        </button>
        <button
          type="button"
          onClick={() => setState("closed")}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
        >
          やめる
        </button>
      </div>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
