import { formatDate } from "../../lib/format-date.ts";
import { visibilityLabel, type Visibility } from "../post-form/visibility.ts";
import { DecisionForm, postAdmin } from "./DecisionForm.tsx";
import { useAdminList } from "./useAdminList.ts";

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
  const { items, failed, remove } = useAdminList<ReviewItem>("/api/admin/reviews");

  if (failed)
    return (
      <p role="alert" className="text-sm">
        確認待ちを読み込めませんでした。
      </p>
    );
  if (!items) return <p className="text-sm text-ink-muted">読み込んでいます…</p>;
  return (
    <section className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">確認を待っている投稿はありません。</p>
      ) : null}
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} onDone={() => remove(item.id)} />
      ))}
    </section>
  );
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const state = item.status === "held" ? "held" : "flagged";
  const review = (decision: "approve" | "reject") => (reason: string) =>
    postAdmin(`/api/admin/posts/${encodeURIComponent(item.id)}/review`, { decision, reason });
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
        <DecisionForm
          decisions={[
            { label: "公開する", primary: true, run: review("approve") },
            { label: "非表示にする", run: review("reject") },
          ]}
          onDone={onDone}
        />
      </div>
    </article>
  );
}
