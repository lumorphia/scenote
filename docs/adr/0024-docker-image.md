# ADR-0024: 本番のイメージは 1 つで、モデルと規約を含め、ビルドの中で動くことを確かめる

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-18 |
| Deciders | t1nyb0x    |

## Context

S7e で本番に出す。Scenote は web (React Router + Fastify) と worker (派生画像・判定・掃除・地名の同期) と migrate を動かす。web は現像のモデルと WASM (`apps/app/models`) を配り、規約の本文 (`docs/legal`) をビルドで取り込み、サーバーも起動のときに読む (ADR-0023)。worker は本物の画像の判定器 (`onnx`、モデル 230 MB 前後) を使い、本番では `onnx` 以外で起動しない (ADR-0014)。

lumorphia/accounts は 1 つのイメージで web と worker を動かし、compose の command だけを変えている。lumorphia/prismtone はモデルを同梱し、onnxruntime-node のほかの OS のバイナリを消し、devDependencies を落とした状態で import が解けることをビルドの中で確かめている。

2026-10-18、S7 で足したマイグレーションを相棒の開発の DB に当て忘れ、ログインした人の操作が落ちた。テストと E2E はそれぞれの DB に当てるので気づけなかった。

## Decision

- `docker/Dockerfile` は base → deps → build → app。イメージは 1 つで、web は既定の CMD、worker と migrate は compose の command で動かす (S7e-2)
- build で現像のモデルを取り直し (`pnpm models`)、画像の判定のモデルを `/repo/moderation-models` に取り込む (`@lumorphia/moderation` のスクリプト)。実行のときは外へ取りに行かない
- devDependencies を落とし、onnxruntime-node は linux/x64 の CPU 用だけ、onnxruntime-web は消す
- ビルドの最後に、devDependencies の無い状態で web・worker・migrate の import、規約の版の読み取り、共有用の画像、本物の判定器での判定を 1 回ずつ確かめる。どれかが落ちればイメージはできない
- `@lumorphia/*` のトークンは BuildKit の secret (`npm_token`) だけで渡す
- `.dockerignore` で `docs` を外し、`docs/legal` だけ戻す。開発のデータ (`.data`)、手元の現像のモデル、テストは入れない
- 動く人は `node` (root でない)
- CI は PR でイメージをビルドだけする (公開しない)。公開はリリースのときだけで、S7e-2 で足す (accounts の ADR-0016 と同じ形)
- アプリは起動したとき (`onReady`) に、当たっていないマイグレーションがあれば名前を挙げて警告する (`pendingMigrations`)。起動は止めない

## Consequences

### 良い点

- イメージができた時点で、本番で要るものがそろって動くことが分かる
- 開発の DB への当て忘れが、開発サーバーのログで分かる

### 悪い点・受け入れるリスク

- イメージは 1 GB 前後。モデルが大半を占める (Prismtone と同じ)
- ビルドのたびにモデルを取りに行く。取れないとビルドが落ちる (CI のキャッシュで多くは避けられる)

## Alternatives

- web と worker を別のイメージにする: web はモデルの分だけ軽くなるが、ビルドと公開が 2 倍になる。accounts と同じ 1 つにする
- 実行のときにモデルを取る: 起動が遅く、HF Hub が落ちていると判定できない

## References

- ADR-0014、ADR-0023
- lumorphia/accounts の `docker/Dockerfile`・ADR-0016、lumorphia/prismtone の `docker/Dockerfile`
