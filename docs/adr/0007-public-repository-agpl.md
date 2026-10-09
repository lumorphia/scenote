# ADR-0007: リポジトリは public (AGPL-3.0) にする

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-10 |
| Deciders | t1nyb0x    |

## Context

ADR-0006 は、共通基盤を public の `lumorphia/platform` と private の `lumorphia/umbra` に分けた。その中で Scenote は Prismtone と並べて private のサービスとして書いていたが、Scenote のリポジトリの公開範囲そのものは決めていなかった。

org の GitHub Actions は Free プランで、private リポジトリは合わせて月 2000 分まで。Prismtone だけでも 1 回の PR で 15〜20 分使い、E2E はリリース PR でだけ回す運用で節約している。Scenote も同じ構成 (ADR-0002) で E2E が重く、private にすると上限を超える見込みが高い。

Scenote には、知られると回避されるもの (モデレーションの判定のしきい値や組み合わせ方) を置かない。それは umbra にある (ADR-0006)。

## Decision

- **リポジトリは public、ライセンスは AGPL-3.0-only**。lumorphia/accounts の ADR-0002、lumorphia/platform と同じ線
- 安全はコードを隠すことではなく、鍵 (`.env` と GitHub の Secrets にあり、リポジトリには入れない) と正しい実装で守る。公開範囲の認可 (ADR-0004) も、コードを読まれても破れない作りにし、テストで確かめる
- 知られると回避されるものは Scenote に置かない。モデレーションの判定は `@lumorphia/moderation` (umbra) を使い、しきい値をこのリポジトリに書かない。NG 語の辞書は DB に置き、リポジトリには入れない
- 弱点の修正は非公開で行う。Issue や公開の PR に書かず、非公開のセキュリティアドバイザリ (private fork) で直し、本番に入れてから公開する。手順は `SECURITY.md`
- 入れてよいデータは ADR-0006 の「public のリポジトリに入れてよいもの」に従う (クレデンシャルと運営者以外の人のデータは入れない。テストの画像はテストの中で作る)

## Consequences

### 良い点

- CI の時間が org の上限を使わない。PR のたびに E2E まで回せる
- accounts・platform・editor と同じ運用 (gitleaks、再利用ワークフロー、非公開の報告) がそのまま使える

### 悪い点・受け入れるリスク

- 攻撃する人もコードを読める。守る側も読める (Dependabot、CodeQL)。弱点をすぐ直せる体制と、非公開で直す手順で受ける
- うっかり入れたシークレットがそのまま公開される。pre-commit と CI の gitleaks で防ぎ、入ったら消すより先に鍵を作り直す
- 管理画面と通報の処理もコードが見える。管理の権限は認可で守り、画面の存在を隠すことには頼らない

### 追従して必要になること

- 骨組み (S2) で、pre-commit と CI に gitleaks を入れる (lumorphia/platform の `security.yml`)
- E2E は PR で回す。Prismtone のようにリリース PR だけに絞らない
- 外からの貢献を受け入れる前に CLA を用意する (受け入れないなら CONTRIBUTING に書く。ADR-0006 と同じ)

## Alternatives

- private にする (Prismtone と同じ): CI のすべてが org の 2000 分を食い、E2E をリリース PR に絞っても足りなくなる見込みが高い。隠して守れるものも無い
- public にして、管理画面と通報の処理だけを別の private リポジトリに分ける: 隠して強くなるものではなく、リポジトリと CI が増えるだけ

## References

- ADR-0002、ADR-0004、ADR-0006
- lumorphia/accounts ADR-0002
- lumorphia/platform `AGENTS.md` (入れてよいデータ)
