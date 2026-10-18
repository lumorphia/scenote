import { useState } from "react";
import {
  CONTACT_CATEGORIES,
  GOOGLE_FORM,
  LAST_SUBMIT_KEY,
  looksLikeSpam,
  MESSAGE_MAX,
  NAME_MAX,
  nextAllowedAt,
  submitToGoogleForm,
  validateContactInput,
  type ContactCategory,
  type ContactErrors,
} from "../features/contact/google-form.ts";
import type { Route } from "./+types/contact";

export function meta(_: Route.MetaArgs) {
  return [{ title: "お問い合わせ - Scenote" }];
}

const input = "mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm";

function readLastSubmit(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SUBMIT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeLastSubmit(now: number): void {
  try {
    window.localStorage.setItem(LAST_SUBMIT_KEY, String(now));
  } catch {
    // private モードなどで書けなくても送信は妨げない
  }
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <span className="mt-1 block text-xs font-semibold" data-testid={`error-${id}`}>
      {message}
    </span>
  );
}

/**
 * 問い合わせ (ADR-0027)。送信先は Lumorphia で共通の Google フォーム (features/contact/google-form.ts)。
 * ログインしていない人も使う (Lumorphia アカウントの無い人の通報や、権利者からの依頼。規約の 6・7)
 */
export default function Contact() {
  const [category, setCategory] = useState<ContactCategory | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<ContactErrors>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed" | "too_soon">("idle");

  const submit = async () => {
    const values = { category: category as ContactCategory, name, email, message };
    const found = validateContactInput(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const now = Date.now();
    if (nextAllowedAt(readLastSubmit(), now) > 0) {
      setState("too_soon");
      return;
    }
    // honeypot が埋まっていたら bot とみなし、送らずに成功したふりをする
    if (looksLikeSpam({ website })) {
      writeLastSubmit(now);
      setState("done");
      return;
    }
    setState("sending");
    try {
      await submitToGoogleForm(values);
      writeLastSubmit(now);
      setState("done");
    } catch {
      setState("failed");
    }
  };

  if (state === "done") {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">お問い合わせ</h1>
        <p role="status" data-testid="contact-done">
          送信しました。ありがとうございます。返信が必要な内容でメールアドレスをいただいている場合は、確認のうえご連絡します。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">お問い合わせ</h1>
      <p className="text-sm text-ink-muted">
        機能の不具合や要望、ログインやアカウントのこと、投稿の削除の依頼や権利に関するご依頼はこちらから。対象の投稿があれば、その
        URL を書き添えてください。送信内容は運営者だけが確認します (Lumorphia のサービスで共通の
        Google フォームで受け付けています)。
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm">
          種別
          <select
            value={category}
            onChange={(e) => setCategory(e.currentTarget.value as ContactCategory | "")}
            required
            className={input}
          >
            <option value="">選んでください</option>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError id="category" message={errors.category} />
        </label>
        <label className="block text-sm">
          お名前 (任意)
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={NAME_MAX}
            autoComplete="name"
            className={input}
          />
          <FieldError id="name" message={errors.name} />
        </label>
        <label className="block text-sm">
          メールアドレス (任意)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            maxLength={254}
            autoComplete="email"
            className={input}
          />
          <span className="mt-1 block text-xs text-ink-muted">
            返信が必要な場合にだけ入力してください。返信以外には使いません
          </span>
          <FieldError id="email" message={errors.email} />
        </label>
        <label className="block text-sm">
          お問い合わせ内容
          <textarea
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            required
            rows={8}
            maxLength={MESSAGE_MAX}
            className={input}
          />
          <FieldError id="message" message={errors.message} />
        </label>
        {/* honeypot。人には見えず、自動入力もされない。bot は名前から URL を埋める */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.currentTarget.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>
        {state === "too_soon" && (
          <p role="alert" className="text-sm">
            送信からしばらく空けてからもう一度お送りください (同じブラウザから 1 分に 1 通まで)。
          </p>
        )}
        {state === "failed" && (
          <p role="alert" className="text-sm">
            送信できませんでした。お手数ですが、
            <a href={GOOGLE_FORM.viewUrl} target="_blank" rel="noreferrer" className="underline">
              Google フォームを開く
            </a>
            から、問い合わせ先に Scenote を選んで直接お送りください。
          </p>
        )}
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
        >
          {state === "sending" ? "送信中…" : "送信する"}
        </button>
      </form>
    </main>
  );
}
