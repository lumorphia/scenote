# ADR-0011: 画像は署名付き PUT で受け取り、worker が派生画像を作って公開する

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-12 |
| Deciders | t1nyb0x    |

## Context

投稿の画像は、ブラウザの現像 (lumorphia/editor) が書き出した WebP (なければ JPEG) が届く。アプリのサーバーのディスクに永続保存せず、R2 に置く (要件定義書 18.2)。原本は持たない (ADR-0003)。

lumorphia/prismtone は、署名付き URL で一時置き場に PUT させ、pg-boss のジョブで検証・再エンコードして派生画像を作る。検証と派生画像は `@lumorphia/media`、置き場所は `@lumorphia/storage` に切り出してある (ADR-0006)。ジョブの投入と worker は lumorphia/accounts が同じ pg-boss で持っている。

## Decision

prismtone の流れを写し、ジョブの仕組みは accounts の形に揃える。

1. `POST /api/uploads` で、一時置き場 `tmp/{uploadId}` への署名付き PUT を出す。申告できる形式は WebP・JPEG・PNG、大きさは `UPLOAD_MAX_BYTES` (既定 30 MB、現像の上限と同じ)。1 人が投稿に使っていない枠は 10 個まで、期限は 1 日
2. `POST /api/posts` で、置いた画像から投稿を作る。枠の消費、投稿の行、`image-process` ジョブの投入は同じトランザクション
3. worker の `image-process` が `@lumorphia/media` で検証・再エンコードし、display と thumb を `posts/{postId}/{推測できない値}/` に置いて、投稿を公開する。受け取った画像は、受け付けても断っても消す
4. 毎時の `upload-cleanup` が、期限を過ぎた枠と、枠の無い一時置き場の画像を消す。派生画像を作っている投稿が指す枠は残す
5. 利用者を物理削除するとき (ADR-0010 の purged と、30 日を過ぎたあとのログイン) は、その人の投稿の画像を `image-delete` ジョブで消す。行の削除と同じトランザクションで投入する

- 派生画像のキーに推測できない値を入れるのは、限定公開の画像 URL を投稿 ID から作れないようにするため (ADR-0004)。非公開の置き場所は S5c で決める
- 開発とテストは、既定で手元のファイル (`.data/storage`) に置き、アプリ自身が `/_storage` で受け取って配る。ジョブもアプリの中で走らせる (`JOBS_INLINE`)。本番は R2 と worker で、`JOBS_INLINE` は無視する
- 同じ投稿の `image-process` と、毎時の掃除は、待っている間も走っている間も 1 本にする (pg-boss の `exclusive`)

## Consequences

### 良い点

- 画像がアプリのサーバーを通らない。再エンコードで EXIF と WebP の拡張チャンク (再編集用 WebP の元画像を含む) が落ちることをテストで確かめている (`jobs/image-process.db.test.ts`)
- 処理が prismtone と同じパッケージなので、2 つのサービスで画像の扱いが食い違わない

### 悪い点・受け入れるリスク

- 投稿してから見られるまで、派生画像を作る間だけ待つ。画面は `processing` を出して待つ (S5b)
- worker が止まると投稿が `processing` のまま残る。監視は S7 で入れる

### 追従して必要になること

- S5b: 投稿の項目と画面
- S5c: 非公開の画像の置き場所と、公開範囲を変えたときの移動
- S5f: 派生画像に対する自動モデレーション
- S7: R2 のバケット (prismtone と分ける)、本番の compose で worker を動かす、OGP の画像

## Alternatives

- アプリが画像を受け取る (multipart): 実装は短いが、30 MB の画像がアプリのサーバーを通る。prismtone と流れが変わる
- ジョブをアプリの中だけで走らせる: プロセスが 1 つで済むが、再起動でジョブを失う。本番では採らない

## References

- 要件定義書 7 章、18 章、19.1
- ADR-0003、ADR-0004、ADR-0006、ADR-0010
- lumorphia/prismtone の docs/design/03、`jobs/image-process.ts`
- lumorphia/accounts の `packages/core/src/jobs/pg-boss.ts`
