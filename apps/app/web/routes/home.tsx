import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Scenote" }];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Scenote</h1>
      <p className="mt-2 text-ink-muted">
        FINAL FANTASY XIV で撮った風景や日常を、現像して残す場所です。準備中です。
      </p>
      <p className="mt-6">
        <Link
          to="/edit"
          className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
        >
          現像する
        </Link>
      </p>
    </main>
  );
}
