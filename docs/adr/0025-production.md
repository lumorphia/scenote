# ADR-0025: 本番は accounts と同じ形で、同じ VPS に分けて置き、リリースのときだけイメージを出す

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-18 |
| Deciders | t1nyb0x    |

## Context

lumorphia/accounts は 2026-10-11 に、lumorphia/prismtone と同じ VPS で公開した。80/443 は Prismtone の Caddy が受け、共有のネットワーク `lumorphia-edge` で各サービスへ流す。リリースは release-please で作り、リリースのときだけイメージを公開し、サービスごとの doco-cd が `latest` を入れ替える (accounts の ADR-0016)。バックアップ・隔離した復元試験・滞留の通知のスクリプトも、実際に動かして直してある。

Scenote のイメージは ADR-0024 で作った。

## Decision

accounts の形をそのまま写し、名前を `scenote` にする。

- `compose.prod.yaml`: postgres・migrate・web・worker・backup。web は `lumorphia-edge` に `scenote-web` として出る。ホストにポートを出さない。イメージは `${SCENOTE_TAG:-latest}`
- Caddy は Prismtone のもの。`docker/Caddyfile.scenote` を `scenote.caddy` として読ませる。証明書と `cloudflare_only` は Prismtone のもの
- CI: PR でイメージと本番の compose の構文を確かめる。main への push で release-please がリリース PR を開き、そのマージでできたリリースのときだけ app と backup のイメージを `sha-…` で上げ、`vX.Y.Z` と `latest` を付ける
- doco-cd は Scenote 専用 (`doco-cd-scenote`)。外から入る口は作らない
- バックアップ: 専用の非公開バケットに 1 日 1 回、30 日で消す。復元試験は別の project の tmpfs の DB で、`DATABASE_URL` が復元先を指していなければ止まる
- 監視: 外は Uptime Kuma で health と管理画面の 302。中は cron の `notify.sh` が、処理の滞留 (worker の停止を含む) と、運営の確認待ち (保留・要確認・通報が 24 時間) とバックアップの遅れを Discord に知らせる
- R2 の投稿画像のバケットは Scenote 専用。ブラウザからの PUT のために CORS を設定し、カスタムドメインでは Cloudflare の WAF のルールで `private/` と `tmp/` を拒む (ADR-0012 で S7 に回したもの。別のバケットに分ける案は採らない)
- 公開前は全体を Cloudflare Access の内側に置き、`/api/health` と accounts からの知らせの口 (サーバー間で、署名で守られている) だけを Bypass にする。`/admin` と `/api/admin` は公開の後も Access の内側 (ADR-0019)
- 手順は `docs/runbook/` (deploy・backup・monitoring・release)

## Consequences

### 良い点

- 1 度動かして直した手順を使うので、本番で詰まるところが少ない
- 3 つのサービスが同じ形なので、運用を 1 つ覚えればよい

### 悪い点・受け入れるリスク

- health は DB だけを見て、worker の停止は滞留の通知 (最大 15 分と 5 分の間隔) でしか分からない
- 配信元の WAF のルールを外すと、`private/` が推測できないキーだけで守られる状態に戻る。release.md で確かめる
- DB を古い時点に戻すと、画像と行がずれる (backup.md)

## Alternatives

- 非公開の画像を別のバケットに置く: 配信元のルールが要らないが、公開範囲を変えるたびにバケットをまたいで移すことになる
- worker の心拍を health に入れる (accounts の形): 今は滞留の通知で足りるとし、要るとわかったら足す

## References

- ADR-0012、ADR-0019、ADR-0024
- lumorphia/accounts の ADR-0016、`docs/runbook/`
- lumorphia/prismtone の `docs/runbook/deploy.md` (R2 の CORS)
