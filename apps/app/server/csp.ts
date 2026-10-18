/**
 * Content-Security-Policy の組み立て。lumorphia/accounts の csp.ts (元は lumorphia/prismtone の RM-28) を、
 * Scenote に要るものだけにした。現像 (lumorphia/editor) に要るものは editor の ADR-0009 に従う
 * - script-src: 自分と、SSR が出すインラインスクリプトのリクエストごとの nonce。現像の描画と認識の WASM に
 *   'wasm-unsafe-eval'。'unsafe-eval' と 'unsafe-inline' は入れない
 * - img-src: 自分、投稿画像の配信元、data: と blob: (現像のプレビュー)
 * - worker-src: 現像の認識の Worker (自分と blob:)。モデルは同じオリジンの /models/ から読む
 * - connect-src: 自分、画像の置き場所 (R2 への署名付き PUT)、問い合わせの Google フォーム (ADR-0027)、Sentry
 * - style-src: React の style 属性のために 'unsafe-inline'
 */
export type CspDirectives = Record<string, string[]>;

export type CspInput = {
  nonce: string;
  /** PUBLIC_IMAGE_BASE_URL。相対 (同一オリジン) なら足さない */
  imageBaseUrl: string;
  /** ブラウザが画像を PUT する先。相対 (開発の /_storage) なら足さない */
  uploadOrigin: string | null;
  /** ブラウザ SDK の送信先。未設定なら足さない */
  sentryDsn: string | null;
};

/** 問い合わせは Google フォームの formResponse に直接 POST する (web/features/contact/google-form.ts) */
const GOOGLE_FORMS_ORIGIN = "https://docs.google.com";

export const CSP_REPORT_PATH = "/api/csp-report";
/** Fastify → SSR (entry.server) に nonce を渡すリクエストヘッダ。外から来た値は security plugin が上書きする */
export const CSP_NONCE_HEADER = "x-csp-nonce";

/** 絶対 URL ならオリジンを返す。相対や不正な値は null */
function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}

export function buildCspDirectives(input: CspInput): CspDirectives {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${input.nonce}'`, "'wasm-unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": unique(["'self'", originOf(input.imageBaseUrl), "data:", "blob:"]),
    "font-src": ["'self'", "data:"],
    "connect-src": unique([
      "'self'",
      originOf(input.uploadOrigin),
      GOOGLE_FORMS_ORIGIN,
      originOf(input.sentryDsn),
    ]),
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  };
}

export function serializeCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
