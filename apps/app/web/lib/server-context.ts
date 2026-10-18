import type { PostPage } from "../features/post-list/PostFeed.tsx";
import type { MapRegion } from "../features/journal/maps.ts";
import { createContext } from "react-router";

/** 投稿の OGP に使うもの。サーバーが domain/share.ts から作り、画像の URL は絶対にしてある */
export type PostShareMeta = {
  title: string;
  description: string | null;
  image: string;
  author: { handle: string; name: string };
  visibility: "public" | "unlisted";
};

/** SSR の loader が使う、サーバーの中の読み出し (ADR-0018)。loader から自分の API を HTTP で呼ばない */
export type ServerReads = {
  /** サイトの公開 origin (og:url) */
  siteUrl: string;
  journalHome(): Promise<{ page: PostPage; regions: MapRegion[] }>;
  /** 共有できない投稿は null */
  postShare(postId: string): Promise<PostShareMeta | null>;
};

/**
 * load context のキー。サーバー (Fastify) と、ビルドされた React Router のアプリは、このモジュールを別々に読み込む。
 * キーは同じオブジェクトでないと値を取り出せないので、globalThis に 1 つだけ置く
 */
const KEY = Symbol.for("lumorphia-scenote.server-reads");
const holder = globalThis as { [KEY]?: ReturnType<typeof createContext<ServerReads | null>> };
export const serverReadsContext = (holder[KEY] ??= createContext<ServerReads | null>(null));
