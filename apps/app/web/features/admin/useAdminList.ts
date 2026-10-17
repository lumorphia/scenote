import { useEffect, useState } from "react";

/** 管理の一覧 API を読む。片付いたものは remove で外す */
export function useAdminList<T extends { id: string }>(url: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(url, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
        return ((await res.json()) as { items: T[] }).items;
      })
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [url]);
  const remove = (id: string) => setItems((before) => (before ?? []).filter((i) => i.id !== id));
  return { items, failed, remove };
}
