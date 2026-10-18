import { Form } from "react-router";

/** 写真を探す欄 (S6f、ADR-0028)。言葉を入れると検索のページへ進む。トップとタグのページに置く */
export function SearchBox() {
  return (
    <Form method="get" action="/search" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        aria-label="写真を探す"
        placeholder="タイトル・タグ・地点で探す"
        maxLength={200}
        className="w-64 max-w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
      />
    </Form>
  );
}
