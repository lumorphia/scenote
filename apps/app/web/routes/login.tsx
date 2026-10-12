import { redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { loginErrorMessage, loginHref, safeNext } from "../lib/login.ts";

export function meta(_: Route.MetaArgs) {
  return [{ title: "ログイン - Scenote" }, { name: "robots", content: "noindex" }];
}

/** 開いたらすぐ Lumorphia のログインへ進む。失敗して戻ってきたとき (?error=) だけ画面を出す (ADR-0009) */
export function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  if (!params.get("error")) throw redirect(loginHref(safeNext(params.get("next"))));
  return null;
}

export default function Login() {
  const [params] = useSearchParams();
  const message = loginErrorMessage(params.get("error"));
  return (
    <main className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-semibold">ログイン</h1>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
      <a
        href={loginHref(safeNext(params.get("next")))}
        className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong"
      >
        Lumorphia アカウントでログイン
      </a>
    </main>
  );
}
