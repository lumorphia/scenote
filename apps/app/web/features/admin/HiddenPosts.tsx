import { visibilityLabel, type Visibility } from "../post-form/visibility.ts";
import { DecisionForm, postAdmin } from "./DecisionForm.tsx";
import { useAdminList } from "./useAdminList.ts";

type HiddenPost = {
  id: string;
  visibility: Visibility;
  title: string | null;
  author: { handle: string; name: string };
  thumb: string;
};

/** 運営が非表示にした投稿と、公開に戻す操作 (S7b-1、ADR-0021) */
export function HiddenPosts() {
  const { items, failed, remove } = useAdminList<HiddenPost>("/api/admin/hidden");
  if (failed)
    return (
      <p role="alert" className="text-sm">
        非表示の投稿を読み込めませんでした。
      </p>
    );
  if (!items) return <p className="text-sm text-ink-muted">読み込んでいます…</p>;
  return (
    <section className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">非表示の投稿はありません。</p>
      ) : null}
      {items.map((item) => (
        <article
          key={item.id}
          className="grid gap-4 rounded-md border border-line-soft p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]"
        >
          <img
            src={item.thumb}
            alt={item.title ?? "非表示の写真"}
            className="h-auto w-full rounded-md bg-surface-hover object-contain"
          />
          <div className="space-y-3 text-sm">
            {item.title ? <p className="text-base">{item.title}</p> : null}
            <p className="text-ink-muted">
              {item.author.name} @{item.author.handle} ・ {visibilityLabel(item.visibility)}
            </p>
            <DecisionForm
              decisions={[
                {
                  label: "公開に戻す",
                  primary: true,
                  run: (reason) =>
                    postAdmin(`/api/admin/posts/${encodeURIComponent(item.id)}/restore`, {
                      reason,
                    }),
                },
              ]}
              onDone={() => remove(item.id)}
            />
          </div>
        </article>
      ))}
    </section>
  );
}
