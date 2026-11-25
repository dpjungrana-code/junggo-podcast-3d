/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

/**
 * Full quality mode activates automatically on Google Colab T4 GPU
 * (COLAB_GPU or REMOTION_FULL_QUALITY=1) or CI, while keeping local
 * Intel i5 MacBook Studio previews snappy and low-overhead.
 */
const isFullQualityRender = Boolean(
  process.env.COLAB_GPU ||
    process.env.REMOTION_FULL_QUALITY === "1" ||
    process.env.CI,
);

Config.setRspack(true);
Config.setCachingEnabled(true);
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");

if (isFullQualityRender) {
  Config.setConcurrency(4);
  Config.setJpegQuality(95);
  Config.setCodec("h264");
  Config.setCrf(18);
  Config.setPixelFormat("yuv420p");
  Config.setDefaultPremountInSeconds(2);
  Config.setDelayRenderTimeoutInMilliseconds(120000);
} else {
  // Lightweight Intel i5 MacBook local preview preset
  Config.setConcurrency(2);
  Config.setJpegQuality(80);
  Config.setDefaultPremountInSeconds(1);
  Config.setDelayRenderTimeoutInMilliseconds(60000);
}
