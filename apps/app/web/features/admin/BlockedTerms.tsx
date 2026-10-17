import { useCallback, useEffect, useState } from "react";
import { postAdmin } from "./DecisionForm.tsx";

type Term = {
  id: string;
  term: string;
  match: "exact" | "contains";
  source: string;
  enabled: boolean;
};

const MATCH_LABEL = { contains: "部分一致", exact: "語全体 (タグ向け)" } as const;

function sendAdmin(method: "PATCH" | "DELETE", url: string, body: object): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
}

/**
 * NG 語の辞書 (S7b-2、ADR-0022)。組み込みの一覧に足す語を、足す・まとめて入れる・止める・消す。
 * どの操作も理由が要るので、タブの上の 1 つの欄を使う
 */
export function BlockedTerms() {
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Term[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const res = await fetch(`/api/admin/blocked-terms?q=${encodeURIComponent(query)}`, {
      credentials: "same-origin",
    }).catch(() => null);
    if (res?.ok) setItems(((await res.json()) as { items: Term[] }).items);
    else setMessage("辞書を読み込めませんでした。");
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const ready = reason.trim().length > 0;
  async function run(action: () => Promise<Response>, done: (res: Response) => Promise<string>) {
    setMessage(null);
    const res = await action().catch(() => null);
    if (res?.ok) {
      setMessage(await done(res));
      await load(q);
    } else if (res?.status === 409) setMessage("その語はもう辞書にあります。");
    else setMessage("できませんでした。入力を確かめて、もう一度お試しください。");
  }

  return (
    <section className="space-y-6 text-sm">
      <label className="block space-y-1">
        <span className="font-semibold">この操作の理由</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="記録に残ります。個人の情報は書かないでください"
          className="w-full rounded-md border border-line bg-surface px-2 py-1"
        />
      </label>
      {message ? <p role="status">{message}</p> : null}

      <AddTerm
        disabled={!ready}
        onAdd={(term, match) =>
          run(
            () => postAdmin("/api/admin/blocked-terms", { term, match, reason }),
            async () => "語を足しました。",
          )
        }
      />
      <ImportTerms
        disabled={!ready}
        onImport={(text, source, match) =>
          run(
            () => postAdmin("/api/admin/blocked-terms/import", { text, source, match, reason }),
            async (res) => {
              const { added, skipped } = (await res.json()) as { added: number; skipped: number };
              return `${added} 語を足しました (${skipped} 語はもうありました)。`;
            },
          )
        }
      />

      <div className="space-y-2">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <input
            type="search"
            aria-label="辞書を探す"
            placeholder="辞書を探す"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64 max-w-full rounded-md border border-line bg-surface px-2 py-1"
          />
        </form>
        {items === null ? <p className="text-ink-muted">読み込んでいます…</p> : null}
        {items?.length === 0 ? <p className="text-ink-muted">辞書に語はありません。</p> : null}
        {items?.length ? (
          <table className="w-full text-left">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1">語</th>
                <th>照合</th>
                <th>辞書</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="py-1">{t.term}</td>
                  <td>{MATCH_LABEL[t.match]}</td>
                  <td>{t.source}</td>
                  <td>{t.enabled ? "使う" : "止めている"}</td>
                  <td className="space-x-2 text-right">
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() =>
                        void run(
                          () =>
                            sendAdmin("PATCH", `/api/admin/blocked-terms/${t.id}`, {
                              enabled: !t.enabled,
                              reason,
                            }),
                          async () => (t.enabled ? "止めました。" : "使うようにしました。"),
                        )
                      }
                      className="underline disabled:opacity-60"
                    >
                      {t.enabled ? "止める" : "使う"}
                    </button>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() =>
                        void run(
                          () => sendAdmin("DELETE", `/api/admin/blocked-terms/${t.id}`, { reason }),
                          async () => "消しました。",
                        )
                      }
                      className="underline disabled:opacity-60"
                    >
                      消す
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

function MatchSelect({
  value,
  onChange,
}: {
  value: "exact" | "contains";
  onChange: (v: "exact" | "contains") => void;
}) {
  return (
    <select
      aria-label="照合のしかた"
      value={value}
      onChange={(e) => onChange(e.target.value as "exact" | "contains")}
      className="rounded-md border border-line bg-surface px-2 py-1"
    >
      <option value="contains">{MATCH_LABEL.contains}</option>
      <option value="exact">{MATCH_LABEL.exact}</option>
    </select>
  );
}

function AddTerm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (term: string, match: "exact" | "contains") => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [match, setMatch] = useState<"exact" | "contains">("contains");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1">
        <span className="block font-semibold">足す語</span>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          maxLength={64}
          className="rounded-md border border-line bg-surface px-2 py-1"
        />
      </label>
      <MatchSelect value={match} onChange={setMatch} />
      <button
        type="button"
        disabled={disabled || !term.trim()}
        onClick={() => void onAdd(term, match).then(() => setTerm(""))}
        className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
      >
        語を足す
      </button>
    </div>
  );
}

function ImportTerms({
  disabled,
  onImport,
}: {
  disabled: boolean;
  onImport: (text: string, source: string, match: "exact" | "contains") => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [match, setMatch] = useState<"exact" | "contains">("contains");
  return (
    <details className="rounded-md border border-line-soft p-3">
      <summary className="cursor-pointer font-semibold">辞書をまとめて入れる</summary>
      <div className="mt-3 space-y-2">
        <label className="block space-y-1">
          <span>辞書 (1 行 1 語)</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="# で始まる行は読み飛ばします"
            className="w-full rounded-md border border-line bg-surface px-2 py-1"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block">辞書の名前</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={80}
              className="rounded-md border border-line bg-surface px-2 py-1"
            />
          </label>
          <MatchSelect value={match} onChange={setMatch} />
          <button
            type="button"
            disabled={disabled || !text.trim() || !source.trim()}
            onClick={() => void onImport(text, source, match).then(() => setText(""))}
            className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
          >
            辞書を入れる
          </button>
        </div>
      </div>
    </details>
  );
}
