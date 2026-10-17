import { useState } from "react";
import { useNavigate } from "react-router";
import { tagPath } from "./tag-path.ts";

/** タグで探す (S6c、要件定義書 11 章)。タグのページへ進む */
export function TagSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const path = tagPath(value);
        if (path) void navigate(path);
      }}
      className="flex gap-2"
    >
      <input
        type="search"
        aria-label="タグで探す"
        placeholder="タグで探す (例: 夕焼け)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-56 max-w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
      />
    </form>
  );
}
