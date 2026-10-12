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
packages/core   ドメイン (今は DomainError だけ。投稿の段から足す)
packages/db     Drizzle のスキーマとマイグレーション、ファイルごとの専用 DB を作るテストの仕組み
e2e/            Playwright。https の scenote.lumorphia.test で回す
docker/         開発の Caddy (Caddyfile.dev)
scripts/        dev-certs.sh (開発と E2E の TLS)
```

共通の基盤は lumorphia/platform のパッケージ (`@lumorphia/ops` など) を版を固定して使う。

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
pnpm db:generate && pnpm db:migrate         # スキーマ変更後
pnpm test                                   # 単体・DB テスト
pnpm e2e                                    # Playwright (https)
pnpm dev:certs                              # 開発と E2E の TLS を作る (あれば作り直さない)
```

DB テストを手元で回すとき: `DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-) pnpm test`

`@lumorphia/*` は GitHub Packages にある。手元では一度だけ `pnpm config set //npm.pkg.github.com/:_authToken "$(gh auth token)"` (`.npmrc` のコメント)。
