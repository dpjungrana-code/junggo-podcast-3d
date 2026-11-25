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

/**
 * YouTube export resolution preset (`1080p` | `1440p` | `4k`).
 * Full-quality Colab/CI renders default to `1440p` (2560x1440, scale 4/3) so YouTube
 * automatically triggers its crisp `vp09` codec while rendering ~2x faster than 4K.
 */
const rawRes = (
  process.env.RENDER_RES || (isFullQualityRender ? "1440p" : "1080p")
)
  .trim()
  .toLowerCase();

const RESOLUTION_SCALE_MAP: Record<string, number> = {
  "1080p": 1,
  "1440p": 4 / 3,
  "4k": 2,
};

const renderScale = RESOLUTION_SCALE_MAP[rawRes] ?? (isFullQualityRender ? 4 / 3 : 1);

Config.setRspack(true);
Config.setCachingEnabled(true);
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");
Config.setScale(renderScale);

if (isFullQualityRender) {
  Config.setConcurrency(4);
  Config.setJpegQuality(95);
  Config.setCodec("h264");
  Config.setCrf(18);
  Config.setPixelFormat("yuv420p");
  Config.setDefaultPremountInSeconds(2);
  Config.setDelayRenderTimeoutInMilliseconds(120000);
  Config.setChromiumOpenGlRenderer("angle-egl");
  Config.setChromiumFlags({
    "ignore-gpu-blocklist": true,
    "enable-gpu": true,
  });
} else {
  // Lightweight Intel i5 MacBook local preview preset
  Config.setConcurrency(2);
  Config.setJpegQuality(80);
  Config.setDefaultPremountInSeconds(1);
  Config.setDelayRenderTimeoutInMilliseconds(60000);
}
