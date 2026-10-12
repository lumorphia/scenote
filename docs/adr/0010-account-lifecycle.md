# ADR-0010: 退会と復旧は accounts で行い、知らせで当てる

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-12 |
| Deciders | t1nyb0x    |

## Context

Lumorphia アカウントでは、全体の退会もサービスだけの退会も accounts の画面から始め、30 日以内なら本人が accounts で復旧できる (accounts ADR-0008・0011)。accounts はサービスに署名付きの知らせ (`deleted` / `active` / `purged`) を、届くまで送り直す。サービスだけの退会中は、そのサービスへのログインが完了しない。Prismtone は A2.4 でこの知らせを受ける形を作った (prismtone ADR-0058)。

Scenote は今のところ投稿を持たない (S5 で足す)。

## Decision

- **退会の入口は accounts だけ**。Scenote に退会の画面と API は作らない
- `POST /api/lumorphia/account-events` で知らせを受け、auth-client の受け口で確かめて当てる。サーバー間の POST なので CSRF の Origin 確認から外し、署名で守る
  - `deleted`: 利用者を `deleted` にし (退会日時は accounts のもの)、セッションを消す
  - `active`: `active` に戻す
  - `purged`: 利用者を消す (セッションと連携も一緒に消える)。その人の知らせの記録も消す
- 知らせは `lumorphia_account_events` に記録し、記録と状態の変更を同じトランザクションにする。同じ知らせは 1 回だけ当て、sub ごとに最後に当てた revision より古いものは当てない。Scenote に来たことが無い人の知らせは記録しない
- **知らせより先にログインしたときは、ログインで戻す**。ログインが完了したなら accounts では active (prismtone ADR-0058 と同じ)
- **ログインのときに、退会から 30 日を過ぎた人が残っていれば先に消し**、新しい利用者として始めさせる (`purged` が届かなかったとき)
- 物理削除のジョブは持たない。30 日を過ぎたら accounts が `purged` を送る
- 投稿ができたら (S5)、`deleted` で投稿を見えなくし、`purged` で投稿と画像を消す。そのときこの ADR に追記する

## Consequences

### 良い点

- 退会と復旧の操作が accounts の 1 か所になる。Prismtone と同じ形で、運用の手順も同じ
- 知らせが滞っても、ログインのたびに accounts の状態に揃う

### 悪い点・受け入れるリスク

- accounts の知らせが届かない間は、Scenote の利用者が残る。accounts は無期限に送り直し、滞留は accounts の監視で拾う

## References

- ADR-0005、ADR-0009
- lumorphia/prismtone ADR-0058
- lumorphia/accounts ADR-0008、ADR-0011
- lumorphia/platform ADR-0006 (退会の知らせの形)
