import { useState } from "react";

/**
 * 投稿の URL をコピーする (要件定義書 16 章)。クリップボードが使えなければ、URL を選べる形で出す。
 * 公開と限定公開の投稿だけに置く (非公開は本人以外に見えないので配る意味がない)
 */
export function CopyUrlButton() {
  const [state, setState] = useState<"idle" | "copied" | { fallback: string }>("idle");

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState({ fallback: url });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
      >
        URL をコピー
      </button>
      {state === "copied" ? <span role="status">URL をコピーしました</span> : null}
      {typeof state === "object" ? (
        <input
          readOnly
          value={state.fallback}
          aria-label="投稿の URL"
          onFocus={(e) => e.currentTarget.select()}
          className="w-64 max-w-full rounded-md border border-line bg-surface px-2 py-1"
        />
      ) : null}
    </div>
  );
}
