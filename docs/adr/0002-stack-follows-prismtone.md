# ADR-0002: 構成は prismtone に準じ、別のサービスとして動かす

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

Scenote は「現像して投稿し、一覧と詳細と OGP で見せる」点で prismtone と同じ形をしている。prismtone はその構成で M3 まで動き、本番の運用 (compose、doco-cd、Cloudflare、バックアップ) も整っている。一方で、要件定義書の 20 章は 2 つを同じアプリケーションに統合しないとしている。

## Decision

Scenote は prismtone と同じ技術構成で、別のリポジトリ・DB・R2 バケット・デプロイとして動かす。

| 領域          | 採用                                            | prismtone の ADR |
| ------------- | ----------------------------------------------- | ---------------- |
| 画面          | React Router v7 (SSR) + Tailwind + shadcn/ui    | 0012             |
| API           | Fastify + zod + OpenAPI、画面と同一プロセス     | 0011             |
| DB            | PostgreSQL + Drizzle                            | 0010             |
| ジョブ        | pg-boss                                         | 0007             |
| ストレージ    | Cloudflare R2、署名付き URL で直接アップロード  | 0006             |
| 認証          | Lumorphia アカウントの OIDC の利用側 (ADR-0005) | -                |
| 現像          | `@lumorphia/editor-*` (GitHub Packages、版固定) | 0035, 0036       |
| 実行環境      | VPS + Docker Compose、Cloudflare の後ろ         | 0003, 0020, 0031 |
| ローカルの S3 | RustFS                                          | 0026             |

装備マスタ、Universalis、Lodestone 連携、カララントは持ち込まない。

## Consequences

### 良い点

- 運用の知識と手順 (runbook、CI、release-please) がそのまま使える
- 片方の障害やデプロイが、もう片方に波及しない

### 悪い点・受け入れるリスク

- 同じ処理が 2 つのリポジトリに存在する。範囲と解消の方針は ADR-0006

### 追従して必要になること

- 同じ VPS に載せるなら、Caddy と Postgres の資源の分け方を runbook に書く

## Alternatives

- prismtone に「シーン」投稿の種類を足す: 要件定義書 20 章に反する。装備前提の画面・規約・検索と混ざる
- 別の構成 (Next.js など) を選ぶ: 2 つの構成を保守する理由が無い

## References

- 要件定義書 18 章、20 章
- lumorphia/prismtone `docs/SUMMARY.md`
