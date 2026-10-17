export type PostStatus = "processing" | "published" | "failed" | "held" | "hidden";

/** マイページで、公開されていない投稿に付ける札。公開されたものは null */
export function statusLabel(status: PostStatus): string | null {
  switch (status) {
    case "processing":
      return "仕上げ中";
    case "failed":
      return "受け付けられませんでした";
    case "held":
      return "確認中";
    case "hidden":
      return "非表示";
    case "published":
      return null;
  }
}
