# Scenote デザイン比較

2026-10-18。アプリ本体から独立したローカルの HTML 試作。公開・デプロイはしていない。

[比較一覧](index.html) をブラウザで開く。外部フォントやビルドは不要。JavaScript を有効にする。

| 案  | トップ              | 投稿詳細            | 軸                                       |
| --- | ------------------- | ------------------- | ---------------------------------------- |
| A   | [HTML](a-home.html) | [HTML](a-post.html) | 旅の手帳。深緑、明朝、余白と罫線         |
| B   | [HTML](b-home.html) | [HTML](b-post.html) | 冒険の野帳。地図を主役にした実用的な記録 |
| C   | [HTML](c-home.html) | [HTML](c-post.html) | 日常の写真帳。写真の縁と短い文章         |

各ページ上部で案・トップ／詳細・ライト／ダークを切り替えられる。PC とスマートフォンに対応。写真の絞り込み、地図のピン選択・拡大縮小、投稿詳細への遷移、写真拡大、URL コピーを試せる。編集・通報は本体の処理を呼ばず、その旨を表示する。

## A 案の更新

A 案のトップのヒーローを C 案の写真帳の配置に変更した。中央の見出しと、少し傾けて並べた写真を使う。配色とロゴ、写真一覧、地図、投稿詳細は A 案を継承する。

## 地図の扱い

現状は撮影場所の登録まで実装済みで、地図表示・地図上への写真配置は要件定義書 10・23・24 章の将来構想。今回の地図はその提案であり、現行 API への接続は行っていない。スキーマには現在、撮影座標や地図 ID はない。

FFXIV の実際のイル・メグのエリアマップを XIVAPI から取得した。TerritoryType 816 の Map.Id は `n4f4/00`。地図の著作権は SQUARE ENIX に帰属する。ピンはレイアウト確認用の仮の位置であり、実際の撮影座標を意味しない。地図の機能を本体に入れる際は、エリアと地図の対応、撮影位置の入力方法、非公開・限定公開の扱いを別途設計する。

撮影場所未登録の投稿 (`a-post.html?photo=3` など) では地図やピンを出さず、未登録の案内を表示する。

## 素材と仮データ

写真は Prismtone のデザイン検討でも使用した運営者の `/mnt/d/ff14/screenshots` から選んだ。画像内を目視して選び、元の縦横比を保って縮小し、メタデータを除いて WebP 化した。元画像を変更していない。写真そのものや地図に生成 AI は使用していない。

投稿タイトル・本文・日付・投稿者・場所はレイアウト確認用の仮データ。場所の特定を保証しない。写真・地図の出典と元寸法は [assets/sources.json](assets/sources.json)。

参考:

- [TRAVELER’S notebook](https://www.travelers-company.com/products/trnote/about)
- [Field Notes / National Parks](https://fieldnotesbrand.com/products/national-parks)
- [Disney / Up の Adventure Book](https://video.disney.com/watch/my-summer-adventure-book-up-disney-diy-5391f2c5df5770e3d7e13beb)
- [Kinfolk Travel](https://www.kinfolk.com/stories/kinfolk-travel/)

## 確認

Chromium で 1440px / 390px の全 6 画面を確認。画像の読み込み、横方向のはみ出し、地図のピン切り替え・拡大縮小、写真の絞り込み、投稿への移動、写真拡大と Escape、テーマ切り替え、撮影場所未登録の表示を検証する。

書き出しは `{a,b,c}-{home,post}-{pc,sp}.webp`。本体への反映を決める前の比較用であり、ADR や本体の機能は変更していない。
