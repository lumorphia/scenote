import sharp from "sharp";

/** summary_large_image の大きさ (要件定義書 16 章) */
export const OGP_WIDTH = 1200;
export const OGP_HEIGHT = 630;

/**
 * 共有用の画像 (ADR-0018)。検証と再エンコードを済ませた display から、中央を 1200x630 に切り抜いて JPEG にする。
 * X などは WebP の og:image を出せないことがあるので JPEG (要件定義書 18.1)。sharp は既定でメタデータを書かない
 */
export async function makeOgpImage(display: Uint8Array): Promise<Uint8Array> {
  const jpeg = await sharp(display)
    .resize(OGP_WIDTH, OGP_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(jpeg);
}
