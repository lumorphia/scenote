import { Link } from "react-router";
import type { PostCard } from "../post-list/PostList.tsx";
import { formatDate, formatTakenOn } from "../../lib/format-date.ts";
import { selectHeroPosts } from "./hero.ts";

const BRAND_PHOTOS = [
  { src: "/journal/journey.webp", title: "旅の途中で" },
  { src: "/journal/afternoon.webp", title: "いつもの日常" },
  { src: "/journal/friends.webp", title: "誰かと過ごした時間" },
];

/** 写真を貼った手帳の表紙。公開投稿がないときだけ運営者の写真を使う。 */
export function JournalHero({ items }: { items: readonly PostCard[] }) {
  const selected = selectHeroPosts(items);
  return (
    <section className="journal-hero" aria-labelledby="journal-title">
      <p className="journal-eyebrow">DAYS TO REMEMBER</p>
      <h1 id="journal-title">
        何でもない日も、
        <br />
        いい思い出になる。
      </h1>
      <p className="journal-introduction">FINAL FANTASY XIVで撮った写真を、あなたの記録に。</p>
      <div
        className={`journal-album journal-album-${selected.length || 3}`}
        data-testid="journal-album"
      >
        {selected.length
          ? selected.map((item) => (
              <Link key={item.id} to={`/posts/${item.id}`} className="journal-print">
                <img
                  src={item.thumb}
                  width={item.width}
                  height={item.height}
                  alt={item.title ?? `${item.author.name} さんの写真`}
                  fetchPriority="high"
                />
                <span>{item.title ?? item.author.name}</span>
                <time dateTime={item.takenOn ?? item.publishedAt}>
                  {item.takenOn ? formatTakenOn(item.takenOn) : formatDate(item.publishedAt)}
                </time>
              </Link>
            ))
          : BRAND_PHOTOS.map((item) => (
              <Link key={item.src} to="/edit" className="journal-print">
                <img
                  src={item.src}
                  width={1600}
                  height={900}
                  alt={item.title}
                  fetchPriority="high"
                />
                <span>{item.title}</span>
              </Link>
            ))}
      </div>
      <Link to="/edit" className="journal-primary">
        写真を編集する <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
