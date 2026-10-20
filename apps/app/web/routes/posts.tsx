import { useEffect, useRef, useState } from "react";
import { Form, useNavigate } from "react-router";
import { MorePosts, usePostPages, type PostFilter } from "../features/post-list/PostFeed.tsx";
import { PostList } from "../features/post-list/PostList.tsx";
import {
  hasSearch,
  MAX_SEARCH_TAGS,
  readSearch,
  searchHref,
  searchTitle,
  type SearchFilter,
} from "../features/search/search-params.ts";
import { serverReadsContext } from "../lib/server-context.ts";
import type { Route } from "./+types/posts";

export function headers() {
  return { "Cache-Control": "no-store" };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  return [
    { title: searchTitle(loaderData?.filter ?? { tags: [] }) },
    {
      name: "description",
      content: "FINAL FANTASY XIVで撮った風景や日常の写真を、タイトル・タグ・地点で探す。",
    },
    // 検索と絞り込みは組み合わせの数だけ URL が増える。結果のページは検索エンジンに載せない (lumorphia/prismtone と同じ)
    ...(location.search ? [{ name: "robots", content: "noindex" }] : []),
  ];
}

/** 最初のページと地点の候補をサーバーの中で読む (ADR-0018)。結果の URL をそのまま共有できる */
export async function loader({ request, context }: Route.LoaderArgs) {
  const filter = readSearch(new URL(request.url).searchParams);
  const reads = context.get(serverReadsContext);
  const { page, regions } = reads ? await reads.search(filter) : { page: undefined, regions: [] };
  return { filter, page, regions };
}

const apiFilter = (filter: SearchFilter): PostFilter => ({
  ...(filter.q ? { q: filter.q } : {}),
  ...(filter.tags.length > 0 ? { tag: filter.tags } : {}),
  ...(filter.placeId ? { placeId: filter.placeId } : {}),
});

/**
 * 写真を探す (S6f、ADR-0028)。lumorphia/prismtone の /posts と同じ形: 言葉の欄、絞り込み (広い画面は横、
 * 狭い画面はダイアログ)、件数、いまの条件。言葉はタイトル・タグ・地点のどこかにあるもの、絞り込みは地点とタグ
 */
export default function Posts({ loaderData }: Route.ComponentProps) {
  const { filter, page, regions } = loaderData;
  const navigate = useNavigate();
  const pages = usePostPages(apiFilter(filter), page);
  const placeName = (id: string) =>
    regions.flatMap((r) => r.places).find((p) => p.id === id)?.name ?? id;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilter>(filter);
  const dialog = useRef<HTMLDialogElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const panel = filtersOpen ? draft : filter;

  const go = (next: SearchFilter) => void navigate(searchHref(next));
  /** 横の絞り込みはすぐ当てる。ダイアログの中では「この条件で探す」まで当てない */
  const edit = (change: (current: SearchFilter) => SearchFilter) => {
    if (filtersOpen) setDraft(change(draft));
    else go(change(filter));
  };
  const clear = () => {
    if (filtersOpen) setDraft({ tags: [] });
    else go({ tags: [] });
  };
  const apply = () => {
    if (filtersOpen) {
      go(draft);
      dialog.current?.close();
    } else go(filter);
  };

  useEffect(() => {
    if (!filtersOpen) return;
    dialog.current?.showModal();
    const wide = matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (wide.matches) dialog.current?.close();
    };
    wide.addEventListener("change", closeOnDesktop);
    return () => wide.removeEventListener("change", closeOnDesktop);
  }, [filtersOpen]);

  const filterFields = (
    <>
      <div className="search-filter-heading">
        <h2>絞り込み</h2>
      </div>
      <div className="search-filter-fields">
        <label className="block">
          地点
          <select
            value={panel.placeId ?? ""}
            onChange={(e) => {
              const placeId = e.currentTarget.value;
              edit(({ placeId: _, ...rest }) => (placeId ? { ...rest, placeId } : rest));
            }}
            data-testid="filter-place"
          >
            <option value="">指定なし</option>
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
        <div className="search-filter-divider" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("tag") as HTMLInputElement;
            const value = input.value
              .trim()
              .replace(/^[#＃]+/u, "")
              .trim();
            if (!value) return;
            input.value = "";
            edit((current) =>
              current.tags.includes(value) || current.tags.length >= MAX_SEARCH_TAGS
                ? current
                : { ...current, tags: [...current.tags, value] },
            );
          }}
        >
          <label htmlFor={filtersOpen ? "dialog-filter-tag" : "filter-tag"}>タグ</label>
          <div className="search-filter-tag-row">
            <input id={filtersOpen ? "dialog-filter-tag" : "filter-tag"} name="tag" />
            <button type="submit">追加</button>
          </div>
        </form>
        {panel.tags.length > 0 ? (
          <ul className="search-filter-chips" data-testid="filter-tags">
            {panel.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() =>
                    edit((current) => ({ ...current, tags: current.tags.filter((t) => t !== tag) }))
                  }
                  aria-label={`タグ ${tag} の条件を外す`}
                >
                  #{tag} ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {hasSearch(panel) ? (
          <button type="button" onClick={clear} className="search-filter-clear">
            条件をクリア
          </button>
        ) : null}
        <button
          type="button"
          className="search-filter-apply"
          data-testid="search-filter-apply"
          onClick={apply}
        >
          この条件で探す <span aria-hidden="true">→</span>
        </button>
      </div>
    </>
  );

  const { q, placeId, tags, ...rest } = filter;
  const activeFilters: { key: string; label: string; display: string; without: SearchFilter }[] = [
    ...(q
      ? [
          {
            key: "q",
            label: "キーワード",
            display: q,
            without: { ...rest, tags, ...(placeId ? { placeId } : {}) },
          },
        ]
      : []),
    ...(placeId
      ? [
          {
            key: "place",
            label: "地点",
            display: placeName(placeId),
            without: { ...rest, tags, ...(q ? { q } : {}) },
          },
        ]
      : []),
    ...tags.map((tag) => ({
      key: `tag:${tag}`,
      label: "タグ",
      display: `#${tag}`,
      without: { ...filter, tags: tags.filter((t) => t !== tag) },
    })),
  ];

  return (
    <main className="search-page journal-container">
      <div className="search-intro">
        <p className="journal-eyebrow">A JOURNAL OF EORZEA</p>
        <h1>写真を探す</h1>
        <p>タイトル、タグ、地点で探せます。</p>
      </div>
      <Form method="get" action="/posts" role="search" className="search-keyword">
        <label className="search-keyword-label">
          <span className="sr-only">写真を探す</span>
          <input
            key={filter.q ?? ""}
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            maxLength={200}
            placeholder="タイトル、タグ、地点"
            data-testid="search-input"
          />
        </label>
        {filter.tags.map((tag) => (
          <input key={tag} type="hidden" name="tag" value={tag} />
        ))}
        {filter.placeId ? <input type="hidden" name="place" value={filter.placeId} /> : null}
        <button type="submit">
          検索 <span aria-hidden="true">→</span>
        </button>
      </Form>

      <div className="search-layout">
        <aside className="search-filter-sidebar" data-testid="search-filter-sidebar">
          {!filtersOpen && filterFields}
        </aside>

        <div className="search-results">
          <div className="search-results-bar">
            <div className="search-results-label">
              <span className="journal-eyebrow">PHOTOGRAPHS</span>
              <p data-testid="search-results-count">
                <span>{pages.items?.length ?? 0}</span>件の写真
              </p>
            </div>
            <button
              type="button"
              ref={filterTrigger}
              className="search-filter-trigger"
              data-testid="search-filter-trigger"
              onClick={() => {
                setDraft(filter);
                setFiltersOpen(true);
              }}
            >
              絞り込み {activeFilters.length ? `(${activeFilters.length})` : ""}{" "}
              <span aria-hidden="true">≡</span>
            </button>
          </div>
          <div className="search-active-filters" data-testid="search-active-filters">
            {activeFilters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-label={`${entry.label} ${entry.display} の条件を外す`}
                onClick={() => go(entry.without)}
              >
                {entry.label}：{entry.display} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          {pages.items === null && !pages.failed ? (
            <p className="text-sm text-ink-muted">読み込んでいます…</p>
          ) : null}
          {pages.items !== null && pages.items.length > 0 ? <PostList items={pages.items} /> : null}
          {pages.items !== null && pages.items.length === 0 ? (
            <div className="search-empty">
              <p className="journal-eyebrow">A LITTLE DIFFERENT?</p>
              <h2>条件を変えると見つかるかもしれません。</h2>
              <p data-testid="post-grid-empty">
                {hasSearch(filter)
                  ? "条件に合う公開の写真はありません。"
                  : "公開された写真はまだありません。"}
              </p>
              {hasSearch(filter) ? (
                <button type="button" onClick={() => go({ tags: [] })}>
                  すべての写真を見る
                </button>
              ) : null}
            </div>
          ) : null}
          <MorePosts pages={pages} />
        </div>
      </div>
      <dialog
        ref={dialog}
        className="search-filter-dialog"
        data-testid="search-filter-dialog"
        aria-labelledby="search-dialog-title"
        onClose={() => {
          setFiltersOpen(false);
          if (filterTrigger.current?.getClientRects().length) filterTrigger.current.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="search-dialog-heading">
          <h2 id="search-dialog-title">絞り込み</h2>
          <button
            type="button"
            aria-label="絞り込みを閉じる"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {filtersOpen && filterFields}
      </dialog>
    </main>
  );
}
