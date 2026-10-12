import { fileURLToPath } from "node:url";
import { storageConfigFromEnv, type StorageConfig } from "@lumorphia/storage";
import { DEV_STORAGE_PATH } from "./env.ts";

/** 開発の画像の置き場所。アプリと worker が同じところを読むよう、リポジトリの .data/ に固定する */
const DEV_STORAGE_ROOT = fileURLToPath(new URL("../../../.data/storage", import.meta.url));

/**
 * 画像の置き場所の設定。本番は R2 (S3 互換)。開発とテストは既定で手元のファイルに置き、アプリ自身の
 * /_storage で受け取って配る (plugins/dev-storage.ts)。アプリ・worker・CSP が同じ設定を使う
 */
export function storageConfig(source: NodeJS.ProcessEnv = process.env): StorageConfig {
  const production = source.NODE_ENV === "production";
  return storageConfigFromEnv({
    ...source,
    STORAGE_DRIVER: source.STORAGE_DRIVER || (production ? "s3" : "fs"),
    STORAGE_FS_ROOT: source.STORAGE_FS_ROOT || DEV_STORAGE_ROOT,
    STORAGE_MEMORY_PUBLIC_URL:
      source.STORAGE_MEMORY_PUBLIC_URL || (production ? undefined : DEV_STORAGE_PATH),
  });
}

/** ブラウザが画像を PUT する先 (CSP の connect-src)。読めない設定なら null */
export function uploadOrigin(source: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const config = storageConfig(source);
    return config.driver === "s3" ? config.endpoint : (config.publicBaseUrl ?? null);
  } catch {
    return null;
  }
}
