# syntax=docker/dockerfile:1.27
# base -> deps -> build -> app。web と worker は同じイメージで、compose の command だけが違う (lumorphia/accounts と同じ。ADR-0024)

# APP_VERSION: CI が `<package.json の version>+<git sha 7 桁>` を渡す。Sentry とページの meta に出る
ARG APP_VERSION=dev

FROM node:24.21.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# pnpm-workspace.yaml の allowBuilds で onnxruntime-node の postinstall (CUDA のバイナリを取りに行く) を止めている
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/app/package.json apps/app/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
# @lumorphia/* は GitHub Packages にある。トークンは BuildKit の secret (npm_token) だけで渡し、イメージの層に残さない。
# pnpm 12 はリポジトリの .npmrc の認証で環境変数を展開しないので、pnpm_config_ で渡す
RUN --mount=type=cache,id=scenote-pnpm,target=/pnpm/store \
    --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    env "pnpm_config_//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" pnpm install --frozen-lockfile

FROM deps AS build
ARG APP_VERSION
COPY . .
# build は現像のモデルと WASM を apps/app/models に揃えてから (pnpm models)、React Router をビルドする。
# 規約の本文 (docs/legal) はビルドが ?raw で取り込み、サーバーも起動のときに読む (ADR-0023)
RUN APP_VERSION="$APP_VERSION" NODE_OPTIONS=--dns-result-order=ipv4first \
    pnpm --filter @lumorphia-scenote/app build
# 本番用に devDependencies を落とす。install --prod は既にある node_modules から dev を消さないので、消してから入れ直す
RUN --mount=type=cache,id=scenote-pnpm,target=/pnpm/store \
    --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    rm -rf node_modules apps/*/node_modules packages/*/node_modules \
    && env "pnpm_config_//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" pnpm install --frozen-lockfile --prod --ignore-scripts
# 画像の判定のモデルを同梱する。実行のときに HF Hub へ行かない (ADR-0014)。取り込むスクリプトは @lumorphia/moderation のもの
RUN MODERATION_MODEL_DIR=/repo/moderation-models \
    node packages/core/node_modules/@lumorphia/moderation/scripts/fetch-models.mjs
# onnxruntime-node は全 OS のバイナリを持っている。linux/x64 の CPU 用だけ残す。
# transformers.js の node 向けは onnxruntime-node だけを使うので、ブラウザ用の onnxruntime-web も消す (現像はブラウザが models/ から読む)
RUN ORT=$(echo /repo/node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v3) \
    && find "$ORT" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + \
    && find "$ORT/linux" -mindepth 1 -maxdepth 1 ! -name x64 -exec rm -rf {} + \
    && rm -f "$ORT"/linux/x64/libonnxruntime_providers_cuda.so "$ORT"/linux/x64/libonnxruntime_providers_tensorrt.so \
    && rm -rf /repo/node_modules/.pnpm/onnxruntime-web@*
# devDependencies を落とした状態で、web・worker・migrate の import が解け、規約の版が読め、共有用の画像が作れること。
# 本物の判定器も一度読み込む (onnxruntime-node のバイナリを消しすぎていないか)
RUN NODE_ENV=production MODERATION_MODEL_DIR=/repo/moderation-models node --input-type=module -e "\
  await import('/repo/apps/app/server/app.ts'); \
  await import('/repo/apps/app/server/worker.ts'); \
  await import('/repo/packages/db/src/migrator.ts'); \
  const { readLegalVersions } = await import('/repo/apps/app/server/legal.ts'); \
  console.log('legal', JSON.stringify(readLegalVersions())); \
  const { makeOgpImage } = await import('/repo/packages/core/src/ogp-image.ts'); \
  const display = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR4nGNw6VhFEmIY1TAoNAAABqTSYVqeU7oAAAAASUVORK5CYII=', 'base64'); \
  if ((await makeOgpImage(display)).byteLength < 1000) throw new Error('ogp smoke failed'); \
  const { createImageModerator, moderationConfigFromEnv } = await import('/repo/packages/core/node_modules/@lumorphia/moderation/dist/image/index.js'); \
  const moderator = await createImageModerator(moderationConfigFromEnv({ IMAGE_MODERATION: 'onnx', MODERATION_MODEL_DIR: '/repo/moderation-models' })); \
  const judged = await moderator.classify(display); \
  if (typeof judged.score !== 'number') throw new Error('moderation smoke failed'); \
  console.log('imports ok, ogp ok, moderation ok')"

FROM base AS app
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production
ENV MODERATION_MODEL_DIR=/repo/moderation-models
COPY --from=build /repo /repo
USER node
WORKDIR /repo/apps/app
EXPOSE 3200
CMD ["node", "--import", "./server/sentry.ts", "./server/index.ts"]
