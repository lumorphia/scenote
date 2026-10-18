import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { JournalPlace } from "../journal/maps.ts";
import { formatTakenOn } from "../../lib/format-date.ts";
import { formatDate } from "../../lib/format-date.ts";
import { columnCountFor, layoutColumns } from "./columns.ts";

export type PostCard = {
  id: string;
  title: string | null;
  thumb: string;
  width: number;
  height: number;
  author: { handle: string; name: string; image: string | null };
  tags: { name: string; displayName: string }[];
  publishedAt: string;
  takenOn?: string | null;
  place?: JournalPlace | null;
};

/** 画面の幅に合わせた列の数。SSR とハイドレーションの直後は 2 列 */
export function useColumnCount(): number {
  const [count, setCount] = useState(2);
  useEffect(() => {
    const update = () => setCount(columnCountFor(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

/** 写真を大きく、メタ情報は控えめに (要件定義書 12 章)。縦横比を保って、いちばん低い列に積む */
export function PostList({ items }: { items: readonly PostCard[] }) {
  const columns = layoutColumns(items, useColumnCount());
  return (
    <div data-testid="post-list" className="journal-photo-columns">
      {columns.map((column, i) => (
        <ul key={i} className="journal-photo-column">
          {column.map((item) => (
            <li key={item.id}>
              <Card item={item} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Card({ item }: { item: PostCard }) {
  return (
    <Link to={`/posts/${item.id}`} className="journal-photo-card group">
      <img
        src={item.thumb}
        width={item.width}
        height={item.height}
        alt={item.title ?? `${item.author.name} さんの写真`}
        loading="lazy"
        decoding="async"
        className="h-auto w-full bg-surface-hover transition-opacity group-hover:opacity-90"
      />
      <div className="journal-card-caption">
        {item.place ? <p className="journal-card-place">{item.place.name}</p> : null}
        {item.title ? <p className="journal-card-title">{item.title}</p> : null}
        <p className="truncate">
          {item.author.name} <span>@{item.author.handle}</span>
        </p>
        <p>
          <time dateTime={item.takenOn ?? item.publishedAt}>
            {item.takenOn ? formatTakenOn(item.takenOn) : formatDate(item.publishedAt)}
          </time>
          {item.tags.length ? (
            <span className="ml-2">{item.tags.map((t) => `#${t.displayName}`).join(" ")}</span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
