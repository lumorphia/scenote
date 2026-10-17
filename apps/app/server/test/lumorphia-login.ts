import type { FastifyInstance } from "fastify";
import type { MockIssuer, MockLumorphiaUser } from "@lumorphia/e2e/mock-issuer";

/** Set-Cookie から Cookie ヘッダーを作る (名前=値だけ。前の Cookie に上書きで重ねる) */
export function mergeCookies(cookie: string, setCookie: string | string[] | undefined): string {
  const jar = new Map(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => [pair.split("=")[0]!, pair] as const),
  );
  for (const line of [setCookie ?? []].flat()) {
    const pair = line.split(";")[0]!;
    const name = pair.split("=")[0]!;
    if (pair.endsWith("=")) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join("; ");
}

/**
 * Better Auth のサインイン → 発行元のふりでの認可 → コールバックを通し、ログインした Cookie を返す。
 * ブラウザの代わりに app.inject で、本物と同じ道を通す
 */
export async function loginWithLumorphia(
  app: FastifyInstance,
  mock: MockIssuer,
  user: MockLumorphiaUser,
  /** 既定で規約に同意まで済ませる (S7d、ADR-0023)。同意の流れを確かめるときだけ false */
  { consent = true }: { consent?: boolean } = {},
): Promise<{ cookie: string; status: number; location: string | undefined }> {
  const base = new URL(app.env.AUTH_BASE_URL);
  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/social",
    headers: { origin: base.origin, host: base.host, "content-type": "application/json" },
    payload: { provider: "lumorphia", callbackURL: "/" },
  });
  let cookie = mergeCookies("", signIn.headers["set-cookie"]);
  const authorize = new URL((signIn.json() as { url: string }).url);
  const approved = await fetch(`${mock.controlUrl}/_e2e/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce: authorize.searchParams.get("nonce"), user }),
  });
  const { code } = (await approved.json()) as { code: string };
  const callback = new URL(authorize.searchParams.get("redirect_uri")!);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", authorize.searchParams.get("state")!);
  const res = await app.inject({
    method: "GET",
    url: `${callback.pathname}${callback.search}`,
    headers: { cookie, host: base.host },
  });
  cookie = mergeCookies(cookie, res.headers["set-cookie"]);
  if (consent && res.statusCode < 400) {
    const accepted = await app.inject({
      method: "POST",
      url: "/api/me/consent",
      headers: {
        cookie,
        origin: base.origin,
        host: base.host,
        "content-type": "application/json",
      },
      payload: { ageConfirmed: true, termsAccepted: true },
    });
    // ログインに失敗した (Cookie が無い) ときは、同意も 401 になる。呼ぶ側が status で確かめる
    if (accepted.statusCode !== 204 && accepted.statusCode !== 401)
      throw new Error(`consent failed: ${accepted.statusCode} ${accepted.body}`);
  }
  return { cookie, status: res.statusCode, location: res.headers.location as string | undefined };
}
