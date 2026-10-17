import { useEffect, useState } from "react";
import { ReviewQueue } from "../features/admin/ReviewQueue.tsx";
import type { Route } from "./+types/admin";

export function meta(_: Route.MetaArgs) {
  return [{ title: "運営 - Scenote" }, { name: "robots", content: "noindex" }];
}

/**
 * 運営の画面 (S7a、ADR-0019)。許可リストの運営者だけ。それ以外の人には、ページが無いのと同じに見せる。
 * 保留・要確認の投稿の確認 (S7a-2)。通報は S7b で足す
 */
export default function Admin() {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? "ok" : "missing"))
      .catch(() => "missing" as const)
      .then((next) => {
        if (active) setState(next);
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="p-4 text-sm text-ink-muted">読み込んでいます…</p>;
  if (state === "missing")
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p>ページが見つかりません。</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">運営</h1>
      <p className="text-sm text-ink-muted">
        ここでの操作は記録に残ります。理由には、利用者の名前やメールなどの個人の情報を書かないでください。
      </p>
      <ReviewQueue />
    </main>
  );
}
