import { Link } from "react-router";
import { PostFeed } from "../features/post-list/PostFeed.tsx";
import { TagSearch } from "../features/post-list/TagSearch.tsx";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Scenote" }];
}

/** トップ。公開の写真の一覧 (S6a、ADR-0016) とタグで探す (S6c) */
export default function Home() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scenote</h1>
          <p className="mt-1 text-sm text-ink-muted">
            FINAL FANTASY XIV で撮った風景や日常を、現像して残す場所です。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TagSearch />
          <Link
            to="/edit"
            className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
          >
            現像する
          </Link>
        </div>
      </section>
      <PostFeed emptyMessage="まだ公開された写真がありません。" />
    </main>
  );
}
