import { Link } from "react-router";
import { PostFeed } from "../features/post-list/PostFeed.tsx";
import { TagSearch } from "../features/post-list/TagSearch.tsx";
import { JournalHero } from "../features/journal/JournalHero.tsx";
import { PlacesExplorer } from "../features/journal/PlacesExplorer.tsx";
import { serverReadsContext } from "../lib/server-context.ts";
import type { Route } from "./+types/home";

export function headers() {
  return { "Cache-Control": "no-store" };
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Scenote — 冒険者の写真日誌" },
    {
      name: "description",
      content: "FINAL FANTASY XIVで撮った風景や日常を、写真と短い記録で残す場所。",
    },
  ];
}

/** サーバー内の読み出しで表紙と新着を揃える (ADR-0018)。 */
export async function loader({ context }: Route.LoaderArgs) {
  const reads = context.get(serverReadsContext);
  return reads ? reads.journalHome() : { page: { items: [], nextCursor: null }, regions: [] };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="journal-container">
      <JournalHero items={loaderData.page.items} />
      <div className="journal-rule">
        <span>SCENES, SMALL DAYS & JOURNEYS</span>
        <span>冒険者の写真日誌</span>
      </div>
      <section id="photos" className="journal-feed" aria-labelledby="recent-title">
        <div className="journal-section-heading">
          <div>
            <p className="journal-eyebrow">RECENT ENTRIES</p>
            <h2 id="recent-title">新着の写真</h2>
          </div>
          <TagSearch />
        </div>
        <PostFeed initialPage={loaderData.page} emptyMessage="まだ公開された写真がありません。" />
      </section>
      <PlacesExplorer
        regions={loaderData.regions}
        preferredPlaceId={loaderData.page.items.find((p) => p.place?.id)?.place?.id ?? undefined}
      />
      <section className="journal-closing">
        <p className="journal-eyebrow">MAKE A NOTE OF TODAY</p>
        <h2>次に開いたとき、思い出せるように。</h2>
        <p>写真に、場所と日付とひとことを添えて。</p>
        <Link to="/edit" className="journal-primary">
          写真を編集する <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </main>
  );
}
