# 公開の判断

公開する前に、下の項目を本番で確かめて埋める (S7f。lumorphia/prismtone の `docs/ops/launch-checklist.md` と accounts の release.md の形)。実測の時刻・承認者・対象の SHA と合否は、秘密や利用者のデータを含めずに、非公開の運用記録に残す。未確認を「済み」にしない。全部確かめて運営者が承認してから、Cloudflare Access の全体の application を外す (`/admin`・`/api/admin` は残す)。

## 公開を決める前に確かめるもの

- 承認する main の SHA と、同じ sha の app / backup のイメージ。`APP_VERSION` が一致する
- 規約 1.0・ポリシー 1.0 の本文と、実際の設定 (Cloudflare・Sentry・R2・Lumorphia) が一致すること。**公開の日に `docs/legal/*.md` の `updatedAt` を公開日に直す** (中身は変わらないので版は 1.0 のまま)
- `/contact` が動き、問い合わせが Google フォームに届く (S7d-2)
- HTTPS、Cloudflare Full (strict) と直通の拒否、`CLIENT_IP_HEADER`、Prismtone・accounts に影響が無いこと
- 本物の accounts でのログイン・ログアウト (back-channel logout を含む)、初回の同意と 15 歳以上の確認、退会の知らせ (deleted → 復旧 → purged)
- 投稿の一連: 現像 → 投稿 → 派生画像 → 本物の判定器 (`onnx`) での判定 → 公開。保留になる画像で、管理画面の確認待ちから公開・非表示
- 公開範囲: 非公開の画像が本人にだけ中継で返り、`private/` と `tmp/` が配信元で 403 (deploy.md §3)。限定公開が一覧に出ない
- OGP: X などに URL を貼って、写真が大きく出る。非公開と保留では出ない
- 通報・非表示・戻す・NG 語の辞書。管理画面の操作が記録に残る
- 管理画面: Access の 302 と、`ADMIN_SUBS` にいない人の 404
- 日次のバックアップと 30 日の削除、R2 から取り出しての隔離した復元試験 ([backup.md](backup.md))
- 外の監視、滞留と確認待ちとバックアップの通知 (一度わざと worker を止めて、`processing` の通知と復旧を確かめる)、Sentry の伏せ字と保存期間
- VPS の容量 (worker のメモリ)、R2 の使用量
- CSP は公開の最初の 1 週間は `CSP_REPORT_ONLY=1` で違反を集め、なければ 0 に戻す
