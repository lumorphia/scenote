# 本番の起動と更新

同じ VPS の lumorphia/prismtone・lumorphia/accounts と、DB・ボリューム・Compose project を分ける (ADR-0025)。形は accounts の [deploy.md](https://github.com/lumorphia/accounts/blob/main/docs/runbook/deploy.md) と同じで、2026-10 に accounts で実際に動かして直した手順を写している。公開の判断は [release.md](release.md)。

## 1. 配置と秘密

VPS の置き場所 (2026-10 の accounts は `~/srv/accounts`。Scenote は `~/srv/scenote` を想定) に、main の `compose.prod.yaml`・`compose.restore-test.yaml`・`docker/monitor/` を置く (doco-cd に登録したあとは doco-cd が compose を取ってくる)。Node のホストインストールは要らない。

`.env.production.example` と `.env.backup.example` から `.env.production` と `.env.backup` を作り、`REPLACE_WITH` を全て置き換える。

- `POSTGRES_PASSWORD` と `DATABASE_URL` の値をそろえる。URL に入れても安全なランダムな文字列にする
- `AUTH_SECRET` は `openssl rand -base64 48`。Prismtone・accounts の値を流用しない。復元のときも同じ値を使うので、別の安全な場所にも控える
- `ADMIN_SUBS` に運営者の Lumorphia の sub を入れる (ADR-0019)
- `IMAGE_MODERATION=onnx` (本番は onnx でないと worker が起動しない。ADR-0014)
- `DEV_TLS_*`・`JOBS_INLINE`・`API_RATE_LIMIT_DISABLED`・`STORAGE_DRIVER=fs|memory` を持ち込まない
- 権限: doco-cd が読むので、グループを root にして `640` (accounts の deploy.md §4 の理由と同じ)

```sh
sudo chgrp root ~/srv/scenote/.env.production ~/srv/scenote/.env.backup
chmod 640 ~/srv/scenote/.env.production ~/srv/scenote/.env.backup
```

秘密を GitHub・PR・テストのログ・会話に貼らない。`docker compose config` は秘密を全部出すので、確かめるときは `--quiet` を付ける。

## 2. Lumorphia アカウントのクライアント

本番の accounts に Scenote のクライアントを登録する。値は [lumorphia-client.md](lumorphia-client.md) の「本番」の節 (redirect URI・back-channel logout・退会の知らせの宛先) のとおり。ID と secret を `.env.production` の `LUMORPHIA_*` に入れる。

## 3. R2 (投稿の画像とバックアップ)

Prismtone・accounts とバケットも認証も分ける。

| バケット                    | 用途                                                        | 認証                       | 公開                                            |
| --------------------------- | ----------------------------------------------------------- | -------------------------- | ----------------------------------------------- |
| `lumorphia-scenote-images`  | 投稿の派生画像 (`posts/`・`private/`) と一時置き場 (`tmp/`) | このバケットだけの読み書き | カスタムドメイン `scenote-images.lumorphia.com` |
| `lumorphia-scenote-backups` | `pg/` の dump                                               | このバケットだけの読み書き | 非公開。`pg/` を 30 日で消す lifecycle rule     |

画像のバケットの CORS (ブラウザが署名付き URL で直接 PUT するので、無いと投稿で CORS エラーになる。Prismtone の deploy.md §3 と同じ):

```json
[
  {
    "AllowedOrigins": ["https://scenote.lumorphia.com"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**配信元で `private/` と `tmp/` を拒む** (ADR-0012)。R2 のカスタムドメインはバケット全体を配るので、非公開・確認中・非表示の投稿の画像 (`private/`) と受け取ったばかりの画像 (`tmp/`) も、キーを知っていれば読めてしまう。Cloudflare の WAF の Custom rules で Block する:

```
(http.host eq "scenote-images.lumorphia.com" and (starts_with(http.request.uri.path, "/private/") or starts_with(http.request.uri.path, "/tmp/")))
```

確かめ方: 投稿を非公開にしたあと、`/api/posts/<id>` が返す中継ではなく、R2 のキー (`private/<id>/...`) を直接 `curl -I https://scenote-images.lumorphia.com/private/...` して 403 になること。

## 4. 入口 (lumorphia/edge)

80/443 を持つ Caddy は [lumorphia/edge](https://github.com/lumorphia/edge) の 1 つだけ。全サービスのサイトは edge の `Caddyfile` にまとめてあり、Scenote のサイト (`scenote.lumorphia.com` → `scenote-web:3200`) も入っている (edge の ADR-0001)。Scenote の側で Caddy の設定を置く手順は無い。

- 共有のネットワーク `lumorphia-edge`。Scenote の web はそこに `scenote-web` として出る (`compose.prod.yaml`)
- 証明書 (Origin CA の 1 枚、`*.lumorphia.com`) と、Cloudflare の IP だけを受ける決まりも edge にある
- Scenote の web が起動するまで、edge は `scenote.lumorphia.com` に 502 を返す (ほかのドメインには響かない)
- Cloudflare の DNS: `scenote.lumorphia.com` を proxy (オレンジ) で VPS に、SSL は Full (strict)
- **env を変えたら doco-cd も作り直す**。doco-cd は env ファイルを自分のコンテナを作ったときにしか読まない (2026-10-11 の Prismtone の障害)

## 5. 公開前の Cloudflare Access

公開を決めるまでは、`scenote.lumorphia.com` 全体を Access (Zero Trust の Self-hosted application、運営者のメールだけ Allow) の内側に置く。次のパスは、それぞれ別の application (パスが具体的なものが優先) で **Bypass / Everyone** にする。Bypass の policy を application に付けるのを忘れない。全体の application に Bypass を付けると全部が開く (2026-10-11 の accounts で数分起きた)。

| パス                                | 理由                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `/api/health`                       | 外の監視                                                           |
| `/api/lumorphia/backchannel-logout` | accounts からのログアウトの知らせ (サーバー間。署名で守られている) |
| `/api/lumorphia/account-events`     | accounts からの退会・復旧・削除の知らせ (同上)                     |

`/admin` と `/api/admin` は公開の後も Access の内側のまま (ADR-0019)。公開で全体の application を外すときに、この 2 つの application を残す。外から `/admin` と `/api/admin/me` が Access のログインへの 302 であることを監視する ([monitoring.md](monitoring.md))。

## 6. リリースとイメージ

リリースは release-please で作る (ADR-0025、accounts の ADR-0016 と同じ)。main への push で release-please がリリース PR を開き直す。運営者がそれをマージすると `vX.Y.Z` のタグができ、CI の `publish` が app と backup のイメージを `sha-<コミット>` で上げ、両方できてから `vX.Y.Z` と `latest` を付ける。develop や main へのマージだけではイメージを作らない。

本番の compose は `${SCENOTE_TAG:-latest}`。本番の版はコンテナの `APP_VERSION` で確かめる。

```sh
dc() { docker compose --env-file .env.production -f compose.prod.yaml "$@"; }
dc config --quiet
docker exec scenote-web-1 printenv APP_VERSION
```

起動の順は postgres (healthy) → migrate (完了) → web と worker。worker は web の healthy を待たない。

**最初の 1 回だけ**、撮影場所の候補を入れる (worker の週 1 回の同期を待たない。ADR-0013):

```sh
dc run --rm worker node ./server/sync-places.ts
```

## 7. doco-cd (自動デプロイ)

Scenote 専用の doco-cd が main を 5 分ごとに見て、`.doco-cd.yml` に従って `compose.prod.yaml` を入れ替える。手順は accounts の deploy.md §4 と同じで、名前を `doco-cd-scenote`、置き場所を `~/srv/scenote`、変数を `SCENOTE_*` に読み替える。

1. 最初のリリースが出て、GHCR に `ghcr.io/lumorphia/scenote-app:latest` と `scenote-backup:latest` があることを確かめる (accounts の deploy.md §4 の 1 の `manifest inspect`)
2. `.env.production` から `SCENOTE_TAG` の行を消す
3. `docker/doco-cd/compose.yaml` を VPS の `~/srv/doco-cd-scenote/compose.yaml` に写し、「ホスト」と書いたパスを実際の場所に書き換える。GHCR の認証は Prismtone の doco-cd の `docker-config.json` を使う。Scenote のパッケージ (`scenote-app`・`scenote-backup`) にその PAT で読める権限があることを確かめる
4. `docker compose -f ~/srv/doco-cd-scenote/compose.yaml up -d`、`docker logs -f doco-cd-scenote` で `job completed successfully` を待つ
5. `APP_VERSION` がリリースの版で、`/api/health` が 200 なことを確かめる

## 8. 更新と戻し方

更新はリリース PR のマージで行う。DB の変更を含むリリースの前に `dc run --rm backup once` を成功させ、時刻と版を運用記録に残す。入れ替わったら、外から health、トップ、ログイン、投稿 (派生画像と判定まで)、管理画面を確かめる。

DB の変更は自動で戻さない。互換性があると確かめた前の版にだけ戻す。戻すときは `.env.production` に `SCENOTE_TAG=vX.Y.Z` を書いて `docker restart doco-cd-scenote`。直したリリースが出たら行を消して、もう一度 doco-cd を再起動する。DB の障害は新しいアクセスを止め、[復元](backup.md)する。`down -v` は使わない。Prismtone・accounts の project やボリュームは触らない。
