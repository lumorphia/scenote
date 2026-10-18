import { Form, Link } from "react-router";
import { PostFeed } from "../features/post-list/PostFeed.tsx";
import { readSearch, searchHref, searchTitle } from "../features/search/search-params.ts";
import { serverReadsContext } from "../lib/server-context.ts";
import type { Route } from "./+types/search";

export function headers() {
  return { "Cache-Control": "no-store" };
}

/** 検索の結果は言葉の数だけあるので、検索エンジンには載せない */
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: searchTitle(loaderData?.filter ?? {}) }, { name: "robots", content: "noindex" }];
}

/** 最初のページと地点の候補をサーバーの中で読む (ADR-0018)。結果の URL をそのまま共有できる */
export async function loader({ request, context }: Route.LoaderArgs) {
  const filter = readSearch(new URL(request.url).searchParams);
  const reads = context.get(serverReadsContext);
  const { page, regions } = reads ? await reads.search(filter) : { page: undefined, regions: [] };
  return { filter, page, regions };
}

const field = "rounded-md border border-line bg-surface px-3 py-2 text-sm";

/**
 * 写真を探す (S6f、ADR-0028)。1 つの欄の言葉が、どれもタイトル・タグ・地点のどこかにある公開の写真。
 * 地点とタグで絞れる。出るのは公開の投稿だけ (要件定義書 11 章)
 */
export default function Search({ loaderData }: Route.ComponentProps) {
  const { filter, page, regions } = loaderData;
  const { tag, ...rest } = filter;
  const withoutTag = searchHref(rest);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">写真を探す</h1>
      {/* 検索を変えたら欄を読み直す (defaultValue は最初の描画でしか効かない) */}
      <Form
        key={searchHref(filter)}
        method="get"
        action="/search"
        role="search"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="block min-w-0 flex-1 basis-72 text-sm">
          言葉
          <input
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            maxLength={200}
            placeholder="タイトル・タグ・地点 (例: 夕焼け ラベンダーベッド)"
            className={`${field} mt-1 w-full`}
          />
        </label>
        <label className="block text-sm">
          地点
          <select
            name="place"
            defaultValue={filter.placeId ?? ""}
            className={`${field} mt-1 block`}
          >
            <option value="">すべての地点</option>
            {regions.map((region) => (
              <optgroup key={region.name} label={region.name}>
                {region.places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
        >
          探す
        </button>
      </Form>
      {tag ? (
        <p className="flex items-center gap-2 text-sm">
          <span>タグ: #{tag}</span>
          <Link
            to={withoutTag}
            aria-label={`タグ #${tag} を外す`}
            className="rounded-md border border-line px-2 hover:bg-surface-hover"
          >
            外す
          </Link>
        </p>
      ) : null}
      <PostFeed
        filter={filter}
        initialPage={page}
        emptyMessage="当てはまる公開の写真はありません。"
      />
    </main>
  );
}
