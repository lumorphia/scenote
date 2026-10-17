# ADR-0019: 管理画面は Access と許可リストで二重に守り、操作を記録する

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-17 |
| Deciders | t1nyb0x    |

## Context

要件定義書 26 章は、通報と管理者が対応する画面を MVP に含め、公開前に用意するとしている。S5f の保留 (ADR-0014)、S5g の NG 語の辞書 (ADR-0015) も、運営の画面を待っている。

lumorphia/accounts は ADR-0015 で、管理画面の守り方と操作の記録を決めた (Cloudflare Access と env の許可リストの二重、DB の role を権限に使わない、操作と同じトランザクションで記録、利用者は sub だけで指す、1 年で消す)。運営者は 1 人で、accounts と Scenote の運営者は同じ人。

## Decision

accounts の ADR-0015 と同じ形にする。

- 置き場所は Scenote の `/admin` (画面) と `/api/admin/*` (API)。投稿の非表示・削除は Scenote のデータなので、Scenote に置く
- 外側: Cloudflare Access で `/admin`・`/api/admin` を守る (本番の段 S7e で設定し、外から 302 であることを監視する)
- 内側: `requireAdmin` が、リクエストのたびに、ログインした利用者が退会中でなく、その Lumorphia の sub が env の許可リスト `ADMIN_SUBS` (カンマ区切りの UUID) にあることを確かめる。DB の値は権限に使わない
- 許可リストにいない人には、ログインの有無によらず 404 で答える (管理画面があることを見せない)。応答は `private, no-store`
- `ADMIN_SUBS` が無いか空なら、管理画面は閉じる。UUID でない値があれば起動しない
- 管理画面の操作は、操作と同じトランザクションで `admin_audit_logs` に 1 行を書く。持つのは、運営者の sub・操作・対象 (投稿の ID か利用者の sub)・理由 (必須) ・日時。メール・handle・表示名は書かない。利用者や投稿への FK は持たず、消えたあとも残す。アプリは追記だけ
- 記録は 1 年で消す (`audit-log-purge`、毎日 3:40)。期間はプライバシーポリシーに書く (S7d)
- 一覧や検索などの読むだけの操作は記録しない
- 通報は Lumorphia アカウントでのログインを求める。アカウントの無い人 (写り込んだ本人など) は、規約に書く問い合わせ先から運営に連絡する (2026-10-17 の相棒の判断。lumorphia/prismtone と同じ)

## Consequences

### 良い点

- 権限の根拠が env の許可リスト 1 か所になり、外せばすぐに入れなくなる。accounts と同じ運用で済む
- 誰が何をなぜしたかが、利用者の情報を最小にして残る

### 悪い点・受け入れるリスク

- Access のパスの設定を誤ると、外側の守りが黙って外れる。監視で拾い、内側の許可リストで止める
- 運営者が 1 人なので、記録は自分の操作の控えに近い。改ざんを防ぐ仕組みは持たない

### 追従して必要になること

- S7a-2: 保留・要確認の投稿の確認
- S7b: 通報、NG 語の辞書
- S7e: Access の設定と監視、`ADMIN_SUBS` の runbook

## Alternatives

- DB の role で判定する: 外したつもりの権限が DB に残る (accounts の ADR-0015 の理由)
- accounts の管理画面に Scenote の操作も置く: Scenote の投稿を accounts が触ることになり、サービスのデータを分けた決め (accounts の ADR-0015) に反する

## References

- 要件定義書 26 章
- ADR-0014、ADR-0015
- lumorphia/accounts の ADR-0015
