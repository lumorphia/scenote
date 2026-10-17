# AGENTS.md

lumorphia/scenote: FINAL FANTASY XIV で撮った風景・日常・旅・記念撮影のスクリーンショットを、ブラウザで現像して記録・共有する Lumorphia のサービス。現像は lumorphia/editor、ログインは Lumorphia アカウント (lumorphia/accounts) を使う。
**このリポジトリは public** (ADR-0007)。弱点の扱いは [SECURITY.md](SECURITY.md) に従い、Issue や公開の PR に書かない。

## 着手前に読むもの

| 目的                     | 文書                                                      |
| ------------------------ | --------------------------------------------------------- |
| 何を作るか               | [docs/scenote\_要件定義書.md](docs/scenote_要件定義書.md) |
| 段階 (S1〜S7) と進み具合 | [docs/plan.md](docs/plan.md)                              |
| なぜそう決めたか         | [docs/adr/](docs/adr/)                                    |

骨組みは lumorphia/accounts の A1.0 から写している (ADR-0008)。投稿・タグ・検索・一覧・通報は lumorphia/prismtone から写して始める (ADR-0006)。本文やコメントの `lumorphia/prismtone#N`・`prismtone ADR-NNNN` は prismtone のもの。

## 構成

```
apps/app        React Router (SSR) + Fastify。画面と API
packages/core   ドメイン (ログイン、退会の知らせ、受け取りと投稿) と pg-boss のジョブ (jobs/)
packages/db     Drizzle のスキーマとマイグレーション、ファイルごとの専用 DB を作るテストの仕組み
e2e/            Playwright。https の scenote.lumorphia.test で回す
docker/         開発の Caddy (Caddyfile.dev)
scripts/        dev-certs.sh (開発と E2E の TLS)
```

共通の基盤は lumorphia/platform のパッケージ (`@lumorphia/ops` など) を版を固定して使う。

現像は lumorphia/editor のパッケージ (`@lumorphia/editor-*`) を版を固定して使う。Scenote 側のつなぎは `apps/app/web/features/editor-host/` (ホストの組み立て) と `web/routes/edit.tsx`。ホストに求められること (`/edit` だけ COOP / COEP、CSP の `'wasm-unsafe-eval'` と `worker-src`、`/models/` の配信、Tailwind の `@source`、Vite の `optimizeDeps`) は lumorphia/editor の ADR-0009 に従う。現像そのものを直すのは lumorphia/editor で、公開されたら版を上げる。下書きの IndexedDB の名前 (`scenote-editor`) は変えない

## ログイン (ADR-0009)

ログインは Lumorphia アカウントだけ。`@lumorphia/auth-client` を Better Auth の `genericOAuth` に渡す。handle・表示名・アイコンは Lumorphia の写しで、ログインのたびに書き換える。`LUMORPHIA_*` が揃っていないとログインは出ない (`.env.example`、`docs/runbook/lumorphia-client.md`)。

- `/login` は `/api/lumorphia/login` へ、そこが accounts の認可へ 302 で送る。SSR の loader から自分の API を呼ばない (E2E は Fastify が https で受けるので)。サーバーの中のものが要る loader は、load context の `serverReadsContext` (`web/lib/server-context.ts`、`server/load-context.ts`) から読む (ADR-0018)
- E2E の発行元は `@lumorphia/e2e` の偽物 (3454・3455)。`approveLumorphia(page, user, LUMORPHIA)` で、次のログインで承認する利用者を決める (`e2e/login.spec.ts`)
- サーバーのテストも同じ偽物をテストの中で起こす (`server/routes/lumorphia.db.test.ts`、CA は `server/test/lumorphia-tls-setup.ts`)

## 投稿の画像 (ADR-0011)

ブラウザは署名付き PUT で一時置き場 (`tmp/`) に置き、worker の `image-process` が `@lumorphia/media` で派生画像 (display・thumb) を作って公開する。原本は持たない (ADR-0003)。

- 開発とテストの置き場所は手元のファイル (`.data/storage`)、アプリ自身が `/_storage` で受け取って配る (`server/storage-config.ts`、`plugins/dev-storage.ts`)。E2E はメモリ
- 開発と E2E はジョブをアプリの中で走らせる (`JOBS_INLINE`、既定で有効)。本番は `pnpm --filter @lumorphia-scenote/app worker`
- 現像の「Scenoteへ投稿」は、書き出した画像とレシピを IndexedDB (`scenote-editor` の `pending-post`) に置いて `/post/new` に進む。ログインに出ても残る (`web/features/post-form/`)。投稿のあとは `/posts/:id` (自分の投稿) で仕上がりを待つ
- 派生画像を作ったら `@lumorphia/moderation/image` で判定し、保留 (`held`) した投稿は本人にだけ見せ、画像は `private/` に置く (ADR-0014)。判定器は `IMAGE_MODERATION` (開発 `off`、E2E とサーバーのテスト `fake`、本番 `onnx`)。テストのスコアはパッケージの既定のしきい値から作り、数字を書かない
- タイトル・本文・タグ・自由入力の撮影場所は NG 語と照合する (`domain/blocked-text.ts`、ADR-0015)。投稿画面は画像を送る前に `POST /api/posts/check-text` で確かめる。断るときは欄だけを `error.issues` で返し、語は返さない。テストの語は `BLOCKED_TERMS` から取る
- テストの画像はテストの中で sharp で作る。EXIF や拡張チャンクが落ちることは `packages/core/src/jobs/image-process.db.test.ts` で確かめる

## 管理画面 (ADR-0019)

`/admin` と `/api/admin/*` は `requireAdmin` を通す。env の `ADMIN_SUBS` (Lumorphia の sub) にいて退会中でない人だけで、それ以外は 404。操作は同じトランザクションで `recordAdminAction` (`domain/admin.ts`) に記録し、理由は必須、利用者は sub か投稿の ID だけで指す。E2E の運営者は `e2e/lumorphia.ts` の `E2E_ADMIN_SUB`

## 依存の方向 (ESLint が強制する)

```
apps/app/web   ->  API だけ。core・db・server・fastify を import しない。@lumorphia/ops は /sentry だけ
apps/app/server -> core、db、@lumorphia/*
packages/*     ->  fastify・react-router・apps/* を import しない
```

## https (ADR-0008)

Lumorphia アカウントのクライアントは https かつループバック以外の redirect URI しか登録できない。手元も `*.lumorphia.test` と TLS で動かす。ポートは Prismtone・accounts とずらしている (ADR-0008 の表)。

- 証明書は `pnpm dev:certs` (`scripts/dev-certs.sh`) が `.data/tls/` に作る手元専用の CA と `*.lumorphia.test` の証明書。git に入れない
- **開発**: Vite の開発サーバーは http (127.0.0.1:3200)。compose の Caddy が `https://scenote.lumorphia.test:8445` で受けて流す。Vite 8 は https にすると必ず HTTP/2 になり、その疑似ヘッダー (`:method`) を `@mcansh/react-router-fastify` が扱えないため、Vite には https を持たせない。ブラウザで開くには hosts に `127.0.0.1 scenote.lumorphia.test` を足し、`.data/tls/ca.pem` を信頼させる
- 開発サーバーは `packages/*` の変更や、表の追加 (マイグレーション) を取り込み損ねることがある (Better Auth の `SCHEMA_MISMATCH` や、古い関数のまま動く)。そのときは開発サーバーを立て直す
- **E2E**: Fastify が直接 https で待ち受ける (`DEV_TLS_*`、`server/tls.ts`)。本番と同じビルドで、HTTP/1.1
- **本番**: Caddy が TLS を受ける (本番の段で作る)。`DEV_TLS_*` は production では無視する

## 作業の流れ

1. `develop` から `feat/<段階>-<topic>` (例: `feat/s3-editor`) を切る。`develop` と `main` に直接コミットしない
2. **TDD で進める**。実装より先に、失敗するテストを書く (red) → 通す最小の実装 (green) → 整える (refactor)。新しいテストは、実装前に一度落ちるのを確かめてから通す
3. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` を通す。画面を触ったら `pnpm e2e` も
4. `develop` 向けに PR を作り、**CI が緑になってからマージする**。`develop` へは「Rebase and merge」、`develop` → `main` だけマージコミット
5. 弱点の修正は公開の PR にしない (SECURITY.md)

コミットは `feat:` `fix:` `docs:` `test:` `refactor:` `build:` `ci:` の Conventional Commits、本文は日本語。

## テストの書き方

- **1 つの `it` に 1 つの振る舞い**。名前は英語で「何をすると何になる」を言い切る
- **カバレッジは手がかりで、目標ではない**。閾値 (lines / functions / statements 80%、branches 70%) は下限
- DB を使うものは `*.db.test.ts`。**ファイルごとに専用のデータベース**で走る (`packages/db/src/vitest-setup.ts`)。手元で `DATABASE_URL` が無ければ skip、**CI (`CI=true`) で無ければ失敗**する (`require-database.ts`。prismtone で skip が緑に見えた落とし穴を塞ぐ)
- E2E は `e2e/test.ts` の `test` / `expect` を使う。CSP の違反を全テストで見張る
- E2E の `*.lumorphia.test` は Chromium の起動オプションで 127.0.0.1 に向けている。**ブラウザを通さない `request` フィクスチャには効かない**ので、API はページから叩く (`e2e/helpers.ts`)
- Playwright は globalSetup より先に webServer を立ち上げる。E2E の DB は webServer のコマンドの先頭 (`e2e/prepare-db.ts`) で用意する

## コードの約束

- TypeScript strict、`import type` を使う、`.ts` 拡張子付きで import する
- コメント・ドキュメント・コミットは日本語。絵文字は使わない
- 配列やオブジェクトは変更せず新しく作る
- ログやテストにシークレットを書かない。`.env` はコミットしない。テストの擬似の値は `test-` などで始める (`.gitleaks.toml`)
- 運営者以外の人のデータを入れない。テストの画像はテストの中で作る (ADR-0006、ADR-0007)
- 知られると回避されるもの (モデレーションのしきい値、NG 語) をこのリポジトリに書かない (ADR-0007)
- 設計上の判断を変えるときは ADR を追加する (`docs/adr/`)
- 生成物 (`packages/db/drizzle/`) は手で編集しない (最初の `0000_init.sql` は drizzle-kit の custom で作った)

## よく使うコマンド

```sh
docker compose up -d                        # 開発の Postgres (5435) と Caddy (8445)
pnpm --filter @lumorphia-scenote/app dev    # 開発サーバー (Caddy の後ろ、https://scenote.lumorphia.test:8445)
pnpm --filter @lumorphia-scenote/app worker # ジョブの worker (開発は JOBS_INLINE=0 のときだけ要る)
pnpm --filter @lumorphia-scenote/app places:sync # 撮影場所の候補を XIVAPI から入れる (開発の最初と本番の最初。ADR-0013)
pnpm db:generate && pnpm db:migrate         # スキーマ変更後
pnpm test                                   # 単体・DB テスト
pnpm e2e                                    # Playwright (https)
pnpm dev:certs                              # 開発と E2E の TLS を作る (あれば作り直さない)
pnpm --filter @lumorphia-scenote/app models # 認識のモデルと WASM を apps/app/models に揃える (dev / build の前に走る)
```

DB テストを手元で回すとき: `DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-) pnpm test`

`@lumorphia/*` は GitHub Packages にある。手元では一度だけ `pnpm config set //npm.pkg.github.com/:_authToken "$(gh auth token)"` (`.npmrc` のコメント)。
