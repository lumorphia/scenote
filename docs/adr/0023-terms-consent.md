# ADR-0023: 規約とプライバシーポリシーは docs/legal に置き、投稿などの前に同意と年齢を確かめる

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-18 |
| Deciders | t1nyb0x    |

## Context

要件定義書 26 章は、公開前に利用規約とプライバシーポリシーを用意し、対象を 15 歳以上とするとしている。ADR-0009 は規約の同意を S7 に回し、「同意していない人 (S7 より前にログインした人を含む) を同意の画面に送る」と決めた。規約の本文の読み取り・表示と、同意した版の比べ方は `@lumorphia/legal` にあり (platform ADR-0008)、lumorphia/prismtone は同じ形で使っている (prismtone ADR-0061)。

## Decision

- 本文は `docs/legal/terms.md` と `docs/legal/privacy.md`。frontmatter に `version` ("メジャー.マイナー") と `updatedAt`。画面はビルドのときに `?raw` で取り込み、loader が `@lumorphia/legal` で HTML にする (生の HTML は通さない)。サーバーは同じファイルを fs で読み、今の版を知る (`server/legal.ts`)
- 本文を直したら `version` を上げる。同意を求め直す改定はメジャー (`1.x` → `2.0`)、誤字や表現はマイナー (`1.0` → `1.1`)。メジャーを上げると、全員に同意を求め直す
- 同意の記録は `users.terms_accepted_version` (`"terms=1.0;privacy=1.0"`) と `terms_accepted_at`。15 歳以上であることの確認も同じ同意で受け、別の列は持たない (同意には確認が必須)
- `POST /api/me/consent` は、15 歳以上の確認と同意の両方が `true` のときだけ、今の版を記録する。初めての同意と再同意は同じ口
- `requireConsent` は、ログインに加えて今の版への同意を確かめ、無ければ 403 (`terms consent required`)。投稿 (受け取りの枠、作成、付け直し、送る前の確かめ) と通報に掛ける。投稿の削除と、退会の手続き (accounts) には掛けない (同意しない人も自分のものを消せる)
- `/api/me` は `needsConsent` を返す。ヘッダーは、同意の要る人を `/welcome?next=…` へ送る。`/welcome`・`/terms`・`/privacy` は送らない。送るのは、今いるページで読み直した結果のときだけ (同意した直後に、古い結果で送り返さない)
- 規約とポリシーは誰でも読める。フッターから開ける
- 問い合わせ先は `/contact` (Prismtone と共通の Google フォーム。相棒の判断。S7d-2 で作った。ADR-0027)

## Consequences

### 良い点

- 同意していない人の投稿をサーバーで止める。画面を通らない操作も止まる
- Prismtone と同じ版の決まりで、改定の仕方を 1 つ覚えればよい

### 悪い点・受け入れるリスク

- 本番のイメージに `docs/legal` を含める必要がある (S7e の Dockerfile)
- 年齢は自己申告。確かめる手段は持たない (Prismtone と同じ)
- 同意を求め直したとき、その人の公開中の投稿はそのまま見える。止まるのは本人の新しい操作だけ

## Alternatives

- ログインのたびに同意を求める: 煩わしいだけで、記録は変わらない
- Lumorphia アカウントの同意で兼ねる: サービスごとに規約の中身 (投稿できる画像など) が違う

## References

- 要件定義書 26 章
- ADR-0009
- lumorphia/prismtone ADR-0061、lumorphia/platform ADR-0008
