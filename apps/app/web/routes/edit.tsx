import type { Route } from "./+types/edit";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { Editor } from "@lumorphia/editor-react";
import { scenoteEditorHost } from "../features/editor-host/scenote-host.ts";

export function meta(_: Route.MetaArgs) {
  return [{ title: "現像 - Scenote" }, { name: "robots", content: "noindex" }];
}

// 描画 (PixiJS) を SSR に巻き込まないため clientLoader だけにする (lumorphia/prismtone と同じ)
export async function clientLoader() {
  return null;
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <p className="p-4 text-sm text-ink-muted">現像の画面を読み込んでいます…</p>;
}

export default function Edit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDraftId = searchParams.get("draft");
  const host = useMemo(
    () =>
      scenoteEditorHost({
        initialDraftId,
        // リロードで同じ下書きを開き直さないよう ?draft= を外す
        onInitialDraftConsumed: () =>
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.delete("draft");
              return next;
            },
            { replace: true },
          ),
      }),
    [initialDraftId, setSearchParams],
  );
  return (
    <main className="mx-auto max-w-7xl space-y-3 p-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">写真を現像する</h1>
        <p className="text-sm text-ink-muted">
          画像はこの端末の中だけで現像します。現像した写真は「端末に保存」から保存できます。
        </p>
      </div>
      <Editor host={host} />
    </main>
  );
}
