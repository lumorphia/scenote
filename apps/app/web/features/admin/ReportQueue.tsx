import { formatDate } from "../../lib/format-date.ts";
import { visibilityLabel, type Visibility } from "../post-form/visibility.ts";
import { reportReasonLabel, type ReportReason } from "../reports/reasons.ts";
import { DecisionForm, postAdmin } from "./DecisionForm.tsx";
import { useAdminList } from "./useAdminList.ts";

type OpenReport = {
  id: string;
  postId: string;
  reason: ReportReason;
  detail: string | null;
  createdAt: string;
  post: {
    visibility: Visibility;
    title: string | null;
    author: { handle: string; name: string };
  };
  display: string;
};

/** 対応待ちの通報 (S7b-1、ADR-0021)。投稿を非表示にするか、通報を退ける */
export function ReportQueue() {
  const { items, failed, remove } = useAdminList<OpenReport>("/api/admin/reports");
  if (failed)
    return (
      <p role="alert" className="text-sm">
        通報を読み込めませんでした。
      </p>
    );
  if (!items) return <p className="text-sm text-ink-muted">読み込んでいます…</p>;
  return (
    <section className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">対応を待っている通報はありません。</p>
      ) : null}
      {items.map((item) => {
        const act = (path: "hide" | "dismiss") => (reason: string) =>
          postAdmin(`/api/admin/reports/${encodeURIComponent(item.id)}/${path}`, { reason });
        return (
          <article
            key={item.id}
            className="grid gap-4 rounded-md border border-line-soft p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <img
              src={item.display}
              alt={item.post.title ?? "通報された写真"}
              className="h-auto max-h-96 w-full rounded-md bg-surface-hover object-contain"
            />
            <div className="space-y-3 text-sm">
              <p className="font-semibold">{reportReasonLabel(item.reason)}</p>
              {item.detail ? <p className="whitespace-pre-wrap">{item.detail}</p> : null}
              {item.post.title ? <p className="text-ink-muted">{item.post.title}</p> : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-muted">
                <dt>投稿者</dt>
                <dd>
                  {item.post.author.name} @{item.post.author.handle}
                </dd>
                <dt>公開範囲</dt>
                <dd>{visibilityLabel(item.post.visibility)}</dd>
                <dt>通報日</dt>
                <dd>{formatDate(item.createdAt)}</dd>
                <dt>投稿</dt>
                <dd>
                  <a href={`/posts/${item.postId}`} className="underline">
                    開く
                  </a>
                </dd>
              </dl>
              <DecisionForm
                decisions={[
                  { label: "非表示にする", primary: true, run: act("hide") },
                  { label: "退ける", run: act("dismiss") },
                ]}
                onDone={() => remove(item.id)}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
