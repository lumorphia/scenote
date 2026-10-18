/**
 * 問い合わせは Lumorphia の各サービスで共通の Google フォームで受ける (ADR-0027)。lumorphia/prismtone の
 * features/contact/google-form.ts を写し、サービスの欄を Scenote にした。自前の画面から Google の formResponse に直接 POST する
 * (サーバーもメールも持たない。https://qiita.com/s79ns/items/6782f46f49e1be38a6ff の方法)。
 * entry.* の番号はフォームの HTML (FB_PUBLIC_LOAD_DATA_) から取ったもので、Google フォーム側で
 * 項目を増減・並べ替えしたら取り直す。項目の文言と選択肢はフォームと一字一句同じにする
 */
export const GOOGLE_FORM = {
  /** 利用者に開いてもらう URL (送信に失敗したときの逃げ道)。サービスの欄が Scenote に選ばれた状態で開く */
  viewUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLScxZTBtbuGeSGdMwWoKcVyrEjQgG252zgYmRSCG77dJjrd0JQ/viewform?usp=pp_url&entry.2074387887=Scenote",
  action:
    "https://docs.google.com/forms/d/e/1FAIpQLScxZTBtbuGeSGdMwWoKcVyrEjQgG252zgYmRSCG77dJjrd0JQ/formResponse",
  entries: {
    /** Lumorphia の各サービスで共通のフォーム。どのサービスからの問い合わせかを選ぶ必須の項目 */
    service: "entry.2074387887",
    category: "entry.1920101705",
    name: "entry.866037534",
    email: "entry.434624129",
    message: "entry.1413431297",
  },
} as const;

/** サービスの欄の選択肢のうち、Scenote のもの。必須なので送らないと Google が受け付けない */
export const CONTACT_SERVICE = "Scenote";

export const CONTACT_CATEGORIES = [
  "機能に関するお問い合わせ",
  "ログインに関するお問い合わせ",
  "アカウントに関するお問い合わせ",
  "権利に関するお問い合わせ",
  "その他",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export type ContactInput = {
  category: ContactCategory;
  name: string;
  email: string;
  message: string;
};

export const NAME_MAX = 100;
export const MESSAGE_MAX = 5000;

/**
 * メールアドレスの検証。RFC 5322 の addr-spec のうち実際に使われる範囲:
 * local part は dot-atom (英数と !#$%&'*+/=?^_`{|}~- を . で区切る。先頭・末尾・連続の . は不可) か
 * quoted-string、64 文字まで。domain は英数とハイフンのラベル (先頭・末尾のハイフン不可、63 文字まで)
 * を . で区切り、最後のラベルは 2 文字以上の英字、全体 253 文字まで。アドレス全体は 254 文字まで。
 * IP リテラル (user@[192.0.2.1]) と国際化アドレス (RFC 6531) は受け付けない
 */
export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;

  const atext = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
  const dotAtom = new RegExp(`^${atext}(\\.${atext})*$`);
  const quoted = /^"(?:[^"\\\r\n]|\\[^\r\n])*"$/;
  if (!dotAtom.test(local) && !quoted.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  const label = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  if (!labels.every((l) => label.test(l))) return false;
  return /^[A-Za-z]{2,}$/.test(labels.at(-1)!);
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

/** 送信前の検証。ブラウザの required / type=email を DOM ごと書き換えられても、ここで止める */
export function validateContactInput(input: ContactInput): ContactErrors {
  const errors: ContactErrors = {};
  if (!(CONTACT_CATEGORIES as readonly string[]).includes(input.category))
    errors.category = "種別を選んでください";
  if (input.name.trim().length > NAME_MAX) errors.name = `お名前は ${NAME_MAX} 文字までです`;
  const email = input.email.trim();
  if (email && !isValidEmail(email)) errors.email = "メールアドレスの形式が正しくありません";
  const message = input.message.trim();
  if (message.length === 0) errors.message = "お問い合わせ内容を入力してください";
  else if (message.length > MESSAGE_MAX)
    errors.message = `お問い合わせ内容は ${MESSAGE_MAX} 文字までです`;
  return errors;
}

/**
 * スパムの保険。自前の API を挟まないので確実には防げない (Google フォームの URL は公開されている)。
 * bot が機械的に埋める隠し欄 (honeypot) と、同じブラウザからの連投を 1 分に 1 回に抑える
 */
export const SUBMIT_INTERVAL_MS = 60_000;
export const LAST_SUBMIT_KEY = "scenote:contact:last-submit";

export function looksLikeSpam(honeypot: { website: string }): boolean {
  return honeypot.website.trim().length > 0;
}

/** 次に送れる時刻。今すぐ送れるなら 0 */
export function nextAllowedAt(lastSubmitAt: number | null, now: number): number {
  if (lastSubmitAt === null) return 0;
  const next = lastSubmitAt + SUBMIT_INTERVAL_MS;
  return next > now ? next : 0;
}

/** 任意項目は空なら送らない (シート側で空欄になる) */
export function toGoogleFormBody(input: ContactInput): URLSearchParams {
  const body = new URLSearchParams();
  body.set(GOOGLE_FORM.entries.service, CONTACT_SERVICE);
  body.set(GOOGLE_FORM.entries.category, input.category);
  if (input.name.trim()) body.set(GOOGLE_FORM.entries.name, input.name.trim());
  if (input.email.trim()) body.set(GOOGLE_FORM.entries.email, input.email.trim());
  body.set(GOOGLE_FORM.entries.message, input.message.trim());
  return body;
}

/**
 * Google は formResponse に CORS ヘッダを付けないので、no-cors で送って応答は読まない
 * (届いたかは分からない。ネットワークエラーだけ検知できる)
 */
export async function submitToGoogleForm(input: ContactInput): Promise<void> {
  const errors = validateContactInput(input);
  if (Object.keys(errors).length > 0) throw new Error(Object.values(errors).join(" / "));
  await fetch(GOOGLE_FORM.action, {
    method: "POST",
    mode: "no-cors",
    body: toGoogleFormBody(input),
  });
}
