# ADR の一覧

| 番号                                          | 決めたこと                                                                          | Status   |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md) | ADR を使う                                                                          | Accepted |
| [0002](0002-stack-follows-prismtone.md)       | 構成は prismtone に準じ、別のサービスとして動かす                                   | Accepted |
| [0003](0003-no-originals-reeditable-webp.md)  | 原本は保存せず、再編集は端末と再編集用 WebP で                                      | Accepted |
| [0004](0004-post-visibility.md)               | 公開範囲は 公開 / 限定公開 / 非公開                                                 | Accepted |
| [0005](0005-login-with-lumorphia-account.md)  | ログインは Lumorphia アカウントで行う                                               | Accepted |
| [0006](0006-shared-platform-packages.md)      | 領域に属さない基盤は、先に共通パッケージにする                                      | Accepted |
| [0007](0007-public-repository-agpl.md)        | リポジトリは public (AGPL-3.0) にする                                               | Accepted |
| [0008](0008-skeleton-and-https-dev.md)        | 骨組みは accounts から写し、開発と E2E は https                                     | Accepted |
| [0009](0009-login-acceptance.md)              | Lumorphia でログインした人の受け入れ方とログアウト                                  | Accepted |
| [0010](0010-account-lifecycle.md)             | 退会と復旧は accounts で行い、知らせで当てる                                        | Accepted |
| [0011](0011-image-pipeline.md)                | 画像は署名付き PUT で受け取り、worker が派生画像を作る                              | Accepted |
| [0012](0012-private-images-through-app.md)    | 非公開の投稿の画像は、アプリが本人にだけ返す                                        | Accepted |
| [0013](0013-shooting-places.md)               | 撮影場所の候補は XIVAPI の街・フィールド・宿屋・ハウジングエリア                    | Accepted |
| [0014](0014-image-moderation.md)              | 投稿の画像は worker が自動で判定し、保留したものは本人にだけ見せる                  | Accepted |
| [0015](0015-blocked-words.md)                 | NG 語は画像を送る前に確かめ、サーバーで必ず断る                                     | Accepted |
| [0016](0016-post-list.md)                     | 投稿一覧は公開の投稿だけを新しい順に、カーソルで読み、いちばん低い列に積む          | Accepted |
| [0017](0017-post-deletion.md)                 | 投稿の削除はすぐに行を消し、画像は worker が消す                                    | Accepted |
| [0018](0018-ogp.md)                           | OGP の画像は派生画像のジョブで作り、meta は load context で SSR する                | Accepted |
| [0019](0019-admin.md)                         | 管理画面は Access と許可リストで二重に守り、操作を記録する                          | Accepted |
| [0020](0020-review.md)                        | 保留・要確認の投稿は運営が理由を書いて公開か非表示に決める                          | Accepted |
| [0021](0021-reports.md)                       | 通報はログインした人から受け、運営は投稿を非表示にするか通報を退ける                | Accepted |
| [0022](0022-blocked-terms-dictionary.md)      | 運営が足す NG 語は DB の辞書に置き、組み込みの一覧と合わせて照合する                | Accepted |
| [0023](0023-terms-consent.md)                 | 規約とプライバシーポリシーは docs/legal に置き、投稿などの前に同意と年齢を確かめる  | Accepted |
| [0024](0024-docker-image.md)                  | 本番のイメージは 1 つで、モデルと規約を含め、ビルドの中で動くことを確かめる         | Accepted |
| [0025](0025-production.md)                    | 本番は accounts と同じ形で、同じ VPS に分けて置き、リリースのときだけイメージを出す | Accepted |
| [0026](0026-adventurers-photo-journal.md)     | 冒険者の写真日誌としてトップと投稿詳細を整える                                      | Accepted |
| [0027](0027-contact.md)                       | 問い合わせは Lumorphia で共通の Google フォームへ、自前の画面から送る               | Accepted |
| [0028](0028-search.md)                        | 検索は 1 つの欄の言葉をタイトル・タグ・地点から探し、索引はまだ作らない             | Accepted |

本文中の「prismtone ADR-NNNN」は lumorphia/prismtone の ADR を指す。
