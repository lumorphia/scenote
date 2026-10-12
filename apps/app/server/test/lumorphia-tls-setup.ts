import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureE2eTls } from "@lumorphia/e2e/tls";

/**
 * Lumorphia の発行元のふり (@lumorphia/e2e、https) の CA をテストの Worker に信頼させる。
 * NODE_EXTRA_CA_CERTS はプロセスの起動時にしか読まれないので、Worker を起こす前のここで設定する
 */
export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), "scenote-lumorphia-tls-"));
  const tls = ensureE2eTls(dir);
  process.env.NODE_EXTRA_CA_CERTS = tls.ca;
  process.env.SCENOTE_TEST_LUMORPHIA_CERT = tls.cert;
  process.env.SCENOTE_TEST_LUMORPHIA_KEY = tls.key;
  return () => rmSync(dir, { recursive: true, force: true });
}
