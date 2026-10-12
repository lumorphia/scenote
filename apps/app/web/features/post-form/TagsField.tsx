import { useState } from "react";
import { addTag, MAX_TAGS } from "./tags.ts";

/** タグの入力。Enter か「追加」で足し、× で外す。日本語の変換中の Enter では足さない */
export function TagsField({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    onChange(addTag(value, draft));
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm font-semibold">タグ (任意、{MAX_TAGS} 個まで)</span>
        <span className="flex gap-2">
          <input
            name="tag"
            value={draft}
            placeholder="例: 夕焼け"
            disabled={value.length >= MAX_TAGS}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              add();
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || value.length >= MAX_TAGS}
            className="shrink-0 rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
          >
            追加
          </button>
        </span>
      </label>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="付けたタグ">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm"
            >
              <span>#{tag}</span>
              <button
                type="button"
                aria-label={`#${tag} を外す`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-ink-muted hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
