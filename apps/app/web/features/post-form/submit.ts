/** 投稿の送信 (ADR-0011)。受け取りの枠をもらい、画像を署名付き URL に PUT し、投稿を作る */
export type SubmitInput = {
  image: Blob;
  title: string;
  body: string;
  /** YYYY-MM-DD。空なら撮影日なし */
  takenOn: string;
  recipe: unknown;
  visibility: "public" | "unlisted" | "private";
};

export class SubmitError extends Error {
  readonly step: "upload" | "put" | "post";
  readonly status: number;
  constructor(step: SubmitError["step"], status: number) {
    super(`${step} failed: ${status}`);
    this.name = "SubmitError";
    this.step = step;
    this.status = status;
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
    }),
  });
  if (!created.ok) throw new SubmitError("post", created.status);
  return ((await created.json()) as { postId: string }).postId;
}

/** 送れなかったときの文言 */
export function submitErrorMessage(error: unknown): string {
  if (error instanceof SubmitError) {
    if (error.status === 401)
      return "ログインが切れました。ログインしてから、もう一度投稿してください。";
    if (error.status === 429)
      return "投稿の準備中のものが多すぎます。少し時間をおいてから、もう一度お試しください。";
    if (error.status === 400)
      return "投稿できませんでした。画像の形式や大きさ、入力した内容を確かめてください。";
  }
  return "投稿できませんでした。通信を確かめて、もう一度お試しください。";
}
