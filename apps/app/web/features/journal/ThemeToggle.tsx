import { useEffect, useState } from "react";

/** OS の配色を初期値にし、明示した選択だけ端末に保存する。 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("scenote-theme");
      } catch {
        /* 保存できなくても切り替えられる */
      }
      const explicit = saved === "dark" || saved === "light";
      if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
      setDark(explicit ? saved === "dark" : query.matches);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return (
    <button
      type="button"
      className="journal-theme-toggle"
      aria-label={dark ? "ライトテーマに切り替える" : "ダークテーマに切り替える"}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        setDark(!dark);
        try {
          localStorage.setItem("scenote-theme", theme);
        } catch {
          /* 保存できなくても切り替えられる */
        }
      }}
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
