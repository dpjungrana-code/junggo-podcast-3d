import * as THREE from "three";
import { QuizCardData, VocabCardData } from "../data/demoEpisode";

const makeCanvas = (
  width: number,
  height: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D canvas context");
  }
  return [canvas, ctx];
};

const finalizeTexture = (
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  texture.needsUpdate = true;
  return texture;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

/**
 * Warm Japanese oak wood plank texture for the podcast desk and bookshelf.
 */
export const createWoodTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 512);

  // Warm oak base gradient
  const grad = ctx.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, "#9b6a42");
  grad.addColorStop(0.5, "#ab784d");
  grad.addColorStop(1, "#8d5d38");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle plank seams
  const plankCount = 5;
  const plankH = 512 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH;
    const toneShift = ((p * 37) % 18) - 9;
    ctx.fillStyle =
      toneShift >= 0
        ? `rgba(255, 224, 185, ${toneShift * 0.006})`
        : `rgba(45, 22, 10, ${Math.abs(toneShift) * 0.008})`;
    ctx.fillRect(0, y0, 1024, plankH);

    // Fine organic wood grain fibers
    for (let i = 0; i < 42; i++) {
      const gy = y0 + (i / 42) * plankH;
      const amp = 1.8 + ((p * 7 + i * 13) % 5) * 0.55;
      const freq = 0.007 + ((i * 11) % 7) * 0.0012;
      const phase = p * 2.1 + i * 0.65;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= 1024; x += 24) {
        const dy =
          Math.sin(x * freq + phase) * amp +
          Math.cos(x * freq * 2.2 - phase) * (amp * 0.35);
        ctx.lineTo(x, gy + dy);
      }
      ctx.strokeStyle =
        i % 3 === 0 ? "rgba(62, 34, 16, 0.18)" : "rgba(235, 194, 148, 0.09)";
      ctx.lineWidth = i % 4 === 0 ? 1.8 : 1.0;
      ctx.stroke();
    }

    // Subtle plank groove line
    ctx.fillStyle = "rgba(48, 25, 12, 0.25)";
    ctx.fillRect(0, y0, 1024, 1.5);
  }

  return finalizeTexture(canvas, 2, 1);
};

/**
 * Rich warm dark-walnut studio wall texture behind the wooden accent slats.
 */
export const createStudioWallTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 512);

  const grad = ctx.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, "#1b1614");
  grad.addColorStop(0.55, "#241d19");
  grad.addColorStop(1, "#171210");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle vertical wood/plaster micro-grain
  for (let i = 0; i < 1800; i++) {
    const x = (i * 197) % 1024;
    const y = (i * 311) % 512;
    const r = 1 + (i % 3);
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255, 224, 190, 0.022)" : "rgba(8, 6, 5, 0.045)";
    ctx.fillRect(x, y, r * 2, r * 4);
  }

  return finalizeTexture(canvas);
};

/**
 * Transparent glowing "JungGo PODCAST STUDIO" neon wall sign texture
 * with balanced luminance so it reads cleanly over dark wood slats without blooming.
 */
export const createNeonSignTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);

  // Subtle ambient warm-mint & crimson halo behind lettering
  const halo = ctx.createRadialGradient(512, 238, 25, 512, 238, 380);
  halo.addColorStop(0, "rgba(62, 235, 165, 0.16)");
  halo.addColorStop(0.5, "rgba(235, 65, 72, 0.08)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 1024, 512);

  // Rising Sun + Mt. Fuji emblem at top center
  ctx.save();
  ctx.beginPath();
  ctx.arc(512, 114, 48, 0, Math.PI * 2);
  ctx.fillStyle = "#e83b44";
  ctx.shadowColor = "rgba(232, 59, 68, 0.72)";
  ctx.shadowBlur = 16;
  ctx.fill();

  // Mt. Fuji silhouette
  ctx.beginPath();
  ctx.moveTo(418, 152);
  ctx.lineTo(492, 92);
  ctx.lineTo(532, 92);
  ctx.lineTo(606, 152);
  ctx.closePath();
  ctx.fillStyle = "#166e46";
  ctx.shadowColor = "rgba(38, 210, 138, 0.45)";
  ctx.shadowBlur = 10;
  ctx.fill();

  // Crisp snow cap
  ctx.beginPath();
  ctx.moveTo(492, 92);
  ctx.lineTo(532, 92);
  ctx.lineTo(552, 116);
  ctx.lineTo(532, 110);
  ctx.lineTo(512, 122);
  ctx.lineTo(493, 110);
  ctx.lineTo(472, 116);
  ctx.closePath();
  ctx.fillStyle = "#f4f8f6";
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();

  // Main "JungGo" neon lettering (balanced glow)
  ctx.save();
  ctx.font =
    '900 144px "Hiragino Sans", "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.shadowColor = "rgba(180, 255, 224, 0.75)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#f2fff8";
  ctx.fillText("Jung", 542, 248);

  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(44, 232, 162, 0.85)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#48f0b2";
  ctx.fillText("Go", 548, 248);
  ctx.restore();

  // Warm amber-white "PODCAST STUDIO" subtitle
  ctx.save();
  ctx.font =
    '800 46px "Avenir Next", "Helvetica Neue", "Hiragino Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 195, 118, 0.68)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffe5bc";
  ctx.fillText("P O D C A S T   S T U D I O", 512, 352);
  ctx.restore();

  // Subtle Japanese tagline
  ctx.save();
  ctx.font =
    '600 24px "Hiragino Sans", "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(220, 245, 232, 0.86)";
  ctx.shadowColor = "rgba(72, 240, 178, 0.45)";
  ctx.shadowBlur = 6;
  ctx.fillText("学んで、もっと先へ   •   Listen · Learn · Grow", 512, 412);
  ctx.restore();

  return finalizeTexture(canvas);
};

/**
 * Expressive chibi anime face window texture for the 3D Ninja host.
 */
export const createNinjaFaceTexture = (
  isBlinking: boolean,
): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(512, 256);

  // Warm peach anime skin tone
  const skinGrad = ctx.createLinearGradient(0, 0, 0, 256);
  skinGrad.addColorStop(0, "#f3c7a2");
  skinGrad.addColorStop(0.35, "#ffdfc4");
  skinGrad.addColorStop(1, "#f7cfa9");
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle top headband shadow
  ctx.fillStyle = "rgba(70, 35, 20, 0.16)";
  ctx.fillRect(0, 0, 512, 24);

  const drawEye = (cx: number, cy: number, flip: number): void => {
    ctx.save();
    if (isBlinking) {
      // Friendly curved closed eye line
      ctx.strokeStyle = "#181414";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 56, cy + 6);
      ctx.quadraticCurveTo(cx, cy - 18, cx + 56, cy + 10);
      ctx.stroke();
    } else {
      // White sclera
      ctx.beginPath();
      ctx.ellipse(cx, cy, 58, 62, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Rich dark-brown iris
      ctx.beginPath();
      ctx.ellipse(cx + flip * 3, cy + 4, 42, 49, 0, 0, Math.PI * 2);
      const irisGrad = ctx.createRadialGradient(
        cx + flip * 3,
        cy + 14,
        6,
        cx + flip * 3,
        cy + 4,
        48,
      );
      irisGrad.addColorStop(0, "#754324");
      irisGrad.addColorStop(0.55, "#3d1e0e");
      irisGrad.addColorStop(1, "#1a0b05");
      ctx.fillStyle = irisGrad;
      ctx.fill();

      // Deep pupil
      ctx.beginPath();
      ctx.ellipse(cx + flip * 3, cy + 3, 21, 26, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#0e0806";
      ctx.fill();

      // Bright anime catchlights
      ctx.beginPath();
      ctx.arc(cx - 16, cy - 18, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + 18, cy + 20, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fill();

      // Bold upper lash contour
      ctx.strokeStyle = "#141010";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy + 4, 58, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    // Determined friendly ninja eyebrow
    ctx.strokeStyle = "#151212";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - flip * 52, cy - 78);
    ctx.lineTo(cx + flip * 46, cy - 58);
    ctx.stroke();
    ctx.restore();
  };

  drawEye(150, 140, 1);
  drawEye(362, 140, -1);

  return finalizeTexture(canvas);
};

/**
 * Forest-green hoodie chest fabric texture with crisp "JungGo" branding.
 */
export const createHoodieTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(512, 512);

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#1c6e47");
  grad.addColorStop(0.5, "#175e3c");
  grad.addColorStop(1, "#124c30");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle fabric weave
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  for (let y = 0; y < 512; y += 6) {
    ctx.fillRect(0, y, 512, 1);
  }

  // Crisp "JungGo" chest logo
  ctx.font = '800 84px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Jung", 282, 236);
  ctx.textAlign = "left";
  ctx.fillStyle = "#7cf5c4";
  ctx.fillText("Go", 285, 236);

  return finalizeTexture(canvas);
};

/**
 * Transparent crisp white "JungGo" chest wordmark texture matching the studio reference.
 */
export const createHoodieLogoTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(512, 256);
  ctx.clearRect(0, 0, 512, 256);

  ctx.font = '800 108px "Avenir Next", "Helvetica Neue", "Hiragino Sans", sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const jungWidth = ctx.measureText("Jung").width;
  const goWidth = ctx.measureText("Go").width;
  const startX = 256 - (jungWidth + goWidth) / 2;

  ctx.shadowColor = "rgba(5, 24, 15, 0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = "#f6faf7";
  ctx.fillText("Jung", startX, 128);
  ctx.fillStyle = "#e6fbf0";
  ctx.fillText("Go", startX + jungWidth, 128);

  return finalizeTexture(canvas);
};

/**
 * Podcast script notes page texture for the wooden desk sheets.
 */
export const createScriptNotesTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(256, 320);

  ctx.fillStyle = "#f1ede4";
  ctx.fillRect(0, 0, 256, 320);

  // Subtle green JungGo header rule
  ctx.fillStyle = "#197549";
  ctx.fillRect(22, 24, 62, 7);
  ctx.fillStyle = "#8a94a0";
  ctx.fillRect(94, 25, 136, 4);

  // Simulated script lines
  for (let i = 0; i < 12; i++) {
    const y = 52 + i * 20;
    const width = i % 3 === 2 ? 132 : i % 2 === 0 ? 196 : 172;
    ctx.fillStyle = i % 4 === 0 ? "rgba(25, 117, 73, 0.38)" : "rgba(40, 48, 58, 0.28)";
    ctx.fillRect(22, y, width, 4);
  }

  return finalizeTexture(canvas);
};

/**
 * White ceramic mug texture with JungGo Mt. Fuji emblem & wordmark.
 */
export const createMugTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(512, 256);

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, 512, 256);

  // Subtle ceramic rim sheen
  ctx.fillStyle = "#e3ddd4";
  ctx.fillRect(0, 0, 512, 10);

  // Draw emblem centered at x=256 (facing camera)
  ctx.beginPath();
  ctx.arc(256, 95, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#d92b2b";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(206, 122);
  ctx.lineTo(246, 84);
  ctx.lineTo(266, 84);
  ctx.lineTo(306, 122);
  ctx.closePath();
  ctx.fillStyle = "#1b6b46";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(246, 84);
  ctx.lineTo(266, 84);
  ctx.lineTo(277, 98);
  ctx.lineTo(256, 94);
  ctx.lineTo(235, 98);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.font = '800 42px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillStyle = "#152026";
  ctx.fillText("Jung", 268, 168);
  ctx.textAlign = "left";
  ctx.fillStyle = "#1b6b46";
  ctx.fillText("Go", 270, 168);

  return finalizeTexture(canvas);
};

/**
 * Forest-green hardcover "Learn Japanese Anywhere" bookshelf book texture.
 */
export const createBookCoverTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(256, 512);

  const grad = ctx.createLinearGradient(0, 0, 256, 512);
  grad.addColorStop(0, "#1c6347");
  grad.addColorStop(1, "#124531");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Spine highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(14, 0, 6, 512);

  ctx.fillStyle = "#e8f7ef";
  ctx.font = '700 32px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Learn", 136, 185);
  ctx.fillText("Japanese", 136, 228);
  ctx.fillText("Anywhere", 136, 271);

  ctx.fillStyle = "#4eeac3";
  ctx.fillRect(72, 310, 128, 4);

  return finalizeTexture(canvas);
};

/**
 * Sleek podcast recording DAW interface on the laptop screen.
 */
export const createLaptopScreenTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(512, 320);

  ctx.fillStyle = "#0e141c";
  ctx.fillRect(0, 0, 512, 320);

  // Top DAW toolbar
  ctx.fillStyle = "#182230";
  ctx.fillRect(0, 0, 512, 38);
  // Red REC dot
  ctx.beginPath();
  ctx.arc(28, 19, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4545";
  ctx.fill();

  ctx.fillStyle = "#8efce0";
  ctx.font = '700 15px "Avenir Next", sans-serif';
  ctx.fillText("JUNGGO STUDIO • REC 00:24", 46, 24);

  // Track waveforms
  const trackColors = ["#34f5b5", "#56ccf2", "#f5a623"];
  trackColors.forEach((col, trackIdx) => {
    const yBase = 88 + trackIdx * 76;
    ctx.fillStyle = "#151f2b";
    drawRoundedRect(ctx, 20, yBase - 26, 472, 54, 8);
    ctx.fill();

    ctx.fillStyle = col;
    for (let x = 32; x < 480; x += 7) {
      const h =
        6 +
        Math.abs(
          Math.sin(x * 0.08 + trackIdx * 2.1) *
            Math.cos(x * 0.035 - trackIdx) *
            20,
        );
      ctx.fillRect(x, yBase - h, 4, h * 2);
    }
  });

  // Playhead line
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(320, 38, 2, 270);

  return finalizeTexture(canvas);
};

/**
 * Twilight dusk/night sky backdrop texture behind Tokyo Tower.
 */
export const createTokyoSkyTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 1024);

  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, "#0b1026");
  grad.addColorStop(0.32, "#191c42");
  grad.addColorStop(0.62, "#3a2559");
  grad.addColorStop(0.82, "#873e62");
  grad.addColorStop(0.95, "#e07b58");
  grad.addColorStop(1.0, "#f5a962");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle stars in upper night sky
  for (let i = 0; i < 90; i++) {
    const x = (i * 173 + 47) % 1024;
    const y = (i * 89 + 23) % 420;
    const r = i % 5 === 0 ? 2.1 : 1.1;
    ctx.fillStyle = `rgba(255, 250, 240, ${0.35 + (i % 6) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(canvas);
};

/**
 * Crisp glassmorphic 3D Vocabulary Display Card texture.
 */
export const createVocabCardTexture = (
  vocab: VocabCardData,
): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 680);

  // Deep translucent glass card gradient
  drawRoundedRect(ctx, 12, 12, 1000, 656, 40);
  const bg = ctx.createLinearGradient(0, 0, 1024, 680);
  bg.addColorStop(0, "rgba(13, 25, 36, 0.94)");
  bg.addColorStop(0.5, "rgba(16, 34, 44, 0.92)");
  bg.addColorStop(1, "rgba(11, 22, 32, 0.96)");
  ctx.fillStyle = bg;
  ctx.fill();

  // Top glass reflection highlight
  ctx.save();
  drawRoundedRect(ctx, 12, 12, 1000, 656, 40);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, 0, 600, 340);
  sheen.addColorStop(0, "rgba(80, 245, 195, 0.16)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 1024, 340);
  ctx.restore();

  // Luminous emerald-mint border
  drawRoundedRect(ctx, 14, 14, 996, 652, 40);
  ctx.strokeStyle = "rgba(62, 244, 186, 0.78)";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Top badges: JLPT N5 + Part of Speech
  drawRoundedRect(ctx, 56, 52, 178, 48, 24);
  ctx.fillStyle = "#1b7a52";
  ctx.fill();
  ctx.fillStyle = "#eafff7";
  ctx.font = '800 24px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(vocab.jlptLevel, 145, 77);

  drawRoundedRect(ctx, 250, 52, 200, 48, 24);
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fill();
  ctx.fillStyle = "#9decd1";
  ctx.font = '600 22px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.fillText(vocab.partOfSpeech, 350, 77);

  // Right header label
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(180, 245, 224, 0.75)";
  ctx.font = '700 22px "Avenir Next", sans-serif';
  ctx.fillText("VOCABULARY SPOTLIGHT", 964, 77);

  // Main Japanese word
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(52, 245, 181, 0.4)";
  ctx.shadowBlur = 18;
  ctx.font = '900 124px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
  ctx.fillText(vocab.word, 56, 210);
  ctx.shadowBlur = 0;

  // Kanji hint badge
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = '600 42px "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(vocab.reading, 960, 214);

  // Romaji pill
  ctx.textAlign = "left";
  drawRoundedRect(ctx, 56, 296, 230, 54, 27);
  ctx.fillStyle = "rgba(52, 245, 181, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 245, 181, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#52f7c1";
  ctx.font = '700 34px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.fillText(vocab.romaji, 88, 324);

  // English meaning
  ctx.fillStyle = "#fff4df";
  ctx.font = '800 54px "Avenir Next", "Helvetica Neue", sans-serif';
  ctx.fillText(vocab.meaning, 56, 412);

  // Divider
  ctx.fillStyle = "rgba(82, 247, 193, 0.25)";
  ctx.fillRect(56, 466, 912, 2);

  // Example sentence panel
  drawRoundedRect(ctx, 56, 494, 912, 134, 22);
  ctx.fillStyle = "rgba(7, 16, 24, 0.62)";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = '700 34px "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.fillText(vocab.exampleJp, 84, 534);

  ctx.fillStyle = "#7cf5c4";
  ctx.font = '600 24px "Avenir Next", sans-serif';
  ctx.fillText(vocab.exampleRomaji, 84, 574);

  ctx.fillStyle = "#cdd8e3";
  ctx.font = '500 24px "Avenir Next", sans-serif';
  ctx.fillText(vocab.exampleEn, 84, 608);

  return finalizeTexture(canvas);
};

/**
 * Crisp 3D Floating Quiz Card texture (static layout for options + highlight state).
 * The visual countdown bar itself is also rendered as an animated 3D mesh underneath.
 */
export const createQuizCardTexture = (
  quiz: QuizCardData,
  revealed: boolean,
): THREE.CanvasTexture => {
  const [canvas, ctx] = makeCanvas(1024, 700);

  drawRoundedRect(ctx, 12, 12, 1000, 676, 40);
  const bg = ctx.createLinearGradient(0, 0, 1024, 700);
  bg.addColorStop(0, "rgba(22, 16, 46, 0.95)");
  bg.addColorStop(0.55, "rgba(18, 22, 52, 0.94)");
  bg.addColorStop(1, "rgba(12, 20, 38, 0.96)");
  ctx.fillStyle = bg;
  ctx.fill();

  // Outer quiz border (shifts purple -> bright emerald when revealed)
  drawRoundedRect(ctx, 14, 14, 996, 672, 40);
  ctx.strokeStyle = revealed
    ? "rgba(56, 246, 181, 0.95)"
    : "rgba(167, 139, 250, 0.85)";
  ctx.lineWidth = 5;
  ctx.stroke();

  // Header badge
  drawRoundedRect(ctx, 56, 48, 360, 48, 24);
  ctx.fillStyle = revealed ? "#168052" : "#6d28d9";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 23px "Avenir Next", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(revealed ? "CORRECT ANSWER!" : quiz.title, 236, 73);

  // Question Japanese + English
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 54px "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.fillText(quiz.questionJp, 56, 158);

  ctx.fillStyle = "#c4b5fd";
  ctx.font = '600 32px "Avenir Next", sans-serif';
  ctx.fillText(quiz.questionEn, 56, 214);

  // Options A, B, C
  quiz.options.forEach((opt, idx) => {
    const y = 266 + idx * 106;
    const isHit = revealed && opt.isCorrect;
    const isDimmed = revealed && !opt.isCorrect;

    drawRoundedRect(ctx, 56, y, 912, 86, 22);
    if (isHit) {
      ctx.fillStyle = "rgba(24, 152, 98, 0.45)";
    } else if (isDimmed) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
    }
    ctx.fill();

    ctx.strokeStyle = isHit
      ? "#44f8bc"
      : isDimmed
        ? "rgba(255,255,255,0.12)"
        : "rgba(196, 181, 253, 0.35)";
    ctx.lineWidth = isHit ? 4 : 2;
    ctx.stroke();

    // Letter pill
    drawRoundedRect(ctx, 76, y + 16, 56, 54, 14);
    ctx.fillStyle = isHit ? "#38f6b5" : "rgba(139, 92, 246, 0.45)";
    ctx.fill();
    ctx.fillStyle = isHit ? "#082419" : "#ffffff";
    ctx.font = '900 32px "Avenir Next", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(opt.label, 104, y + 44);

    // English answer text + JP/romaji
    ctx.textAlign = "left";
    ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.4)" : "#ffffff";
    ctx.font = '800 38px "Avenir Next", sans-serif';
    ctx.fillText(opt.english, 158, y + 44);

    ctx.textAlign = "right";
    ctx.fillStyle = isHit
      ? "#7cf5c4"
      : isDimmed
        ? "rgba(255,255,255,0.25)"
        : "#cbd5e1";
    ctx.font = '600 30px "Hiragino Sans", "Avenir Next", sans-serif';
    ctx.fillText(`${opt.jp} (${opt.romaji})`, 936, y + 44);
  });

  // Footer prompt for the 3D countdown bar space
  ctx.textAlign = "left";
  ctx.fillStyle = revealed ? "#52f7c1" : "#f8d49d";
  ctx.font = '700 24px "Avenir Next", sans-serif';
  ctx.fillText(
    revealed ? "B — おいしい (oishii) = Delicious!" : "TIME REMAINING",
    56,
    622,
  );

  return finalizeTexture(canvas);
};
