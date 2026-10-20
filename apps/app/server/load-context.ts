import { RouterContextProvider } from "react-router";
import type { FastifyInstance } from "fastify";
import { listPublicPosts, type ListInput } from "@lumorphia-scenote/core/domain/browse";
import { listPlaces } from "@lumorphia-scenote/core/domain/places";
import { getPostShare } from "@lumorphia-scenote/core/domain/share";
import { serverReadsContext, type ServerReads } from "../web/lib/server-context.ts";

/** 画像の URL を絶対にする。開発は画像をアプリが /_storage で配るので、パスで届く */
export function absoluteUrl(url: string, siteUrl: string): string {
  return url.startsWith("/") ? `${siteUrl.replace(/\/$/, "")}${url}` : url;
}

/** SSR の loader に、サーバーの中の読み出しを渡す (ADR-0018)。React Router の getLoadContext から呼ぶ */
export function createLoadContext(app: FastifyInstance): RouterContextProvider {
  const siteUrl = app.env.AUTH_BASE_URL.replace(/\/$/, "");
  /** 公開の投稿の最初のページと、撮影場所の候補 (トップと検索のページ) */
  const firstPageAndPlaces = async (filter: ListInput) => {
    const [page, regions] = await Promise.all([
      listPublicPosts({ db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL }, filter),
      listPlaces(app.db),
    ]);
    return {
      page: {
        ...page,
        items: page.items.map((p) => ({ ...p, publishedAt: p.publishedAt.toISOString() })),
      },
      regions,
    };
  };
  const reads: ServerReads = {
    siteUrl,
    journalHome: () => firstPageAndPlaces({}),
    search: ({ q, tags, placeId }) => firstPageAndPlaces({ q, tag: tags, placeId }),
    async postShare(postId) {
      const share = await getPostShare(
        { db: app.db, imageBaseUrl: app.env.PUBLIC_IMAGE_BASE_URL },
        postId,
      );
      return share ? { ...share, image: absoluteUrl(share.image, siteUrl) } : null;
    },
  };
  return new RouterContextProvider(new Map([[serverReadsContext, reads]]));
}
