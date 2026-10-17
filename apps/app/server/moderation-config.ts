import { moderationConfigFromEnv, type ModerationConfig } from "@lumorphia/moderation/image";

/**
 * 画像の判定器の設定 (ADR-0014)。IMAGE_MODERATION=off|fake|onnx、既定は off (開発)。E2E は fake。
 * 本番は onnx だけ。off や fake のまま出すと、判定せずに全部を公開してしまう
 */
export function moderationConfig(source: NodeJS.ProcessEnv): ModerationConfig {
  const config = moderationConfigFromEnv(source);
  if (source.NODE_ENV === "production" && config.driver !== "onnx")
    throw new Error(
      "IMAGE_MODERATION must be onnx in production (off and fake are for development)",
    );
  return config;
}
