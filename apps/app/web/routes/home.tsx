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
    </main>
  );
}
