# 監視と止まったときの対応

形は lumorphia/accounts の [monitoring.md](https://github.com/lumorphia/accounts/blob/main/docs/runbook/monitoring.md) と同じ。

## 外からの監視

VPS の外の Uptime Kuma に足す。

| 対象                                                     | 間隔  | 期待                                                                            |
| -------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `https://scenote.lumorphia.com/api/health`               | 60 秒 | 200 と `"ok":true`。3 回続けて失敗したら通知                                    |
| `https://scenote.lumorphia.com/` と `/terms`             | 5 分  | 200 (SSR)。公開の後に足す                                                       |
| `https://scenote.lumorphia.com/admin` と `/api/admin/me` | 5 分  | Access のログインへの 302。200 や 404 なら Access の設定が外れている (ADR-0019) |
| 証明書                                                   | —     | 期限の 14 日前に通知                                                            |

`/api/health` は DB だけを見る。worker の停止は health に出ないので、下の滞留 (`processing`・`jobs_waiting`) で拾う。

公開前 (全体が Access の内側) は、`/api/health` だけ Bypass の application で通す ([deploy.md](deploy.md) §5)。

## 処理の滞留と運営の確認待ち

`docker/monitor/notify.sh` を VPS の cron で回す。`backlog.sh` が `backlog.sql` を流し、0 でない項目があれば Discord に知らせる。同じ知らせは 1 時間に 1 回、直ったら「復旧しました」を 1 回。利用者の ID・handle・本文・画像のキーは送らない。

| 項目              | 意味                                              | 見るところ                                                        |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `processing`      | 派生画像を作っている途中のまま 15 分              | worker が動いているか (`dc ps`、`dc logs worker`)、判定器のメモリ |
| `jobs_waiting`    | 走るはずの時刻を 15 分過ぎたジョブ                | 同上                                                              |
| `jobs_failed`     | 直近 1 日にやり直しを使い切ったジョブ             | `dc logs worker` と Sentry                                        |
| `uploads`         | 期限を過ぎた受け取りの枠が 2 時間掃除されていない | 毎時の `upload-cleanup`                                           |
| `purges`          | 退会から 30 日と 1 時間を過ぎて残っている人       | accounts からの `purged` の配送 (accounts の監視)                 |
| `held`・`flagged` | 運営の確認待ちが 24 時間を過ぎた                  | 管理画面の「確認待ち」                                            |
| `reports`         | 対応待ちの通報が 24 時間を過ぎた                  | 管理画面の「通報」                                                |

`notify.sh` と `docker/monitor/` を、承認した sha のものと同じ相対パスで置き場所に写す。既定の置き場所は `/srv/scenote` なので、違うときは `SCENOTE_ROOT` で渡す。webhook は運営の通知チャンネルのもの (Prismtone・accounts と同じでよい) を、置き場所の `.env.monitor` (権限 600、`DISCORD_WEBHOOK_URL=...` の 1 行) に置く。

```sh
SCENOTE_ROOT=/home/<user>/srv/scenote
*/5 * * * * SCENOTE_ROOT=$SCENOTE_ROOT $SCENOTE_ROOT/docker/monitor/notify.sh backlog >> $HOME/scenote-monitor.log 2>&1
17 * * * * SCENOTE_ROOT=$SCENOTE_ROOT $SCENOTE_ROOT/docker/monitor/notify.sh backup >> $HOME/scenote-monitor.log 2>&1
```

手で試すときは cron と同じ行を流す。`REPEAT_SECONDS=0` で抑えを外せる。

## バックアップとリソース

`notify.sh backup` が、非公開のバケットの最新の dump が 26 時間より古ければ知らせる。backup のコンテナが生きているだけで成功とは扱わない。

VPS の CPU・メモリ・ディスクは Prismtone の監視に Scenote のコンテナを含める。worker は判定器のモデルを読むので、メモリを多めに使う (起動の後に `docker stats` で確かめて、目安を運用記録に残す)。ログは Docker の 10 MB × 3 本。

## Sentry

DSN は、IP の保存を無効にし、保存期間 (プライバシーポリシーの 30 日) と合っていることを確かめてから設定する。Replay は不具合が起きたときだけで、文字・入力・画像を伏せる (プライバシーポリシー §1)。本番の試験で伏せられていることを確かめる。

## 対応の順序

外の監視が失敗したら、DNS / Cloudflare / Caddy、`dc ps`、DB、worker、滞留の順に見る。ジョブを消して正常に見せない。画像の配信 (R2) の問題は、Cloudflare の R2 のダッシュボードと、配信元のルール (`private/` を拒むもの) を見る。
