# ADR-0027: 問い合わせは Lumorphia で共通の Google フォームへ、自前の画面から送る

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-18 |
| Deciders | t1nyb0x    |

## Context

規約は、Lumorphia アカウントの無い人の通報、非表示への申し出、権利者からの依頼を `/contact` で受けるとしている (規約の 6・7、ADR-0021、ADR-0023)。プライバシーポリシーは、問い合わせの内容を Google フォームが受け取ると書いている。lumorphia/prismtone は、Google フォームの `formResponse` へ自前の画面から直接 POST する問い合わせを持っている (サーバーもメールも持たない)。

## Decision

- 問い合わせは Prismtone と同じ Google フォームで受ける (相棒の判断)。フォームには、どのサービスへの問い合わせかを選ぶ必須の欄 (`entry.2074387887`、選択肢 Lumorphia / Prismtone / Scenote) を相棒が足した。Scenote からは常に `Scenote` を送る
- 画面と送り方は Prismtone の `features/contact/google-form.ts` と `routes/contact.tsx` を写す。種別・名前 (任意)・メールアドレス (任意)・内容、ブラウザの外でも効く入力の検証、隠し欄 (honeypot) と同じブラウザから 1 分に 1 通の制限。`no-cors` で送るので届いたかは分からず、ネットワークの失敗のときだけ Google フォームそのものを開いてもらう。そのリンクは事前入力の URL (`viewform?usp=pp_url&entry.2074387887=Scenote`) で、Scenote が選ばれた状態で開く
- CSP の `connect-src` に `https://docs.google.com` を足す。`form-action` は `'self'` のまま (画面の form は送らず、fetch で送る)
- ログインも同意も要らない。同意していない人も規約について尋ねられるよう、同意の画面へ送らないページに入れる
- entry 番号は公開されているフォームの HTML (`FB_PUBLIC_LOAD_DATA_`) から取る。フォームの項目を変えたら、Prismtone と Scenote の両方を直す

## Consequences

### 良い点

- サーバーにもメールにも、問い合わせのための仕組みが増えない。運営者は 1 つのシートで全サービスの問い合わせを見られる
- Prismtone と同じ形なので、片方で直したことをもう片方に写しやすい

### 悪い点

- 写したコードが 2 か所にある。3 つ目のサービスが同じものを持つときは、`@lumorphia/*` のパッケージにまとめる
- フォームに必須の欄が増えると、古い画面からの問い合わせは Google に断られ、利用者には「送信しました」と見えたまま届かない (2026-10-18 に Prismtone で起きかけた、lumorphia/prismtone#465)。フォームの項目を変えるときは、先に各サービスを直す
- スパムは確実には防げない (フォームの URL は公開されている)
