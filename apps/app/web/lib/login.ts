/** ログインの戻り先はこのサイトの中のパスだけ (server の routes/lumorphia.ts と同じ決まり) */
export function safeNext(input: string | null | undefined): string {
  if (!input || !input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\"))
    return "/";
  return input;
}

/** ログインを始めて、終わったら `next` に戻る URL。サーバーが accounts の認可へ 302 で送る (ADR-0009) */
export function loginHref(next: string): string {
  return `/api/lumorphia/login?next=${encodeURIComponent(safeNext(next))}`;
}

/** /login?error=<code> の文言。Better Auth の OAuth のエラーと、ログインを始められなかったとき */
export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  // Better Auth の state は 10 分で切れる (lumorphia/prismtone の A2.1b で相棒が望んだ案内)
  if (code === "state_mismatch" || code === "please_restart_the_process")
    return "ログインできませんでした。時間が経ったので、もう一度ログインしてください。";
  if (code === "login_unavailable")
    return "いまはログインできません。しばらくしてからお試しください。";
  return "ログインできませんでした。もう一度お試しください。";
}
