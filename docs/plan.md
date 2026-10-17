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
| S2   | 骨組み。React Router (SSR) + Fastify + Drizzle + PostgreSQL、https の開発と E2E、CI、gitleaks、release-please (ADR-0008)                                                                  | 済み   |
| S3   | 現像の画面。`<Editor>` を置き、editor ADR-0009 のホストの要件 (オリジンの分離、CSP、モデルの配信、Tailwind の `@source`、Vite) を満たす。「Scenoteへ投稿」の行き先は S5 でつなぐ          | 済み   |
| S4   | ログイン (accounts の A3)。`@lumorphia/auth-client`、退会の知らせの受け口。E2E の土台 (偽の発行元、E2E 専用の CA) を platform に切り出す (ADR-0008)。規約の同意は S7 (ADR-0009)           | 済み   |
| S5   | 投稿。`@lumorphia/storage` の署名付き URL、`@lumorphia/media` の派生画像のジョブ (pg-boss)、モデレーション、公開範囲 (ADR-0004)、撮影場所、タグ、撮影日、レシピの保存。Prismtone から写す | 作業中 |
| S6   | 閲覧。一覧、詳細、タグ検索、マイページと削除、OGP                                                                                                                                         |        |
| S7   | 運営と本番。規約とプライバシーポリシー (`@lumorphia/legal`)、通報と管理画面、Docker のイメージ、本番の compose と runbook、監視、公開の判断                                               |        |

S3 はログインが要らないので S4 より先に進められる。S5 は S3 と S4 を待つ。

### S4 の分け方

| 段階 | 内容                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| S4a  | lumorphia/platform に `@lumorphia/e2e` (偽の発行元、E2E の TLS、Playwright の helper。platform ADR-0010)                  |
| S4b  | ログインとログアウト、back-channel logout、ヘッダーのログインの状態 (ADR-0009)                                            |
| S4c  | 退会の知らせ (`/api/lumorphia/account-events`) の受け口。投稿が無いうちは利用者の状態とセッションだけ                     |
| S4d  | accounts の開発環境に Scenote のクライアントを登録し、本物どうしでログインを確かめる (`docs/runbook/lumorphia-client.md`) |

S4d (2026-10-12) で、手元の accounts とつないで次を確かめた: ログイン (handle の写し、セッションの sid と ID トークン)、Scenote からのログアウト (accounts の end-session を通り、accounts のセッションも終わる)、accounts でのログアウトによる back-channel logout、Scenote だけの退会と復旧の知らせ、CSP の違反なし。Scenote のコードの直しは無く、hosts と CA の渡し方を runbook に足した。

### S5 の分け方

1 投稿 1 枚 (要件定義書 9 章)。受け取った画像は派生画像を作ったら消し、原本は持たない (ADR-0003)。

| 段階 | 内容                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5a  | 画像の受け取りと派生画像。`@lumorphia/storage` の署名付き PUT、pg-boss のキューと worker、`@lumorphia/media` で display・thumb、受け取った画像を消す、期限切れの掃除 |
| S5b  | 投稿画面。現像の「Scenoteへ投稿」、プレビュー、タイトル・本文・撮影日、写り込みの注意 (要件定義書 19.2)、レシピの保存、自分の投稿の詳細                              |
| S5c  | 公開範囲 (ADR-0004)。非公開の画像は別の置き場所と短命の署名付き URL、範囲を変えたら画像を移すジョブ、認可を 1 か所に                                                 |
| S5d  | タグ。付ける・外す、表記のゆれ (Prismtone から写す)                                                                                                                  |
| S5e  | 撮影場所。地名を DB に同期し、候補と自由入力 (要件定義書 10 章)                                                                                                      |
| S5f  | モデレーション。画像の自動判定と保留 (`@lumorphia/moderation`、ADR-0014)                                                                                             |
| S5g  | NG 語。タイトル・本文・タグを `@lumorphia/moderation/text` の組み込みの一覧で照合する。運営が足す辞書の表と画面は S7                                                 |
