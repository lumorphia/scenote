/** 地図はビルドに同梱。候補の PlaceName row_id と対応する (public/maps/sources.json)。 */
import { MAPPED_PLACE_IDS } from "./mapped-place-ids.ts";
const MAPPED_PLACES = new Set<number>(MAPPED_PLACE_IDS);

export type JournalPlace = {
  id: string | null;
  sourceId: number | null;
  regionName: string | null;
  name: string;
};
export type MapRegion = { name: string; places: { id: string; sourceId: number; name: string }[] };

/** 対応していない場所や自由入力の場所に、別の地図を当てない。 */
export function areaMap(sourceId: number | null): string | null {
  return sourceId !== null && MAPPED_PLACES.has(sourceId) ? `/maps/${sourceId}.webp` : null;
}
