import { blockedFieldMessage, blockedFieldOf, type BlockedField } from "./blocked.ts";

/**
 * 投稿の送信 (ADR-0011)。書いた語を確かめ (ADR-0015)、受け取りの枠をもらい、画像を署名付き URL に PUT し、投稿を作る。
 * 語を先に確かめるのは、NG 語で断られたときに受け取りの枠を無駄にしないため
 */
export type SubmitInput = {
  image: Blob;
  title: string;
  body: string;
  /** YYYY-MM-DD。空なら撮影日なし */
  takenOn: string;
  recipe: unknown;
  visibility: "public" | "unlisted" | "private";
  tags: readonly string[];
  placeId: string | null;
  placeText: string;
};

export class SubmitError extends Error {
  readonly step: "check" | "upload" | "put" | "post";
  readonly status: number;
  /** NG 語に当たった欄 */
  readonly blocked: BlockedField | null;
  constructor(step: SubmitError["step"], status: number, blocked: BlockedField | null = null) {
    super(`${step} failed: ${status}`);
    this.name = "SubmitError";
    this.step = step;
    this.status = status;
    this.blocked = blocked;
  }
}

type Grant = {
  uploadId: string;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
};

export async function submitPost(
  input: SubmitInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const json = { "content-type": "application/json" };
  const checked = await fetchImpl("/api/posts/check-text", {
    method: "POST",
    headers: json,
    credentials: "same-origin",
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      tags: input.tags,
      placeText: input.placeText.trim(),
    }),
  });
  if (!checked.ok) throw new SubmitError("check", checked.status);
  const { blocked } = (await checked.json()) as { blocked: BlockedField | null };
  if (blocked) throw new SubmitError("check", 400, blocked);

  const granted = await fetchImpl("/api/uploads", {
    method: "POST",
    headers: json,
    credentials: "same-origin",
    body: JSON.stringify({ mime: input.image.type, bytes: input.image.size }),
  });
  if (!granted.ok) throw new SubmitError("upload", granted.status);
  const grant = (await granted.json()) as Grant;

  const put = await fetchImpl(grant.upload.url, {
    method: "PUT",
    headers: grant.upload.headers,
    body: input.image,
  });
  if (!put.ok) throw new SubmitError("put", put.status);

  const created = await fetchImpl("/api/posts", {
    method: "POST",
    headers: json,
    credentials: "same-origin",
    body: JSON.stringify({
      uploadId: grant.uploadId,
      title: input.title.trim() || null,
      body: input.body.trim() || null,
      takenOn: input.takenOn || null,
      recipe: input.recipe,
      visibility: input.visibility,
      tags: input.tags,
      placeId: input.placeId,
      placeText: input.placeText.trim() || null,
    }),
  });
  if (!created.ok)
    throw new SubmitError(
      "post",
      created.status,
      blockedFieldOf(await created.json().catch(() => null)),
    );
  return ((await created.json()) as { postId: string }).postId;
}

/** 送れなかったときの文言 */
export function submitErrorMessage(error: unknown): string {
  if (error instanceof SubmitError) {
    if (error.blocked) return blockedFieldMessage(error.blocked);
    if (error.status === 401)
      return "ログインが切れました。ログインしてから、もう一度投稿してください。";
    if (error.status === 429)
      return "投稿の準備中のものが多すぎます。少し時間をおいてから、もう一度お試しください。";
    if (error.status === 400)
      return "投稿できませんでした。画像の形式や大きさ、入力した内容を確かめてください。";
  }
  return "投稿できませんでした。通信を確かめて、もう一度お試しください。";
}
