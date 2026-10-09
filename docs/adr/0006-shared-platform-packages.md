# ADR-0006: サービスの領域に属さない基盤は、Scenote を始める前に共通パッケージにする

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

Scenote は Prismtone と同じ構成 (ADR-0002) で、ストレージ、派生画像のジョブ、OGP、モデレーション、運用の仕組みなど多くの処理が重なる。Facetia も続く。

最初の案 (画像の検証と派生画像だけを切り出し、残りは複製) は、Scenote を早く始められる代わりに、複製したものの修正を 2 か所、3 か所に当て続けることになる。相棒は、Scenote の開始が遅れても、作れる共通基盤は先に作ると判断した (2026-10-06)。

Lumorphia アカウント (ADR-0005) によって、ログインの受け口と退会の知らせの受け口は、どのサービスにも同じものが要る新しいコードになる。これは複製の元が無いので、最初から共通にするしかない。

## Decision

### 切り出す基準

次の 3 つを満たすものを共通パッケージにする。

1. サービスの領域 (装備、撮影場所、投稿の中身) を知らない
2. Prismtone で本番に出て動いている (Lumorphia アカウントの受け口だけは例外。新しく作る)
3. Scenote が使う

**共通パッケージはサービスの DB のテーブルを持たない。** 関数とアダプターと型を出し、テーブルはサービスが持つ。テーブルの形を揃えたいもの (退会の状態、機能フラグなど) は、Drizzle の列の定義を出してサービスが自分のスキーマに入れる。

### 切り出すもの

| パッケージ (仮称)        | 中身                                                                                                                                                                                            | Prismtone の元                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@lumorphia/media`       | 画像の検証 (MIME、デコード、画素数の上限)、再エンコードとメタデータの除去、派生画像、OGP とシェア画像の描画の土台 (レイアウトはサービスが渡す)                                                  | `adapters/image`、`adapters/ogp`、`adapters/share-image`                                      |
| `@lumorphia/storage`     | S3 / R2 / fs / memory のアダプター、署名付き URL、アップロードの受け付けと後片付けのジョブ (画像の削除、取り残しの掃除、一時ファイル)                                                           | `adapters/storage`、`domain/uploads`、`jobs/image-delete`・`image-stuck-sweep`・`tmp-cleanup` |
| `@lumorphia/auth-client` | Lumorphia でログインする受け口 (Better Auth の `generic-oauth` の設定、ID トークンの claim の読み取り、`legacy_pending` の案内)、退会の知らせの受け口 (署名の検証、30 日の復旧と物理削除の流れ) | 新規 (A0 spike、`domain/account-deletion`・`jobs/account-purge` の流れ)                       |
| `@lumorphia/moderation`  | 画像の自動モデレーション (ONNX / CLIP)、NG 語の照合                                                                                                                                             | `adapters/moderation`、`domain/blocked-terms`                                                 |
| `@lumorphia/ops`         | ロガー、heartbeat、機能フラグ、通知 (Discord)、日次レポートの土台、Sentry の伏せ字                                                                                                              | `logger`、`jobs/heartbeat`、`domain/feature-flags`、`adapters/notify`、`shared/monitoring`    |
| `@lumorphia/legal`       | 規約とプライバシーポリシーの版と同意の判定、本文 (Markdown) の表示                                                                                                                              | `domain/users` の同意まわり、`docs/legal` の frontmatter                                      |
| 開発の道具               | ESLint・TypeScript・Prettier の設定、CI の再利用ワークフロー、Renovate と release-please の設定、E2E の土台 (`*.lumorphia.test` と TLS、mock の OAuth)                                          | 各リポジトリの設定ファイル、`e2e/`                                                            |

### 切り出さないもの

投稿、タグ、検索、一覧、お気に入り、いいね、コメント、通報と管理画面、サイトマップ、閲覧数。投稿の形がサービスで違い、テーブルに強く結び付いている。Scenote では Prismtone から写して始め、2 つが動いてから見直す。

画面の部品 (ヘッダー、ログインボタン、色のトークン) も、今は切り出さない。Lumorphia のデザインを決めてから別に判断する。

### 進め方

- 切り出しは editor のとき (Prismtone ADR-0035 / 0036: GitHub Packages、版を固定) に従う。Prismtone を載せ替え、Prismtone の E2E が通ってから Scenote が使う
- 順番: `media` と `storage` → `ops` → `auth-client` (accounts の A1・A2 と一緒に) → `moderation` → `legal` → 開発の道具
- 置き場所は public と private の 2 つの monorepo に分ける
  - `lumorphia/platform` (public): `media`、`storage`、`auth-client`、`ops`、`legal`、開発の道具
  - `lumorphia/umbra` (private): `moderation`。今後の不正対策の判定もここに置く
  - 分ける線は「知られると回避されるか」。モデレーションの判定のしきい値や組み合わせ方は、知られるとすり抜けの手がかりになる。署名付き URL、画像の検証、ログインの受け口は、安全が鍵と正しい実装で守られていて、コードを隠しても強くならないので public に置く
  - `lumorphia/platform` のライセンスは AGPL-3.0 (editor と同じ)。持っていって閉じたサービスに使い、手を入れた部分を隠すことを防ぐ。著作権者は運営者だけなので、private の Prismtone・Scenote が使っても運営者は縛られない。外からの貢献を受け入れるときは、先に CLA を用意する
  - 依存の向きは private → public だけ。public は private を知らない
  - public にすると GitHub Actions の標準のランナーが無料で、org の 2000 分を使わない。GitHub Packages のパッケージはリポジトリと別に公開範囲を持ち、既定は private (2026-10-06 に公開した `@lumorphia/media`・`storage` 1.0.0 も、editor の 3 つも private)。private のパッケージは org の保存容量 (500MB) に数えられるが、どれも小さく、Actions の中からの読み込みは転送量に数えられないので、private のままにする。public にしたパッケージは private に戻せない。private の CI は、PR では fake のモデレーターでのテストだけを回し、実際のモデルを使うテストはリリースのときと手元で回す
- 疎結合はリポジトリの境界ではなく、パッケージの境界と依存の向きで守る。パッケージ間の依存は ESLint で縛り、ルールが効いていることをテストで確かめる (lumorphia/editor の `tooling/eslint-boundaries.test.ts` と同じ)
- パッケージごとに版を付けて公開する (release-please の manifest)。サービスは使うパッケージだけを、版を固定して入れる
- リポジトリをさらに分けるのは、公開範囲・ライセンス・利用者・持ち主のどれかが他と違うパッケージが出てきたとき。そのパッケージだけを外に出す

## Consequences

### 良い点

- セキュリティの要 (画像の検証、署名付き URL、ログイン、退会) が 1 か所になる
- Facetia は、ここにあるものを組み合わせて始められる
- 運用の仕組み (監視、機能フラグ、通知) がサービスごとに食い違わない

### 悪い点・受け入れるリスク

- Scenote の開始は、`media` と `storage` (と、投稿には `auth-client`) の切り出しを待つ
- 共通パッケージを変えると、全サービスの版を上げる手間がかかる。破壊的な変更は major にし、各サービスは自分の都合で上げる
- 1 つ目の利用者 (Prismtone) の形に引っ張られた抽象になりうる。Scenote で合わなかったら、パッケージの側を直す

### 追従して必要になること

- Prismtone に ADR を足し、切り出しと載せ替えを記録する
- 外からの貢献を受け入れる前に CLA を用意する (受け入れないなら CONTRIBUTING に書く)
- public のリポジトリ (platform、editor) に入れてよいものを決め、CI で検査する
  - クレデンシャル (トークン、鍵、パスワード、`.env`) は入れない。gitleaks などでコミットと PR を検査する
  - 運営者以外の人のデータは入れない (他のプレイヤーのキャラクター、投稿、スクリーンショット、利用者の ID やメールアドレス)
  - 運営者のデータ (Hal Myth @ Tiamat の Lodestone のページなど) は入れてよい
  - 運営者のものでも、スクリーンショットを大量に入れない。テストの画像は、検証に要る最小限の数と大きさにし、できるだけテストの中で作る
  - 機械学習の学習データや評価用の画像の集まりは入れない。モデルは配布元から取得する
  - umbra (private) も同じ方針にする。private でも、他人のデータを置く理由にはならない
- `umbra` の GitHub Packages を読むトークンを、各サービスの CI・Docker のビルド・Renovate (hostRules) に渡す。public のパッケージも GitHub Packages からの install には認証が要る
- 要件定義書 20 章を書き換える

## Alternatives

- 画像の検証と派生画像だけを共通にし、残りは複製する (最初の案): Scenote は早く始まるが、複製の修正を当て続けることになる
- 全部 (投稿や検索まで) を共通にする: サービスの違いが一番大きい部分で、抽象が外れやすい
- パッケージごとにリポジトリを分ける: 疎結合に見えるが、結合を防ぐのは依存のルールで、リポジトリの境界ではない。CI・Renovate・release-please の設定が 7 つに増え、複数のパッケージにまたがる変更が複数の PR と公開の順番待ちになる。1 人で保守するには面が多すぎる
- 全部を 1 つの private の monorepo に置く: 公開範囲は 1 つで済むが、CI のすべてが org の 2000 分を食う。Prismtone だけでも重く、足りなくなる
- editor と同じ monorepo に入れる: editor は public の AGPL-3.0 で、単独アプリという別の利用者がいる。公開範囲が違うので分ける

## References

- 要件定義書 18.3、20 章
- lumorphia/prismtone ADR-0019、ADR-0035、ADR-0036
- `lumorphia/accounts/docs/plan.md`
