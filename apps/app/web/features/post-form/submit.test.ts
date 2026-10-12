import { describe, expect, it } from "vitest";
import { submitPost, submitErrorMessage, SubmitError } from "./submit.ts";

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

/** 受け取りの枠・PUT・投稿の 3 つに答える偽の fetch */
function fakeFetch(answers: Partial<Record<"uploads" | "put" | "posts", Response>> = {}) {
  const calls: Call[] = [];
  const impl = async (input: string, init: RequestInit = {}) => {
    const call = {
      url: input,
      method: init.method ?? "GET",
      body: init.body,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    if (input === "/api/uploads")
      return (
        answers.uploads ??
        Response.json(
          {
            uploadId: "test-upload",
            upload: {
              url: "/_storage/tmp/test-upload",
              method: "PUT",
              headers: { "content-type": "image/webp" },
            },
          },
          { status: 201 },
        )
      );
    if (input === "/_storage/tmp/test-upload")
      return answers.put ?? new Response(null, { status: 200 });
    if (input === "/api/posts")
      return answers.posts ?? Response.json({ postId: "test-post" }, { status: 201 });
    return new Response(null, { status: 404 });
  };
  return { calls, impl: impl as typeof fetch };
}

const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
const fields = { title: "テスト_題", body: "", takenOn: "2026-09-30", recipe: { version: 4 } };

describe("submitPost", () => {
  it("asks for a place, puts the image there, then posts it", async () => {
    const { calls, impl } = fakeFetch();
    expect(await submitPost({ image, ...fields }, impl)).toBe("test-post");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/uploads",
      "PUT /_storage/tmp/test-upload",
      "POST /api/posts",
    ]);
  });

  it("declares the image's type and size", async () => {
    const { calls, impl } = fakeFetch();
    await submitPost({ image, ...fields }, impl);
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ mime: "image/webp", bytes: 3 });
  });

  it("puts the image with the headers it was given", async () => {
    const { calls, impl } = fakeFetch();
    await submitPost({ image, ...fields }, impl);
    expect(calls[1]!.headers).toEqual({ "content-type": "image/webp" });
    expect(calls[1]!.body).toBe(image);
  });

  it("sends what the user wrote with the upload", async () => {
    const { calls, impl } = fakeFetch();
    await submitPost({ image, ...fields }, impl);
    expect(JSON.parse(calls[2]!.body as string)).toEqual({
      uploadId: "test-upload",
      title: "テスト_題",
      body: null,
      takenOn: "2026-09-30",
      recipe: { version: 4 },
    });
  });

  it("stops when the server will not take the image", async () => {
    const { calls, impl } = fakeFetch({
      uploads: Response.json({ error: { code: "validation", message: "x" } }, { status: 400 }),
    });
    await expect(submitPost({ image, ...fields }, impl)).rejects.toMatchObject({
      step: "upload",
      status: 400,
    });
    expect(calls).toHaveLength(1);
  });

  it("stops when the image could not be put", async () => {
    const { impl } = fakeFetch({ put: new Response(null, { status: 500 }) });
    await expect(submitPost({ image, ...fields }, impl)).rejects.toMatchObject({ step: "put" });
  });
});

describe("submitErrorMessage", () => {
  it("asks the user to log in again when the session has ended", () => {
    expect(submitErrorMessage(new SubmitError("upload", 401))).toMatch(/ログイン/);
  });

  it("says when too many posts are waiting", () => {
    expect(submitErrorMessage(new SubmitError("upload", 429))).toMatch(/時間をおいて/);
  });

  it("explains a refused image or field", () => {
    expect(submitErrorMessage(new SubmitError("post", 400))).toMatch(/投稿できませんでした/);
  });

  it("falls back to a general message", () => {
    expect(submitErrorMessage(new Error("network"))).toMatch(/もう一度/);
  });
});
