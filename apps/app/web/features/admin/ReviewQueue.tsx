import { useEffect, useState } from "react";
import { formatDate } from "../../lib/format-date.ts";
import { visibilityLabel, type Visibility } from "../post-form/visibility.ts";

export type ReviewItem = {
  id: string;
  status: string;
  visibility: Visibility;
  moderationState: "clear" | "flagged" | "held" | null;
  moderationScore: number | null;
  moderationLabels: Record<string, number> | null;
  title: string | null;
  body: string | null;
  author: { handle: string; name: string };
  createdAt: string;
  display: string;
};

const STATE_LABEL = { held: "保留 (公開していない)", flagged: "要確認 (公開中)" } as const;

/** 確認待ちの投稿 (S7a-2、ADR-0020)。公開するか非表示にするかを、理由を書いて決める */
export function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/reviews", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`reviews failed: ${res.status}`);
        return ((await res.json()) as { items: ReviewItem[] }).items;
      })
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed)
    return (
      <p role="alert" className="text-sm">
        確認待ちを読み込めませんでした。
      </p>
    );
  if (!items) return <p className="text-sm text-ink-muted">読み込んでいます…</p>;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">確認待ち ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">確認を待っている投稿はありません。</p>
      ) : null}
      {items.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          onDone={() => setItems((before) => (before ?? []).filter((i) => i.id !== item.id))}
        />
      ))}
    </section>
  );
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const state = item.status === "held" ? "held" : "flagged";

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/posts/${encodeURIComponent(item.id)}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ decision, reason }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) onDone();
    else if (res?.status === 409) {
      setMessage("ほかの操作で、もう確認待ちではなくなりました。");
      onDone();
    } else setMessage("決められませんでした。もう一度お試しください。");
  }

  const reasonId = `reason-${item.id}`;
  return (
    <article className="grid gap-4 rounded-md border border-line-soft p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <img
        src={item.display}
        alt={item.title ?? "確認待ちの写真"}
        className="h-auto max-h-96 w-full rounded-md bg-surface-hover object-contain"
      />
      <div className="space-y-3 text-sm">
        <p className="font-semibold">{STATE_LABEL[state]}</p>
        {item.title ? <p className="text-base">{item.title}</p> : null}
        {item.body ? <p className="whitespace-pre-wrap text-ink-muted">{item.body}</p> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-muted">
          <dt>投稿者</dt>
          <dd>
            {item.author.name} @{item.author.handle}
          </dd>
          <dt>公開範囲</dt>
          <dd>{visibilityLabel(item.visibility)}</dd>
          <dt>投稿日</dt>
          <dd>{formatDate(item.createdAt)}</dd>
          <dt>判定</dt>
          <dd>
            {item.moderationLabels
              ? Object.entries(item.moderationLabels)
                  .map(([k, v]) => `${k} ${v.toFixed(2)}`)
                  .join(" / ")
              : "なし"}
          </dd>
        </dl>
        <label htmlFor={reasonId} className="block space-y-1">
          <span className="font-semibold">理由</span>
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="記録に残ります。個人の情報は書かないでください"
          className="w-full rounded-md border border-line bg-surface px-2 py-1"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void decide("approve")}
            disabled={busy || !reason.trim()}
            className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
          >
            公開する
          </button>
          <button
            type="button"
            onClick={() => void decide("reject")}
            disabled={busy || !reason.trim()}
            className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
          >
            非表示にする
          </button>
        </div>
        {message ? (
          <p role="alert" className="text-sm">
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}
