import { Link } from "react-router";
import { formatDate } from "../../lib/format-date.ts";
import { visibilityLabel, type Visibility } from "../post-form/visibility.ts";
import { layoutColumns } from "../post-list/columns.ts";
import { useColumnCount } from "../post-list/PostList.tsx";
import { statusLabel, type PostStatus } from "./labels.ts";

export type MyPostCard = {
  id: string;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/** 画像がまだ無い投稿は、正方形の枠で並べる */
const sized = (item: MyPostCard) => ({ ...item, width: item.width ?? 1, height: item.height ?? 1 });

/** マイページの一覧 (S6d)。公開範囲と、公開されていない状態を札で添える */
export function MyPostList({ items }: { items: readonly MyPostCard[] }) {
  const columns = layoutColumns(items.map(sized), useColumnCount());
  return (
    <div data-testid="my-post-list" className="flex items-start gap-3">
      {columns.map((column, i) => (
        <ul key={i} className="flex min-w-0 flex-1 flex-col gap-3">
          {column.map((item) => {
            const status = statusLabel(item.status);
            return (
              <li key={item.id}>
                <Link
                  to={`/posts/${item.id}`}
                  className="group block focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {item.thumb ? (
                    <img
                      src={item.thumb}
                      width={item.width}
                      height={item.height}
                      alt={item.title ?? "自分の写真"}
                      loading="lazy"
                      decoding="async"
                      className="h-auto w-full rounded-md bg-surface-hover group-hover:opacity-90"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-md bg-surface-hover" />
                  )}
                  <div className="space-y-0.5 px-0.5 pt-1.5 text-xs text-ink-muted">
                    {item.title ? <p className="truncate text-sm text-ink">{item.title}</p> : null}
                    <p className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-surface-muted px-2">
                        {visibilityLabel(item.visibility)}
                      </span>
                      {status ? (
                        <span className="rounded-full bg-surface-muted px-2">{status}</span>
                      ) : null}
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
