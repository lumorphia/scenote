import { VISIBILITY_OPTIONS, type Visibility } from "./visibility.ts";
/** 公開範囲。既定は公開 (相棒の決定、2026-10-12)。何を選んでいるかを説明つきで並べる */
export function VisibilityField({
  value,
  onChange,
  name = "visibility",
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  name?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">公開範囲</legend>
      {VISIBILITY_OPTIONS.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-surface-muted"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold">{option.label}</span>
            <span className="block text-xs text-ink-muted">{option.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
