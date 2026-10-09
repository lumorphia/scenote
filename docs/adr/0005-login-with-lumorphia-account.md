# ADR-0005: ログインは Lumorphia アカウントで行う

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

要件定義書 14 章は、将来 Lumorphia の各サービスでアカウントを共通にできる構造を求めている。サービスは今後も増える (Facetia)。サービスごとに登録させるのは利用者の手間が大きく、Lodestone のキャラクター確認もサービスごとにやり直すことになる。

Prismtone はすでに公開していて、利用者がいる。Lumorphia アカウントを作るなら、Prismtone の利用者の移行も同時に要る。

## Decision

- Scenote は自分でログインを持たない。Lumorphia アカウント (accounts.lumorphia.com) の OIDC の利用側になり、「Lumorphia でログイン」だけを出す
- handle、表示名、アイコン、キャラクター (Lodestone の確認) は Lumorphia のものを使う
- Scenote の DB は利用者を Lumorphia の `sub` で持つ。セッションは Scenote が持ち、Cookie は `scenote.lumorphia.com` に限る
- 規約の同意、BAN、管理者、Scenote だけの退会は Scenote が持つ
- Lumorphia アカウントの設計と Prismtone からの移行は `lumorphia/accounts` で決める

## Consequences

### 良い点

- 利用者は 1 回の登録で Lumorphia のサービスを使える。キャラクターの確認も 1 回
- Scenote は認証 (5 種のログイン、MiAuth、Mastodon) を実装しない

### 悪い点・受け入れるリスク

- Scenote の投稿 (S4) は、Lumorphia アカウントの公開 (accounts の A1) を待つ
- Lumorphia アカウントが止まると、Scenote に新しくログインできない。ログイン済みの利用者は Scenote のセッションで使い続けられる

### 追従して必要になること

- 要件定義書 14 章を書き換える
- 退会の連鎖 (Lumorphia から退会したときに Scenote のデータをどうするか) を accounts の設計に合わせる

## Alternatives

- Scenote 単独の Better Auth で始め、あとで統合する: 早く始められるが、Prismtone と Scenote の 2 つから移行することになる。利用者にも 2 回登録させる
- `.lumorphia.com` で Cookie と DB を共有する: サービスの DB がくっつき、ADR-0002 の「別のサービスとして動かす」が崩れる

## References

- 要件定義書 14 章
- `lumorphia/accounts/docs/plan.md`
- lumorphia/prismtone ADR-0004、ADR-0013、ADR-0017、ADR-0019
