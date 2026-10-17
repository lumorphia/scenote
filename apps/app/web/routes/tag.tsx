import { useParams } from "react-router";
import { PostFeed } from "../features/post-list/PostFeed.tsx";
import { TagSearch } from "../features/post-list/TagSearch.tsx";
import type { Route } from "./+types/tag";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `#${params.name} - Scenote` }];
}

/** タグのページ (S6c、要件定義書 11 章)。出るのは公開の投稿だけ */
export default function Tag() {
  const { name = "" } = useParams();
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">#{name}</h1>
        <TagSearch />
      </section>
      <PostFeed
        filter={{ tag: name }}
        emptyMessage="このタグの付いた公開の写真はまだありません。"
      />
    </main>
  );
}
