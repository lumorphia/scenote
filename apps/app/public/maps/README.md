# FFXIV のエリアマップ

© SQUARE ENIX。XIVAPI v2 の TerritoryType.Map.Id に対応するゲーム内のエリアマップを縮小して同梱する。撮影場所候補と同じ対象・同じ重複排除で選ぶ。取得日、PlaceName の row_id、地図 ID、TerritoryType の row_id は [sources.json](sources.json)。

`pnpm --filter @lumorphia-scenote/app exec node scripts/sync-map-assets.ts` で画像と対応表を更新する。閲覧時の外部通信は発生しない。画像に写る地形や施設と、利用者の写真の正確な撮影座標を結び付けるものではない。
