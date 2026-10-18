import { useRef } from "react";

/** 写真の縦横比を保ち、キーボードでも閉じられる拡大表示。 */
export function PhotoViewer({
  src,
  width,
  height,
  alt,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="journal-expand-photo"
        aria-label="写真を拡大する"
        onClick={() => dialog.current?.showModal()}
      >
        <img src={src} width={width} height={height} alt={alt} data-testid="post-image" />
        <span>写真を拡大 ↗</span>
      </button>
      <dialog
        ref={dialog}
        className="journal-photo-dialog"
        aria-label="拡大した写真"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button type="button" aria-label="拡大写真を閉じる" onClick={() => dialog.current?.close()}>
          ×
        </button>
        <img src={src} width={width} height={height} alt={alt} />
      </dialog>
    </>
  );
}
