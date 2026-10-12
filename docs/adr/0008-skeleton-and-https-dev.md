# ADR-0008: 骨組みは accounts から写し、開発と E2E は https の scenote.lumorphia.test で回す

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-12 |
| Deciders | t1nyb0x    |

## Context

構成は Prismtone に準じる (ADR-0002)。同じ構成の新しいリポジトリとして、lumorphia/accounts が 2026-10-07 に骨組み (A1.0) を作り、本番まで出している。accounts の骨組みは Prismtone から写したうえで、Prismtone で後から直した落とし穴 (CI で DB テストが skip されて緑に見える、CSP の nonce、hydration 前のクリック) を最初から塞いでいる。

ログインは Lumorphia アカウントの OIDC (ADR-0005)。accounts に登録できるクライアントの redirect URI は https でループバック以外に限るので、Scenote も手元と E2E を https の `*.lumorphia.test` で動かす必要がある (accounts ADR-0002、prismtone ADR-0053)。

lumorphia/platform の ADR-0009 は「E2E の土台は Scenote の骨組みと一緒に切り出す」とした。

## Decision

### 骨組みは accounts の A1.0 を写す

- `apps/app` (React Router SSR + Fastify)、`packages/core`、`packages/db` (Drizzle、ファイルごとの専用 DB のテスト)、`e2e/`、`scripts/dev-certs.sh`、CI、husky、ESLint の依存の向き、release-please の設定を、accounts の A1.0 (`9e09c3f`) から写して名前を変える
- 写したあとで accounts が直した汎用の部分 (Caddy の IPv4 の bind、Playwright に証明書の公開鍵を信頼させる) も入れる
- CSP の `img-src` は自分、投稿画像の配信元、`data:` だけにする。accounts が連携アカウントのアイコンのために許していた `https:` 全体と OAuth の偽物は持ち込まない。現像の画面に要るもの (`wasm-unsafe-eval`、`blob:`、Worker) は editor ADR-0009 に従って現像の段で足す
- Docker のイメージ、本番の compose、イメージの公開は本番の段で足す。main への push では release-please だけを回す

### 手元のポート

Prismtone・accounts と同時に動かせるよう、ずらす。

| 用途                | Prismtone | accounts | Scenote  |
| ------------------- | --------- | -------- | -------- |
| 開発の Postgres     | 5433      | 5434     | **5435** |
| 開発サーバー (http) | 3000      | 3100     | **3200** |
| 開発の https        | 8444      | 8443     | **8445** |
| E2E (Fastify https) | 3300      | 3443     | **3445** |

### https

- 開発は Vite が http (127.0.0.1:3200)、compose の Caddy が `https://scenote.lumorphia.test:8445` で受ける。Vite 8 の https は HTTP/2 になり、`@mcansh/react-router-fastify` が疑似ヘッダーで落ちるため (accounts と同じ)
- E2E は本番と同じビルドで Fastify が直接 https を受ける。Chromium は `--host-resolver-rules` で `*.lumorphia.test` を 127.0.0.1 に向け、証明書の公開鍵を `--ignore-certificate-errors-spki-list` で信頼する
- 証明書は手元専用の CA (`pnpm dev:certs`、`.data/tls/`、git に入れない)

### E2E の土台の切り出しはログインの段に回す

骨組みの時点で Scenote と accounts が共有する E2E の部品は、CSP の違反を見張る fixture、hydration を待つ helper、証明書のスクリプトの 3 つで、どれも数十行しかない。切り出す価値が大きいのは、Prismtone の `e2e/mock-lumorphia.ts` (偽の発行元) と E2E 専用の CA (`e2e/tls.ts`) で、これを Scenote が使うのはログインの段 (A3) になる。3 つ目の使い手として形を決められるのはそのときなので、切り出しはログインの段で行う。platform ADR-0009 の時期をずらすことになるので、そのときに platform 側に追記する。

## Consequences

### 良い点

- accounts で本番まで通った形から始められる。DB テストが CI で skip されない、CSP の違反を E2E が全テストで見張る、といった仕組みが最初からある
- 3 つのサービスを同時に手元で動かせる

### 悪い点・受け入れるリスク

- 骨組みのファイルは accounts と重なる。共通の設定は platform の手本 (platform ADR-0009) に従い、E2E の土台はログインの段で切り出す
- ポートの表は 3 つのリポジトリに散らばる。4 つ目 (Facetia) を足すときは、この表を写して次の番号を使う

### 追従して必要になること

- ログインの段で、E2E の土台 (偽の発行元、E2E 専用の CA、CSP の fixture) を platform に切り出し、platform ADR-0009 に追記する
- 本番の段で、Docker のイメージ、compose、runbook、イメージの公開を足す

## Alternatives

- Prismtone から直接写す: Prismtone は M3 までの機能と装備まわりが混ざっていて、骨組みだけを取り出す手間が大きい。accounts の A1.0 はその作業を済ませた形
- 骨組みと一緒に E2E の土台を切り出す (platform ADR-0009 のとおり): 今の時点で共有するのは小さな部品だけで、本当に共通にしたい偽の発行元を Scenote はまだ使わない。使わないものの形を先に決めることになる

## References

- ADR-0002、ADR-0005、ADR-0007
- lumorphia/accounts ADR-0002、`AGENTS.md`
- lumorphia/prismtone ADR-0053
- lumorphia/platform ADR-0009
- lumorphia/editor ADR-0009
