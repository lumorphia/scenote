# ADR-0001: ADR を用いて設計判断を記録する

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-06 |
| Deciders | t1nyb0x    |

## Context

Scenote は Lumorphia の 2 つ目のサービスで、lumorphia/prismtone の構成と判断を多く引き継ぐ。どれを引き継ぎ、どこを変えたかが後から追えないと、共通化の判断 (ADR-0006) ができない。

## Decision

設計上の重要な判断は ADR として `docs/adr/` に記録する。prismtone、editor と同じ運用にする。

- 形式は `0000-template.md` に従う
- ファイル名は `NNNN-kebab-case-title.md`、番号は通し番号で欠番を作らない
- 一度 Accepted にした ADR は書き換えず、覆す場合は新しい ADR を作り、旧 ADR の Status を `Superseded by ADR-NNNN` にする
- 「重要な判断」の目安: 変更に 1 日以上かかる、利用者のデータの扱いが変わる、外部サービスへの依存が増減する、prismtone と違う判断をする、のいずれか
- prismtone の判断をそのまま引き継ぐものはコピーせず、prismtone の ADR 番号を参照する

## Consequences

### 良い点

- prismtone との違いが ADR の一覧で分かる

### 悪い点・受け入れるリスク

- 記録の手間が増える。上記の目安で線を引く

## Alternatives

- prismtone の ADR を全部コピーする: 装備・外部 API など Scenote に関係しないものが混ざり、どれが効いているか分からなくなる

## References

- lumorphia/prismtone `docs/adr/0001-record-architecture-decisions.md`
- lumorphia/editor `docs/adr/0001-record-architecture-decisions.md`
