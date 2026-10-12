# Scenote の計画

要件は [scenote\_要件定義書.md](scenote_要件定義書.md)、判断は [adr/](adr/)。ここには段階と進み具合だけを置く。段階の中身は着手するときに決め直してよい。

## 前提

- Scenote より先に Prismtone と共通基盤をリリースする (2026-10-10 の判断)。Scenote の段階は、その合間に進める
- 共通基盤 (`@lumorphia/media`・`storage`・`auth-client`・`ops`・`legal`・`moderation`、開発の道具) は公開済み (ADR-0006)
- ログインは Lumorphia アカウント (ADR-0005、accounts の A3)

## 段階

| 段階 | 内容                                                                                                                                                                                      | 状態   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1   | `@lumorphia/media` の切り出し (platform)                                                                                                                                                  | 済み   |
| S2   | 骨組み。React Router (SSR) + Fastify + Drizzle + PostgreSQL、https の開発と E2E、CI、gitleaks、release-please (ADR-0008)                                                                  | 作業中 |
| S3   | 現像の画面。`<Editor>` を置き、editor ADR-0009 のホストの要件 (オリジンの分離、CSP、モデルの配信、Tailwind の `@source`、Vite) を満たす。「Scenoteへ投稿」の行き先は S5 でつなぐ          |        |
| S4   | ログイン (accounts の A3)。`@lumorphia/auth-client`、規約の同意、退会の知らせの受け口。E2E の土台 (偽の発行元、E2E 専用の CA) を platform に切り出す (ADR-0008)                           |        |
| S5   | 投稿。`@lumorphia/storage` の署名付き URL、`@lumorphia/media` の派生画像のジョブ (pg-boss)、モデレーション、公開範囲 (ADR-0004)、撮影場所、タグ、撮影日、レシピの保存。Prismtone から写す |        |
| S6   | 閲覧。一覧、詳細、タグ検索、マイページと削除、OGP                                                                                                                                         |        |
| S7   | 運営と本番。規約とプライバシーポリシー (`@lumorphia/legal`)、通報と管理画面、Docker のイメージ、本番の compose と runbook、監視、公開の判断                                               |        |

S3 はログインが要らないので S4 より先に進められる。S5 は S3 と S4 を待つ。
