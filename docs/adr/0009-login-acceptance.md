# ADR-0009: Lumorphia でログインした人の受け入れ方とログアウト

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-12 |
| Deciders | t1nyb0x    |

## Context

ログインは Lumorphia アカウントで行う (ADR-0005)。Prismtone は A2 で同じ受け口を作り、`@lumorphia/auth-client` を Better Auth の `genericOAuth` に渡す形で本番に出した (prismtone ADR-0052・0054・0055・0062)。Prismtone には旧ログインと引き継ぎがあり、その分だけ判断が多い。Scenote は最初から Lumorphia だけなので、同じ形から旧ログインに関わるものを除いて写す。

## Decision

### ログイン

- `/login` は開いたらすぐ accounts の認可へ 302 で進む (prismtone ADR-0062)。`/login?error=<理由>` のときだけ、エラーと「Lumorphia アカウントでログイン」のボタンを出す
- Better Auth の `genericOAuth` に `createLumorphiaOAuthConfig` を渡す。scope は `openid profile email`。キャラクター (`lumorphia:characters`) は使う機能ができたときに足す
- `users.lumorphia_sub` (必須・一意) で Lumorphia の利用者と結び付ける。Scenote にほかのログイン方法は無い
- **メールアドレスは置き換える**。`users.email` は `<sub>@lumorphia.placeholder.invalid` にし、本物は保存しない (Better Auth が email を必須にするため。prismtone ADR-0054)
- `LUMORPHIA_*` が揃っていないときは、ログインを出さない (開発で accounts を立てないとき)

### handle・表示名・アイコン

- **Lumorphia を正とし、Scenote の値はログインのたびに書き換える写し** (prismtone ADR-0052)。Scenote の画面からは変えない
- **handle がほかの Scenote 利用者の写しと重なったら、新しくログインした人に handle を渡し、古い写しを持っていた人の handle は仮の値 (`u_` + ランダム) にする**。accounts の handle は一意なので、重なるのは古い写し (handle を変えてからまだ Scenote に来ていない人) の側。その人は次のログインで正しい handle に戻る。Prismtone の「新しい人のログインを止めて運営に知らせる」は、旧 handle の台帳と予約がある Prismtone の事情で、Scenote には要らない
- ほかの人の画面の名前とアイコンが、本人が次にログインするまで古いまま残ることは受け入れる (prismtone ADR-0052。正式リリース後に accounts の「プロフィールが変わった」知らせで解消する)

### セッションとログアウト (prismtone ADR-0055 と同じ)

- セッションは 30 日。Lumorphia の `sid` と、そのログインの ID トークンをセッションに持つ
- **Scenote からのログアウト** (`POST /api/lumorphia/logout`): Scenote のセッションを終えてから accounts の end-session の URL を返す。`id_token_hint` はそのセッションの ID トークン。`state` は 10 分の使い切りで、戻り先 (`GET /api/lumorphia/signed-out`) で照合する
- **back-channel logout** (`POST /api/lumorphia/backchannel-logout`): auth-client の受け口で確かめ、`sub` と `sid` が合うセッションだけを消す。`jti` を記録して同じ知らせを 2 回当てない。CSRF の Origin 確認からは外し、署名で守る
- 退会の知らせ (`POST /api/lumorphia/account-events`) は ADR-0010

### 規約の同意

- Scenote の規約とプライバシーポリシーは S7 で作る。それまでは同意の画面を置かない。S7 で `@lumorphia/legal` の同意の版を持たせ、同意していない人 (S7 より前にログインした人を含む) を同意の画面に送る
- 公開まで、Scenote は運営者だけが使う

## Consequences

### 良い点

- Prismtone で本番に出た形をそのまま使うので、accounts との組み合わせで起きた問題 (ID トークンの email、back-channel logout の CA) をもう一度踏まない
- handle の重なりで、新しく来た人が締め出されない

### 悪い点・受け入れるリスク

- 古い写しを持っていた人の利用者ページの URL が、次のログインまで仮の handle になる。その人の投稿の URL は ID なので変わらない
- S7 まで規約の同意が無い。公開前で運営者しか使わないので受け入れる

### 追従して必要になること

- accounts に Scenote のクライアントを登録する (開発と本番。redirect URI は `{AUTH_BASE_URL}/api/auth/callback/lumorphia`、post-logout は `/api/lumorphia/signed-out`、back-channel logout は `/api/lumorphia/backchannel-logout`、退会の知らせは `/api/lumorphia/account-events`)
- E2E は `@lumorphia/e2e` の偽の発行元で回す (platform ADR-0010)

## Alternatives

- Prismtone と同じく、handle が重なったら新しい人のログインを止める: 古い写しの人が Scenote に戻らない限り、新しい人は入れない
- handle を写さず、Scenote の URL を Lumorphia の sub にする: URL が読めなくなり、Prismtone と揃わない

## References

- ADR-0005、ADR-0008
- lumorphia/prismtone ADR-0052、ADR-0054、ADR-0055、ADR-0062
- lumorphia/platform ADR-0005、ADR-0010
- lumorphia/accounts `docs/runbook/oidc.md`
