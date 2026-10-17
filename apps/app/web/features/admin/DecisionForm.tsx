import { useId, useState } from "react";

export type Decision = {
  label: string;
  /** 主の操作は塗りつぶしのボタン */
  primary?: boolean;
  /** API を呼ぶ。返した Response が ok なら onDone */
  run: (reason: string) => Promise<Response | null>;
};

/**
 * 理由を書いて決める (ADR-0019)。理由は必須で、記録に残る。
 * 409 はほかの操作で先に片付いたものとして、一覧から外す
 */
export function DecisionForm({
  decisions,
  onDone,
}: {
  decisions: readonly Decision[];
  onDone: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setBusy(true);
    setMessage(null);
    const res = await decision.run(reason).catch(() => null);
    setBusy(false);
    if (res?.ok) onDone();
    else if (res?.status === 409) {
      setMessage("ほかの操作で、もう片付いていました。");
      onDone();
    } else setMessage("決められませんでした。もう一度お試しください。");
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-semibold">
        理由
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="記録に残ります。個人の情報は書かないでください"
        className="w-full rounded-md border border-line bg-surface px-2 py-1"
      />
      <div className="flex flex-wrap gap-2">
        {decisions.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => void decide(d)}
            disabled={busy || !reason.trim()}
            className={
              d.primary
                ? "rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
                : "rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-60"
            }
          >
            {d.label}
          </button>
        ))}
      </div>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** 管理の API に JSON を送る */
export function postAdmin(url: string, body: object): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
}
