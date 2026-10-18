# バックアップと復元

Scenote 専用の非公開 R2 バケット (`lumorphia-scenote-backups`) と専用の認証で、1 日ごとに PostgreSQL 18 の `pg_dump -Fc` を保存する。形は lumorphia/accounts の [backup.md](https://github.com/lumorphia/accounts/blob/main/docs/runbook/backup.md) と同じ。バケットの `pg/` に 30 日で消える lifecycle rule を設定する (プライバシーポリシー §6)。

画像 (R2 の投稿の派生画像) はバックアップしない。原本を持たない決め (ADR-0003) と同じく、R2 の耐久性に任せる。DB を古い時点に戻すと、その後に作った画像は行の無い孤児になり、その後に消した投稿は行だけが戻って画像が無くなる (§本当の障害からの復元)。

## バックアップ

compose の `backup` が、起動のときと 24 時間ごとに 1 回取る。完成した dump だけを送り、終わったら一時ファイルを消す。DB の生のエラーや認証をログに出さない。

```sh
dc run --rm backup once
dc run --rm backup list
```

完了のログだけでは済ませず、リモートの新しいオブジェクトを確かめる (監視は [monitoring.md](monitoring.md) の `notify.sh backup`)。dump は利用者のデータと同じく機密として扱い、GitHub・PR・会話に貼らない。`AUTH_SECRET` は別の安全な場所に控える。

## 隔離した復元試験

公開の前と、その後の定期の試験で行う。本番の版 (`APP_VERSION`)・dump の時刻・件数だけを非公開の運用記録に残す。

```sh
rt() { docker compose --env-file .env.production -p scenote-restore-test -f compose.restore-test.yaml "$@"; }
rt run --rm counts
rt logs --no-log-prefix restore migrate
rt down -v
```

- `restore-db` は project `scenote-restore-test` の PostgreSQL 18。データは tmpfs で、外に出ない internal の network だけに置く。公開の Caddy・本番の DB・本番の R2 の投稿画像・Lumorphia には繋がない
- `restore` は `.env.backup` の認証で最新の dump を取り出し (`RESTORE_KEY=pg/<時刻>.dump` で指定もできる)、`pg_restore --no-owner --no-acl --exit-on-error` で戻す。`DATABASE_URL` が `restore-db` を指していなければ止まる
- `migrate` は本番と同じ版の app のイメージでマイグレーションを当てる。`.env.production` は読まない
- `counts` は、状態ごとの利用者・同意した人・セッション・状態と公開範囲ごとの投稿・タグ・地名・対応待ちの通報・NG 語・運営の記録・知らせの記録の件数だけを出す。ID・handle・本文・画像のキーは出さない。本番の件数と比べ、運用記録に写す
- `up --abort-on-container-exit` は使わない (accounts の backup.md と同じ理由)。`run --rm counts` が依存を順に待つ
- `--env-file .env.production` は、本番を前の版に戻しているときの `SCENOTE_TAG` を読むためだけ。どのサービスにも本番の env は渡さない

失敗したら `rt down -v` で作り直してやり直す。

2026-10-18 に、手元でダンプ → 隔離した DB への `restore-file` → `counts` が通ること、`DATABASE_URL` が本番の DB (`postgres`) を指すと止まることを確かめた。R2 からの取り出しは、本番の最初の試験で確かめる。

## 本当の障害からの復元

1. 新しいアクセスを止める (Cloudflare Access で運営者だけにする)。worker を止める (`dc stop worker`)
2. 残っている DB を、可能なら退避する。バックアップの後の退会・削除・通報・運営の操作の記録も退避する
3. 承認した dump を、同じ `AUTH_SECRET` で復元する。マイグレーションを当てる
4. 全てのセッションを消す (`DELETE FROM sessions`)。過去のログインを戻さない
5. バックアップの後に消した投稿が行だけ戻っていないかを、退避した記録と運営の記録で照らす。戻っていれば消し直す (画像は無いので、行と一緒に `image-delete` を入れる)。退会の知らせは accounts が送り直す (ADR-0010 の revision で古いものは当たらない)
6. health・トップ・ログイン・投稿・管理画面を確かめてから、アクセスの制限を外す。worker を戻す

照らせないものがあれば制限を続け、運営者が扱いを決めてから再開する。
