# ADR-0014: 投稿の画像は worker が自動で判定し、保留したものは本人にだけ見せる

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-17 |
| Deciders | t1nyb0x    |

## Context

要件定義書 19 章と 21 章は、FFXIV 以外の画像や不適切な画像への備えを求めている。lumorphia/prismtone は、派生画像を作ったあとで NSFW と「FF14 の画面らしさ」を判定し、公開・公開して運営が確かめる・保留の 3 つに振り分けている (prismtone の RM-18b)。判定器と振り分けは `@lumorphia/moderation` (lumorphia/umbra、private) に切り出してある (prismtone ADR-0060、ADR-0006)。しきい値は知られると回避されるので、このリポジトリには書かない (ADR-0007)。

Scenote は 1 投稿 1 枚 (要件定義書 9 章) で、公開・限定公開の画像は配信元から誰でも読める `posts/` に置く (ADR-0011、ADR-0012)。保留した画像をそこに置くと、キーを知っていれば読めてしまう。

## Decision

`image-process` ジョブが、派生画像を作ったあとで display を `@lumorphia/moderation/image` の判定器に渡し、`decideModeration` で振り分ける。振り分けの決まりとしきい値はパッケージの既定を使い、変えるときは環境変数 (`MODERATION_*_THRESHOLD`) で本番だけに置く。

| 判定      | 投稿の status | 見え方                                   |
| --------- | ------------- | ---------------------------------------- |
| `clear`   | `published`   | 公開範囲のとおり                         |
| `flagged` | `published`   | 公開範囲のとおり。運営があとで確かめる   |
| `held`    | `held`        | 本人にだけ見える。ほかの人には無いことに |

- 結果は投稿の `moderation_state`・`moderation_score`・`moderation_labels`・`moderated_at` に残す。判定していなければ (判定器が `off`) どれも null で、そのまま公開する
- 保留した投稿の画像は、公開範囲によらず非公開の置き場所 (`private/`) に置き、アプリが本人にだけ返す (ADR-0012 の中継)。保留している間に本人が公開範囲を変えても、画像は動かさない
- 見られるかの判定は `canView` のまま。`published` でなければ本人にしか見えないので、`held` もここで本人だけになる
- 本人の投稿のページには「運営が確認している、確認が終わるまでほかの人には表示されない」と出す。保留の理由 (NSFW か、ゲームの画面らしくないか) は出さない
- 判定器は `IMAGE_MODERATION` で選ぶ。開発の既定は `off`、E2E とサーバーのテストは色で決める `fake`、本番は `onnx` だけで、worker は本番で `onnx` 以外だと起動しない (`server/moderation-config.ts`)。モデルの読み込みは重いので、最初のジョブで作って使い回し、作れなかったら次のジョブで作り直す
- 判定器の単体テストと本物のモデルのテストは lumorphia/umbra にある。Scenote では偽の判定器で、つながっていることと振り分けの結果の扱いを確かめる。テストのスコアは、しきい値を書かずにパッケージの既定から作る

## Consequences

### 良い点

- Prismtone と同じ判定なので、2 つのサービスで通るものが食い違わない。判定を変えるのは umbra の 1 か所
- 保留した画像は配信元から読めない。運営が確かめる前に URL が出回らない

### 悪い点・受け入れるリスク

- 保留を解く・`flagged` を確かめる管理画面は S7 まで無い。それまで保留した投稿は本人にしか見えないまま。公開前に S7 を終えるので、利用者に出る前には揃う
- worker は本物のモデル (数百 MB) を読む。本番の image にモデルを入れる (S7、`lumorphia-moderation-models`)
- 判定は画像だけ。タイトル・本文・タグの NG 語は S5g で入れる

### 追従して必要になること

- S5g: タイトル・本文・タグの NG 語 (`@lumorphia/moderation/text`)。運営が足す辞書の表と画面は S7
- S7: 保留と `flagged` の一覧、保留を解いたら画像を公開範囲の置き場所へ移す (image-move)、操作の記録 (prismtone の `moderation_logs`)。本番の image にモデルを入れる

## Alternatives

- 判定が済むまで画像を置かない: 保留した投稿を本人も見られなくなり、何が起きたか分からない
- 保留した画像も公開範囲の置き場所に置き、推測できないキーだけで守る: 限定公開と同じ強さになり、運営が確かめる前に URL が出回りうる
- 投稿を作るとき (ブラウザ) に判定する: 判定器とモデルを利用者に配ることになり、回避の手がかりを渡す (ADR-0007)

## References

- 要件定義書 19 章、21 章
- ADR-0006、ADR-0007、ADR-0011、ADR-0012
- lumorphia/prismtone ADR-0060、`packages/core/src/jobs/image-process.ts`
