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

1. accounts の手元の環境を立て、運営者を管理者にする (accounts の `docs/runbook/oidc.md`)
2. accounts のリポジトリで、上の開発の設定ファイルを渡して登録する。出力 (`credentials.json`) は秘密を含むので 0600 のファイルにする
3. Scenote の `.env` に `LUMORPHIA_ISSUER`・`LUMORPHIA_CLIENT_ID`・`LUMORPHIA_CLIENT_SECRET` を入れる。サーバーが accounts の開発の証明書を信頼できるよう、`NODE_EXTRA_CA_CERTS` に accounts の `.data/tls/ca.pem` を入れる
4. accounts からの back-channel logout が Scenote に届くよう、accounts の開発サーバーにも Scenote の開発の CA (`scenote/.data/tls/ca.pem`) を信頼させる。`NODE_EXTRA_CA_CERTS` は 1 つのファイルしか受けないので、accounts と Scenote の CA をつないだファイルを渡す
5. `docker compose up -d` と `pnpm --filter @lumorphia-scenote/app dev` で `https://scenote.lumorphia.test:8445/login` を開く
