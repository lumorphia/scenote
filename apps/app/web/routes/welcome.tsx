import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { safeNext } from "../lib/login.ts";
import type { Route } from "./+types/welcome";

export function meta(_: Route.MetaArgs) {
  return [{ title: "はじめに - Scenote" }, { name: "robots", content: "noindex" }];
}

/**
 * 規約とプライバシーポリシーへの同意と、15 歳以上であることの確認 (ADR-0023)。
 * 初めてログインしたときと、規約が大きく変わったときに、ヘッダーがここへ送る
 */
export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/me/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ageConfirmed: true, termsAccepted: true }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) void navigate(safeNext(params.get("next")), { replace: true });
    else if (res?.status === 401) setMessage("ログインが切れました。ログインし直してください。");
    else setMessage("記録できませんでした。もう一度お試しください。");
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">はじめに</h1>
      <p>
        Scenote を使う前に、
        <Link to="/terms" className="underline">
          利用規約
        </Link>
        と
        <Link to="/privacy" className="underline">
          プライバシーポリシー
        </Link>
        を読んで、同意してください。規約が大きく変わったときも、ここで改めて同意をお願いします。
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
        <li>投稿できるのは FINAL FANTASY XIV のスクリーンショットです</li>
        <li>他の人が写っている場合は、本人の了承を得てください</li>
        <li>投稿した写真は AI の学習に使いません</li>
      </ul>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
          15 歳以上です
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          利用規約とプライバシーポリシーに同意します
        </label>
      </div>
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy || !age || !terms}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
      >
        同意して始める
      </button>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
      <p className="text-sm text-ink-muted">
        同意しない場合は、ログアウトしてください。ログインしなくても、公開された写真の閲覧と現像はできます。
      </p>
    </main>
  );
}
