# Lumorphia アカウントにクライアントを登録する

Scenote は Lumorphia アカウントの OIDC の利用側 (ADR-0005、ADR-0009)。accounts にクライアントを登録し、`client_id` と `client_secret` を Scenote の環境変数に入れる。登録のしかた (運営者の Cookie、出力の扱い) は lumorphia/accounts の `docs/runbook/oidc.md` に従う。

## 設定ファイル

秘密は含まない。`service` は `scenote` (accounts が `metadata.lumorphia_service` に入れ、退会の知らせの宛先を見分ける)。

開発 (手元の accounts、`https://accounts.lumorphia.test:8443`):

```json
{
  "service": "scenote",
  "redirectUri": "https://scenote.lumorphia.test:8445/api/auth/callback/lumorphia",
  "postLogoutRedirectUri": "https://scenote.lumorphia.test:8445/api/lumorphia/signed-out",
  "backchannelLogoutUri": "https://scenote.lumorphia.test:8445/api/lumorphia/backchannel-logout",
  "lifecycleUri": "https://scenote.lumorphia.test:8445/api/lumorphia/account-events"
}
```

本番 (S7 で):

```json
{
  "service": "scenote",
  "redirectUri": "https://scenote.lumorphia.com/api/auth/callback/lumorphia",
  "postLogoutRedirectUri": "https://scenote.lumorphia.com/api/lumorphia/signed-out",
  "backchannelLogoutUri": "https://scenote.lumorphia.com/api/lumorphia/backchannel-logout",
  "lifecycleUri": "https://scenote.lumorphia.com/api/lumorphia/account-events"
}
```

退会の知らせ (`lifecycleUri`) は ADR-0010 で受ける。accounts の `FEATURE_ACCOUNT_LIFECYCLE=1` のときに送られる。

## 手元で accounts とつなぐ

1. hosts に `127.0.0.1 scenote.lumorphia.test` を足す。accounts のサーバーが back-channel logout と退会の知らせを送るときに要る (ブラウザだけでは足りない)。WSL の `/etc/hosts` は Windows の hosts から作られるので、Windows 側にも書く
2. accounts の手元の環境を立て、運営者を管理者にする (accounts の `docs/runbook/oidc.md`)。手元では、開発用ログイン (`POST /api/auth/dev/login`) で入った管理者のセッションでもよい
3. accounts のリポジトリで、上の開発の設定ファイルを渡して登録する。出力は秘密を含むので 0600 のファイルにする (例: `scenote/.data/lumorphia-credentials.json`。`.data/` は git に入らない)
4. Scenote の `.env` に `LUMORPHIA_ISSUER` (`https://accounts.lumorphia.test:8443/api/auth`)・`LUMORPHIA_CLIENT_ID`・`LUMORPHIA_CLIENT_SECRET` を入れる
5. accounts と Scenote の開発の CA をつないだファイルを作る。`NODE_EXTRA_CA_CERTS` は 1 つのファイルしか受けず、両方のサーバーが相手の証明書を信頼する必要がある

   ```sh
   (umask 077 && cat ../accounts/.data/tls/ca.pem .data/tls/ca.pem > .data/tls/lumorphia-dev-cas.pem)
   ```

6. accounts の開発サーバーと退会の worker を、このファイルと `FEATURE_ACCOUNT_LIFECYCLE=1` で動かす。`NODE_EXTRA_CA_CERTS` は起動のときにしか読まれないので、`.env` ではなくコマンドの前に付ける (開発サーバーは Vite が `.env` を読む前に Node が起動している)

   ```sh
   FEATURE_ACCOUNT_LIFECYCLE=1 NODE_EXTRA_CA_CERTS=$PWD/../scenote/.data/tls/lumorphia-dev-cas.pem pnpm --filter @lumorphia-accounts/app dev
   FEATURE_ACCOUNT_LIFECYCLE=1 NODE_EXTRA_CA_CERTS=$PWD/../scenote/.data/tls/lumorphia-dev-cas.pem pnpm worker:accounts
   ```

7. Scenote も同じファイルを付けて起動し、`https://scenote.lumorphia.test:8445/login` を開く

   ```sh
   docker compose up -d
   NODE_EXTRA_CA_CERTS=$PWD/.data/tls/lumorphia-dev-cas.pem pnpm --filter @lumorphia-scenote/app dev
   ```
