import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { StickmanSceneId } from "../data/demoEpisode";

export type StickmanScenePlayerProps = {
  readonly scene: StickmanSceneId;
  readonly sectionStartSec: number;
  readonly sectionEndSec: number;
  readonly activeSubTopicKey?: string;
  readonly activeSubTopicLabel?: string;
  readonly visualBeat?: string;
  readonly caption?: string;
  readonly width?: number | string;
  readonly height?: number;
};

type CharacterExpr = "happy" | "focused" | "amazed" | "surprised" | "wink" | "proud";

type ToonCharProps = {
  readonly x: number;
  readonly y: number;
  readonly facing?: 1 | -1;
  readonly scale?: number;
  readonly seed?: number;
  readonly jacketColor?: string;
  readonly hairOrBandColor?: string;
  readonly uniformCap?: boolean;
  readonly leanDeg?: number;
  readonly headTiltDeg?: number;
  readonly leftUpperArmDeg?: number;
  readonly leftForearmDeg?: number;
  readonly rightUpperArmDeg?: number;
  readonly rightForearmDeg?: number;
  readonly leftThighDeg?: number;
  readonly leftCalfDeg?: number;
  readonly rightThighDeg?: number;
  readonly rightCalfDeg?: number;
  readonly hasBackpack?: boolean;
  readonly holdCardHand?: "right" | "left" | null;
  readonly holdTicketHand?: "right" | "left" | null;
  readonly holdCoinHand?: "right" | "left" | null;
  readonly holdPhoneHand?: "right" | "left" | null;
  readonly expr?: CharacterExpr;
  readonly blink?: number;
  readonly sweatDrop?: boolean;
  readonly accentColor?: string;
};

const INK = "#111827";

export const STREET_LAYOUT_25D = {
  BUILDING_BASE_Y: 250,
  ROAD_TOP_Y: 250,
  ROAD_FAR_LANE_Y: 256,
  ROAD_NEAR_LANE_Y: 298,
  ROAD_MAX_WHEEL_Y: 339,
  ROAD_BOTTOM_Y: 346,
  GUARDRAIL_TOP_Y: 326,
  GUARDRAIL_BASE_Y: 352,
  CURB_Y: 346,
  SIDEWALK_TOP_Y: 360,
  SIDEWALK_FEET_Y: 418,
} as const;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

const smootherstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const polarEnd = (
  x: number,
  y: number,
  length: number,
  angleFromDownDeg: number,
): { readonly x: number; readonly y: number } => {
  const rad = degToRad(angleFromDownDeg);
  return {
    x: x + Math.sin(rad) * length,
    y: y + Math.cos(rad) * length,
  };
};

const lerpRange = (
  value: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number,
): number => {
  if (Math.abs(inputEnd - inputStart) < 1e-6) {
    return outputEnd;
  }
  return interpolate(value, [inputStart, inputEnd], [outputStart, outputEnd], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
};

/** 4-frame crisp blink cadence matching reference_kit/motion.md (0 = open, 0.5 = half, 1 = shut) */
const computeBlink = (frame: number, seed = 1): number => {
  const period = 44 + ((seed * 19) % 29);
  const ph = (frame + seed * 13) % period;
  return ph === 0 || ph === 3 ? 0.5 : ph === 1 || ph === 2 ? 1 : 0;
};

/** Cycles expressive facial emotions every ~0.55s cleanly on beat boundaries */
const cycleExpression = (
  localSec: number,
  seed: number,
  palette: readonly CharacterExpr[],
): CharacterExpr => {
  const idx = Math.floor((localSec + seed * 0.37) / 0.62) % palette.length;
  return palette[Math.abs(idx) % palette.length];
};

/**
 * 2.5D Toon Character Card adapted from `reference_kit/ricksclips-style`:
 * Unlit pure-white rounded head (soft crescent shade, thick bottom-weighted dark outline),
 * always-visible high arched brows, blinking eyes, dynamic facial expression updates,
 * colored pear-shaped torso outfit, ink-rimmed limbs, and physical hand props.
 */
const ToonCharacter2D: React.FC<ToonCharProps> = ({
  x,
  y,
  facing = 1,
  scale = 1,
  leanDeg = 0,
  headTiltDeg = 0,
  jacketColor = "#148c53",
  hairOrBandColor = "#10b981",
  uniformCap = false,
  leftUpperArmDeg = -18,
  leftForearmDeg = 12,
  rightUpperArmDeg = 22,
  rightForearmDeg = 38,
  leftThighDeg = -10,
  leftCalfDeg = -6,
  rightThighDeg = 10,
  rightCalfDeg = 4,
  hasBackpack = false,
  holdCardHand = null,
  holdTicketHand = null,
  holdCoinHand = null,
  holdPhoneHand = null,
  expr = "happy",
  blink = 0,
  sweatDrop = false,
  accentColor = "#34d399",
}) => {
  const torsoLen = 44;
  const upperArmLen = 23;
  const forearmLen = 21;
  const thighLen = 28;
  const calfLen = 27;

  const hip = { x: 0, y: 0 };
  const leanRad = degToRad(leanDeg);
  const shoulder = {
    x: Math.sin(leanRad) * torsoLen,
    y: -Math.cos(leanRad) * torsoLen,
  };
  const neck = {
    x: shoulder.x + Math.sin(leanRad) * 5,
    y: shoulder.y - Math.cos(leanRad) * 5,
  };
  const headTotalRad = degToRad(leanDeg + headTiltDeg);
  const headRx = 20.5;
  const headRy = 18.8; // Slightly wider than tall per Ricks Style Bible
  const headCenter = {
    x: neck.x + Math.sin(headTotalRad) * 18,
    y: neck.y - Math.cos(headTotalRad) * 18,
  };

  const lElbow = polarEnd(shoulder.x, shoulder.y, upperArmLen, leftUpperArmDeg);
  const lHand = polarEnd(lElbow.x, lElbow.y, forearmLen, leftForearmDeg);

  const rElbow = polarEnd(shoulder.x, shoulder.y, upperArmLen, rightUpperArmDeg);
  const rHand = polarEnd(rElbow.x, rElbow.y, forearmLen, rightForearmDeg);

  const lKnee = polarEnd(hip.x, hip.y, thighLen, leftThighDeg);
  const lFoot = polarEnd(lKnee.x, lKnee.y, calfLen, leftCalfDeg);

  const rKnee = polarEnd(hip.x, hip.y, thighLen, rightThighDeg);
  const rFoot = polarEnd(rKnee.x, rKnee.y, calfLen, rightCalfDeg);

  const renderHandProp = (
    hand: { readonly x: number; readonly y: number },
    side: "right" | "left",
  ) => (
    <g key={`prop-${side}`}>
      {holdCardHand === side ? (
        <g transform={`translate(${hand.x + 2}, ${hand.y - 7}) rotate(-14)`}>
          <rect x="0" y="0" width="24" height="15" rx="3.5" fill="#10b981" stroke={INK} strokeWidth="2.4" />
          <rect x="3.5" y="4" width="7.5" height="4" rx="1" fill="#fde047" />
          <line x1="13" y1="10.5" x2="20" y2="10.5" stroke="#ecfdf5" strokeWidth="1.8" />
        </g>
      ) : null}
      {holdTicketHand === side ? (
        <g transform={`translate(${hand.x + 1}, ${hand.y - 10}) rotate(-16)`}>
          <rect x="0" y="0" width="22" height="13" rx="2.5" fill="#fde68a" stroke={INK} strokeWidth="2.2" />
          <circle cx="6.5" cy="6.5" r="2" fill="#d97706" />
          <line x1="11" y1="6.5" x2="18" y2="6.5" stroke="#92400e" strokeWidth="2" />
        </g>
      ) : null}
      {holdCoinHand === side ? (
        <g transform={`translate(${hand.x + 5}, ${hand.y - 4})`}>
          <circle cx="0" cy="0" r="7.5" fill="#fbbf24" stroke={INK} strokeWidth="2.2" />
          <circle cx="0" cy="0" r="2.1" fill="#fef3c7" stroke={INK} strokeWidth="1.2" />
        </g>
      ) : null}
      {holdPhoneHand === side ? (
        <g transform={`translate(${hand.x + 1}, ${hand.y - 13}) rotate(8)`}>
          <rect x="0" y="0" width="13" height="20" rx="3" fill="#1e293b" stroke={INK} strokeWidth="2.2" />
          <rect x="2.2" y="2.5" width="8.6" height="13" rx="1.5" fill="#38bdf8" />
        </g>
      ) : null}
    </g>
  );

  const eyeShiftX = 4.2;
  const eyeLx = headCenter.x + eyeShiftX - 5.2;
  const eyeRx = headCenter.x + eyeShiftX + 5.2;
  const eyeY = headCenter.y - 1.2;
  const browY = headCenter.y - 8.5;

  return (
    <g transform={`translate(${x}, ${y}) scale(${facing * scale}, ${scale})`}>
      {/* Soft grounded oval contact shadow */}
      <ellipse cx="2" cy={56} rx="23" ry="6" fill="rgba(17, 24, 39, 0.36)" />

      {/* Back arm */}
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${lElbow.x} ${lElbow.y} L ${lHand.x} ${lHand.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="9.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${lElbow.x} ${lElbow.y} L ${lHand.x} ${lHand.y}`}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lHand.x} cy={lHand.y} r="4.4" fill={INK} />
      {renderHandProp(lHand, "left")}

      {/* Traveler Backpack */}
      {hasBackpack ? (
        <g transform={`translate(${shoulder.x - 20}, ${shoulder.y + 4}) rotate(${leanDeg})`}>
          <rect x="0" y="0" width="17" height="31" rx="6.5" fill="#0f766e" stroke={INK} strokeWidth="2.8" />
          <rect x="2.5" y="4" width="12" height="9" rx="3" fill="#14b8a6" />
          <line x1="3" y1="18" x2="14" y2="18" stroke="#fde047" strokeWidth="2.2" />
        </g>
      ) : null}

      {/* Back leg */}
      <path
        d={`M ${hip.x} ${hip.y} L ${lKnee.x} ${lKnee.y} L ${lFoot.x} ${lFoot.y} L ${lFoot.x + 10} ${lFoot.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="9.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${hip.x} ${hip.y} L ${lKnee.x} ${lKnee.y} L ${lFoot.x} ${lFoot.y} L ${lFoot.x + 10} ${lFoot.y}`}
        fill="none"
        stroke="#334155"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Pear-shaped pill body outfit */}
      <g transform={`rotate(${leanDeg})`}>
        <path
          d={`M -11 -45 Q 0 -49 11 -45 L 15 -6 Q 16 4 0 4 Q -16 4 -15 -6 Z`}
          fill={jacketColor}
          stroke={INK}
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        {/* Crisp outfit lapel / collar detail */}
        <path d="M -5 -44 L 0 -30 L 5 -44" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Front leg */}
      <path
        d={`M ${hip.x} ${hip.y} L ${rKnee.x} ${rKnee.y} L ${rFoot.x} ${rFoot.y} L ${rFoot.x + 11} ${rFoot.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${hip.x} ${hip.y} L ${rKnee.x} ${rKnee.y} L ${rFoot.x} ${rFoot.y} L ${rFoot.x + 11} ${rFoot.y}`}
        fill="none"
        stroke="#475569"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Pure-White Unlit Head (never darkened by scene tint!) + soft cool crescent shade */}
      <ellipse
        cx={headCenter.x}
        cy={headCenter.y}
        rx={headRx}
        ry={headRy}
        fill="#fffdf9"
        stroke={INK}
        strokeWidth="3.8"
      />
      {/* Bottom-weighted thicker ink arc + soft shadow crescent */}
      <path
        d={`M ${headCenter.x - headRx + 2} ${headCenter.y + 4} Q ${headCenter.x} ${headCenter.y + headRy + 1} ${headCenter.x + headRx - 2} ${headCenter.y + 4}`}
        fill="none"
        stroke={INK}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d={`M ${headCenter.x - headRx + 4} ${headCenter.y - 5} C ${headCenter.x - headRx + 1} ${headCenter.y + 10}, ${headCenter.x - 2} ${headCenter.y + headRy - 3}, ${headCenter.x + 6} ${headCenter.y + headRy - 4}`}
        fill="none"
        stroke="rgba(148, 163, 184, 0.35)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Crown headwear: either Uniform Station Attendant Cap or Stylish Headband */}
      {uniformCap ? (
        <g>
          <path
            d={`M ${headCenter.x - 18} ${headCenter.y - 10} L ${headCenter.x - 14} ${headCenter.y - 23} L ${headCenter.x + 16} ${headCenter.y - 23} L ${headCenter.x + 18} ${headCenter.y - 10} Z`}
            fill="#1e3a8a"
            stroke={INK}
            strokeWidth="2.8"
          />
          <path
            d={`M ${headCenter.x - 12} ${headCenter.y - 11} L ${headCenter.x + 25} ${headCenter.y - 9}`}
            stroke={INK}
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <circle cx={headCenter.x + 4} cy={headCenter.y - 17} r="3" fill="#fbbf24" stroke={INK} strokeWidth="1.2" />
        </g>
      ) : (
        <g>
          <path
            d={`M ${headCenter.x - 17} ${headCenter.y - 11} Q ${headCenter.x} ${headCenter.y - 15} ${headCenter.x + 17} ${headCenter.y - 11}`}
            fill="none"
            stroke={INK}
            strokeWidth="6.6"
            strokeLinecap="round"
          />
          <path
            d={`M ${headCenter.x - 17} ${headCenter.y - 11} Q ${headCenter.x} ${headCenter.y - 15} ${headCenter.x + 17} ${headCenter.y - 11}`}
            fill="none"
            stroke={hairOrBandColor}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d={`M ${headCenter.x - 16} ${headCenter.y - 11} L ${headCenter.x - 27} ${headCenter.y - 16} L ${headCenter.x - 24} ${headCenter.y - 7} Z`}
            fill={hairOrBandColor}
            stroke={INK}
            strokeWidth="1.8"
          />
        </g>
      )}

      {/* Always-visible thick arched eyebrows */}
      <path
        d={`M ${eyeLx - 4} ${browY + (expr === "surprised" ? -2.5 : 0)} Q ${eyeLx} ${browY - 2.5} ${eyeLx + 3.5} ${browY}`}
        fill="none"
        stroke={INK}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        d={`M ${eyeRx - 3.5} ${browY} Q ${eyeRx} ${browY - 2.5} ${eyeRx + 4} ${browY + (expr === "amazed" ? -2.5 : 0)}`}
        fill="none"
        stroke={INK}
        strokeWidth="2.3"
        strokeLinecap="round"
      />

      {/* Expressive Eyes with 4-frame blinking */}
      {blink >= 0.9 || expr === "wink" ? (
        <g>
          <line x1={eyeLx - 3.5} y1={eyeY} x2={eyeLx + 3.5} y2={eyeY} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <line x1={eyeRx - 3.5} y1={eyeY} x2={eyeRx + 3.5} y2={eyeY} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ) : expr === "surprised" || expr === "amazed" ? (
        <g>
          <circle cx={eyeLx} cy={eyeY} r="4.3" fill="#ffffff" stroke={INK} strokeWidth="1.8" />
          <circle cx={eyeLx + 0.8} cy={eyeY} r="1.8" fill={INK} />
          <circle cx={eyeRx} cy={eyeY} r="4.3" fill="#ffffff" stroke={INK} strokeWidth="1.8" />
          <circle cx={eyeRx + 0.8} cy={eyeY} r="1.8" fill={INK} />
        </g>
      ) : (
        <g>
          <ellipse cx={eyeLx} cy={eyeY} rx="2.6" ry={blink >= 0.4 ? 1.8 : 3.6} fill={INK} />
          <ellipse cx={eyeRx} cy={eyeY} rx="2.4" ry={blink >= 0.4 ? 1.8 : 3.6} fill={INK} />
        </g>
      )}

      {/* Expressive Ricks-style mouth */}
      {expr === "happy" || expr === "proud" || expr === "wink" ? (
        <g>
          <path
            d={`M ${headCenter.x + eyeShiftX - 5.5} ${headCenter.y + 5.5} Q ${headCenter.x + eyeShiftX} ${headCenter.y + 11.5} ${headCenter.x + eyeShiftX + 6.5} ${headCenter.y + 5.2} Z`}
            fill="#5a1e28"
            stroke={INK}
            strokeWidth="1.8"
          />
          <rect x={headCenter.x + eyeShiftX - 3.5} y={headCenter.y + 5.7} width="7" height="2" rx="0.8" fill="#ffffff" />
        </g>
      ) : expr === "surprised" ? (
        <ellipse
          cx={headCenter.x + eyeShiftX}
          cy={headCenter.y + 7.5}
          rx="3.8"
          ry="4.5"
          fill="#5a1e28"
          stroke={INK}
          strokeWidth="1.8"
        />
      ) : (
        <path
          d={`M ${headCenter.x + eyeShiftX - 4} ${headCenter.y + 7.2} Q ${headCenter.x + eyeShiftX} ${headCenter.y + 9} ${headCenter.x + eyeShiftX + 4.5} ${headCenter.y + 6.8}`}
          fill="none"
          stroke={INK}
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      )}

      {sweatDrop ? (
        <path
          d={`M ${headCenter.x - 23} ${headCenter.y - 13} C ${headCenter.x - 27} ${headCenter.y - 4}, ${headCenter.x - 19} ${headCenter.y - 4}, ${headCenter.x - 23} ${headCenter.y - 13} Z`}
          fill="#38bdf8"
          stroke={INK}
          strokeWidth="1.8"
        />
      ) : null}

      {/* Front arm */}
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${rElbow.x} ${rElbow.y} L ${rHand.x} ${rHand.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="9.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${rElbow.x} ${rElbow.y} L ${rHand.x} ${rHand.y}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={rHand.x} cy={rHand.y} r="4.6" fill={INK} stroke={accentColor} strokeWidth="1.5" />
      {renderHandProp(rHand, "right")}
    </g>
  );
};

const SteamPuffs: React.FC<{
  readonly originX: number;
  readonly originY: number;
  readonly localSec: number;
  readonly driftX?: number;
  readonly riseY?: number;
  readonly scale?: number;
}> = ({ originX, originY, localSec, driftX = 28, riseY = 42, scale = 1 }) => (
  <g>
    {[0, 1, 2].map((i) => {
      const phase = (localSec * 0.65 + i * 0.33) % 1;
      const px = originX + phase * driftX;
      const py = originY - phase * riseY;
      const r = (7 + phase * 11) * scale;
      const alpha = Math.sin(phase * Math.PI) * 0.78;
      return (
        <circle
          key={i}
          cx={px}
          cy={py}
          r={r}
          fill="#f8fafc"
          stroke={INK}
          strokeWidth="1.4"
          opacity={alpha}
        />
      );
    })}
  </g>
);

const YenCoin: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  readonly gold?: boolean;
  readonly sparklePhase: number;
}> = ({ x, y, label = "¥100", gold = false, sparklePhase }) => (
  <g transform={`translate(${x}, ${y})`}>
    <circle cx="0" cy="0" r="17" fill={gold ? "#fbbf24" : "#e2e8f0"} stroke={INK} strokeWidth="2.8" />
    <circle cx="0" cy="0" r="12" fill="none" stroke={gold ? "#d97706" : "#94a3b8"} strokeWidth="1.6" />
    <text x="0" y="4" textAnchor="middle" fill={INK} fontSize="10" fontWeight="900">
      {label}
    </text>
    <path
      d="M 14 -14 L 16 -20 L 18 -14 L 24 -12 L 18 -10 L 16 -4 L 14 -10 L 8 -12 Z"
      fill="#fef08a"
      stroke={INK}
      strokeWidth="1.1"
      opacity={0.5 + 0.5 * Math.abs(Math.sin(sparklePhase))}
    />
  </g>
);

const SceneSpeechTag: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly jp: string;
  readonly en?: string;
  readonly accent?: string;
}> = ({ x, y, jp, en, accent = "#34d399" }) => {
  const w = Math.max(150, jp.length * 16.5 + 34);
  const h = en ? 52 : 34;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-w / 2} y={-h} width={w} height={h} rx="14" fill="#ffffff" stroke={INK} strokeWidth="3.2" />
      <polygon points="-7,-1 7,-1 0,11" fill="#ffffff" stroke={INK} strokeWidth="2.6" />
      <rect x={-w / 2 + 4} y={-6} width={w - 8} height="6" fill="#ffffff" />
      <text x="0" y={en ? -28 : -12} textAnchor="middle" fill={INK} fontSize="17" fontWeight="900">
        {jp}
      </text>
      {en ? (
        <text
          x="0"
          y="-10"
          textAnchor="middle"
          fill={accent === "#facc15" || accent === "#fbbf24" ? "#b45309" : accent === "#f43f5e" || accent === "#fb7185" ? "#be123c" : "#047857"}
          fontSize="12.5"
          fontWeight="800"
        >
          {en}
        </text>
      ) : null}
    </g>
  );
};

/** Japanese Compact Car / Taxi / City Bus 2.5D Vector Prop */
const JapaneseVehicle: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly kind: "taxi" | "kei" | "bus";
  readonly scale?: number;
}> = ({ x, y, kind, scale = 1 }) => {
  if (kind === "bus") {
    return (
      <g transform={`translate(${x}, ${y}) scale(${scale})`}>
        <rect x="0" y="0" width="136" height="58" rx="10" fill="#e2e8f0" stroke={INK} strokeWidth="3" />
        <rect x="2" y="34" width="132" height="14" fill="#0284c7" />
        <rect x="10" y="9" width="28" height="22" rx="4" fill="#7dd3fc" stroke={INK} strokeWidth="2" />
        <rect x="44" y="9" width="28" height="22" rx="4" fill="#7dd3fc" stroke={INK} strokeWidth="2" />
        <rect x="78" y="9" width="28" height="22" rx="4" fill="#7dd3fc" stroke={INK} strokeWidth="2" />
        <rect x="112" y="9" width="16" height="22" rx="3" fill="#bae6fd" stroke={INK} strokeWidth="2" />
        <circle cx="28" cy="58" r="10" fill="#1e293b" stroke={INK} strokeWidth="2.5" />
        <circle cx="28" cy="58" r="4.5" fill="#cbd5e1" />
        <circle cx="108" cy="58" r="10" fill="#1e293b" stroke={INK} strokeWidth="2.5" />
        <circle cx="108" cy="58" r="4.5" fill="#cbd5e1" />
      </g>
    );
  }
  const bodyColor = kind === "taxi" ? "#facc15" : "#38bdf8";
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <path d="M 12 18 L 24 2 L 66 2 L 78 18 Z" fill={bodyColor} stroke={INK} strokeWidth="2.8" />
      <rect x="2" y="16" width="88" height="24" rx="7" fill={bodyColor} stroke={INK} strokeWidth="2.8" />
      <rect x="26" y="6" width="18" height="11" rx="2" fill="#e0f2fe" stroke={INK} strokeWidth="1.8" />
      <rect x="48" y="6" width="18" height="11" rx="2" fill="#e0f2fe" stroke={INK} strokeWidth="1.8" />
      {kind === "taxi" ? (
        <>
          <rect x="38" y="-4" width="14" height="6" rx="2" fill="#ef4444" stroke={INK} strokeWidth="1.6" />
          <rect x="4" y="25" width="84" height="5" fill="#10b981" />
        </>
      ) : null}
      <circle cx="20" cy="41" r="8.5" fill="#1e293b" stroke={INK} strokeWidth="2.4" />
      <circle cx="20" cy="41" r="3.5" fill="#cbd5e1" />
      <circle cx="70" cy="41" r="8.5" fill="#1e293b" stroke={INK} strokeWidth="2.4" />
      <circle cx="70" cy="41" r="3.5" fill="#cbd5e1" />
    </g>
  );
};

/**
 * Scene 1 (Real-Japan 2.5D Street & Station World — `960×460`):
 * Bright Japanese street with white crosswalk (横断歩道), gliding cars/taxi/bus,
 * Konbini 24h store, red vending machine, cozy houses with glowing windows & chimney steam,
 * Mt. Fuji horizon, 3+ expressive Toon characters, and live 4-exit or Shinjuku Hook gantry!
 */
const WalkToStationRealJapan25D: React.FC<{
  readonly frame: number;
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
  readonly visualBeat?: string;
}> = ({ frame, localSec, progress, activeKey, visualBeat }) => {
  const effectiveKey =
    activeKey ||
    (progress < 0.25 ? "north" : progress < 0.5 ? "south" : progress < 0.75 ? "east" : "west");
  const isHook = visualBeat === "hook_shinjuku";

  const camGlideX = Math.sin(localSec * 0.55) * 18;
  const stride = Math.sin(localSec * 6.8) * 24;
  const bob = Math.abs(Math.cos(localSec * 6.8)) * 4;

  const stickX = lerpRange(progress, 0.0, 0.28, 175, 360);
  const taxiX = ((localSec * 92) % 1120) - 120;
  const busX = 960 - ((localSec * 64) % 1160);
  const keiX = ((localSec * 75 + 480) % 1120) - 120;
  const cloudShift = (localSec * 14) % 960;

  const exits = [
    { key: "north", jp: "北口", en: "North", x: 16, y: 12, color: "#34d399" },
    { key: "south", jp: "南口", en: "South", x: 144, y: 12, color: "#38bdf8" },
    { key: "east", jp: "東口", en: "East", x: 16, y: 58, color: "#fbbf24" },
    { key: "west", jp: "西口", en: "West", x: 144, y: 58, color: "#fb7185" },
  ];
  const activeExit = exits.find((e) => e.key === effectiveKey) ?? exits[0];
  const heroExpr = isHook
    ? cycleExpression(localSec, 1, ["surprised", "amazed", "surprised"])
    : cycleExpression(localSec, 1, ["happy", "focused", "proud"]);

  const {
    BUILDING_BASE_Y,
    ROAD_TOP_Y,
    ROAD_FAR_LANE_Y,
    ROAD_NEAR_LANE_Y,
    ROAD_BOTTOM_Y,
    GUARDRAIL_TOP_Y,
    GUARDRAIL_BASE_Y,
    CURB_Y,
    SIDEWALK_TOP_Y,
    SIDEWALK_FEET_Y,
  } = STREET_LAYOUT_25D;

  const heroFootY = SIDEWALK_FEET_Y - bob;
  const heroCenterY = heroFootY - 56 * 1.04;
  const companionCenterY = SIDEWALK_FEET_Y - 4 - 56 * 0.84;

  return (
    <g>
      {/* Layer 0: Bright Saturated Sky + Drifting Clouds + Mt. Fuji + Distant Skyline (0.2x parallax) */}
      <g transform={`translate(${camGlideX * 0.2}, 0)`}>
        <defs>
          <linearGradient id="sky-japan-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="52%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
        </defs>
        <rect x="-180" y="-40" width="1320" height={BUILDING_BASE_Y + 50} fill="url(#sky-japan-day)" />
        {[0, 1, 2].map((i) => {
          const cx = ((i * 340 + cloudShift) % 1080) - 80;
          return (
            <g key={i} transform={`translate(${cx}, ${28 + (i % 2) * 24})`} opacity="0.92">
              <ellipse cx="40" cy="20" rx="38" ry="16" fill="#ffffff" stroke={INK} strokeWidth="2.2" />
              <ellipse cx="70" cy="18" rx="28" ry="14" fill="#f8fafc" stroke={INK} strokeWidth="2" />
            </g>
          );
        })}
        {/* Mt. Fuji */}
        <path d="M 380 250 L 508 118 L 572 118 L 700 250 Z" fill="#4f46e5" stroke={INK} strokeWidth="2.8" />
        <path d="M 484 144 L 508 118 L 572 118 L 596 144 L 568 154 L 540 142 L 512 154 Z" fill="#ffffff" />
        {/* Tokyo Towers & Apartment Blocks (strictly behind y <= 250) */}
        {[30, 125, 220, 310, 740, 840].map((bx, i) => (
          <g key={bx} transform={`translate(${bx}, ${96 + (i % 3) * 18})`}>
            <rect width="74" height="156" rx="5" fill={i % 2 === 0 ? "#334155" : "#475569"} stroke={INK} strokeWidth="2.5" />
            {[16, 40, 64, 88].map((wy) => (
              <g key={wy}>
                <rect x="12" y={wy} width="18" height="13" rx="2" fill="#fde047" opacity="0.82" />
                <rect x="42" y={wy} width="18" height="13" rx="2" fill="#bae6fd" opacity="0.72" />
              </g>
            ))}
          </g>
        ))}
      </g>

      {/* Layer 1: Midground Japanese House, Konbini 24h, Drink Machine & Station Building (y <= BUILDING_BASE_Y = 250) */}
      <g transform={`translate(${camGlideX * 0.55}, 0)`}>
        {/* Traditional Tiled House with Chimney Steam */}
        <g transform={`translate(26, ${BUILDING_BASE_Y - 138})`}>
          <SteamPuffs originX={34} originY={-10} localSec={localSec} driftX={24} riseY={34} scale={0.9} />
          <rect x="24" y="-8" width="16" height="24" fill="#94a3b8" stroke={INK} strokeWidth="2.4" />
          <polygon points="-10,32 72,-8 154,32" fill="#dc2626" stroke={INK} strokeWidth="3.2" />
          <rect x="6" y="32" width="132" height="106" rx="4" fill="#fef3c7" stroke={INK} strokeWidth="3" />
          <rect x="22" y="50" width="42" height="34" rx="4" fill="#fbbf24" stroke={INK} strokeWidth="2.4" />
          <line x1="43" y1="50" x2="43" y2="84" stroke={INK} strokeWidth="2" />
          <line x1="22" y1="67" x2="64" y2="67" stroke={INK} strokeWidth="2" />
          <rect x="82" y="60" width="44" height="78" rx="3" fill="#0f766e" stroke={INK} strokeWidth="2.6" />
        </g>

        {/* Glowing Japanese 24h Convenience Store (コンビニ) */}
        <g transform={`translate(192, ${BUILDING_BASE_Y - 128})`}>
          <rect x="0" y="0" width="176" height="128" rx="6" fill="#f8fafc" stroke={INK} strokeWidth="3.2" />
          <rect x="0" y="0" width="176" height="28" rx="4" fill="#10b981" stroke={INK} strokeWidth="2.8" />
          <rect x="0" y="24" width="176" height="8" fill="#f97316" />
          <text x="88" y="20" textAnchor="middle" fill="#ffffff" fontSize="14.5" fontWeight="900">
            24h コンビニ SHOP
          </text>
          <rect x="18" y="42" width="84" height="60" rx="4" fill="#fde68a" stroke={INK} strokeWidth="2.4" />
          <rect x="114" y="42" width="46" height="86" rx="4" fill="#bae6fd" stroke={INK} strokeWidth="2.4" />
        </g>

        {/* Classic Japanese Drink Vending Machine (自販機) */}
        <g transform={`translate(384, ${BUILDING_BASE_Y - 96})`}>
          <rect x="0" y="0" width="54" height="96" rx="6" fill="#ef4444" stroke={INK} strokeWidth="2.8" />
          <rect x="7" y="10" width="40" height="42" rx="4" fill="#e0f2fe" stroke={INK} strokeWidth="2" />
          <rect x="12" y="16" width="9" height="12" rx="1.5" fill="#38bdf8" />
          <rect x="24" y="16" width="9" height="12" rx="1.5" fill="#34d399" />
          <rect x="36" y="16" width="8" height="12" rx="1.5" fill="#f59e0b" />
          <rect x="12" y="66" width="30" height="14" rx="2.5" fill="#1e293b" stroke={INK} strokeWidth="1.6" />
        </g>

        {/* Grand Japanese Train Station Building on Right (bottom at BUILDING_BASE_Y = 250) */}
        <g transform={`translate(556, ${BUILDING_BASE_Y - 166})`}>
          <rect x="0" y="28" width="364" height="138" rx="10" fill="#f1f5f9" stroke={INK} strokeWidth="3.4" />
          <path d="M -14 32 L 378 32 L 364 4 L 0 4 Z" fill="#10b981" stroke={INK} strokeWidth="3.2" />
          <rect x="72" y="-14" width="220" height="36" rx="8" fill="#064e3b" stroke={INK} strokeWidth="3.2" />
          <text x="182" y="10" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900">
            {isHook ? "新宿駅 SHINJUKU" : "駅 STATION"}
          </text>
          <rect x="104" y="34" width="156" height="24" rx="5" fill="#148c53" stroke={INK} strokeWidth="2.2" />
          <text x="182" y="51" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">
            入口 ENTRANCE
          </text>
          <rect x="112" y="66" width="140" height="100" rx="6" fill="#fef08a" stroke={INK} strokeWidth="3" />
          <line x1="182" y1="66" x2="182" y2="166" stroke={INK} strokeWidth="2.8" />
        </g>

        {/* Overhead 4-Exit Directional Gantry or Hook Chaos Board (cleanly above station) */}
        {isHook ? (
          <g transform="translate(566, -12)">
            <rect x="0" y="0" width="340" height="76" rx="12" fill="#1e293b" stroke="#fbbf24" strokeWidth="3.6" />
            <text x="170" y="31" textAnchor="middle" fill="#fde047" fontSize="22" fontWeight="900">
              200+ EXITS?! 😱
            </text>
            <text x="170" y="56" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="800">
              ← 北口 · 南口 · 東口 · 西口 · 中央口 →
            </text>
          </g>
        ) : (
          <g transform="translate(604, -14)">
            <rect x="0" y="0" width="276" height="82" rx="12" fill="#1e293b" stroke={INK} strokeWidth="3.4" />
            {exits.map((ex) => {
              const isLit = ex.key === effectiveKey;
              return (
                <g key={ex.key} transform={`translate(${ex.x}, ${ex.y === 58 ? 44 : 8})`}>
                  <rect
                    x="0"
                    y="0"
                    width="116"
                    height="30"
                    rx="7"
                    fill={isLit ? ex.color : "#0f172a"}
                    stroke={isLit ? "#ffffff" : "#475569"}
                    strokeWidth={isLit ? "3" : "1.8"}
                    opacity={isLit ? 1 : 0.65}
                  />
                  <text x="58" y="14" textAnchor="middle" fill={isLit ? INK : "#cbd5e1"} fontSize="13.5" fontWeight="900">
                    {ex.jp}
                  </text>
                  <text x="58" y="26" textAnchor="middle" fill={isLit ? INK : "#94a3b8"} fontSize="9.5" fontWeight="800">
                    {ex.en} Exit
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </g>

      {/* Layer 2: Asphalt Road Lanes (ROAD_TOP_Y = 250 .. ROAD_BOTTOM_Y = 346) & Moving Vehicles */}
      <g transform={`translate(${camGlideX * 0.78}, 0)`}>
        <rect
          x="-180"
          y={ROAD_TOP_Y}
          width="1320"
          height={ROAD_BOTTOM_Y - ROAD_TOP_Y}
          fill="#334155"
          stroke={INK}
          strokeWidth="3"
        />
        {/* Dashed white lane divider */}
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={-120 + i * 70} y="294" width="38" height="5" rx="2" fill="#f8fafc" opacity="0.88" />
        ))}
        {/* Authentic White Crosswalk Stripes inside Road Bounds (y = 256..336) */}
        {[256, 272, 288, 304, 320, 334].map((cy) => (
          <rect key={cy} x="392" y={cy} width="96" height="8" rx="2" fill="#ffffff" opacity="0.9" />
        ))}

        {/* Traffic Strictly Inside Road Lanes Behind Guardrail */}
        <JapaneseVehicle x={busX} y={ROAD_FAR_LANE_Y} kind="bus" scale={0.68} />
        <JapaneseVehicle x={keiX} y={ROAD_FAR_LANE_Y + 8} kind="kei" scale={0.66} />
        <JapaneseVehicle x={taxiX} y={ROAD_NEAR_LANE_Y} kind="taxi" scale={0.82} />
      </g>

      {/* Layer 3: Raised Concrete Curb + White Japanese Pedestrian Guardrail (ガードレール) */}
      <g transform={`translate(${camGlideX * 0.9}, 0)`}>
        <rect x="-180" y={CURB_Y} width="1320" height="14" fill="#cbd5e1" stroke={INK} strokeWidth="2.6" />
        <rect x="-180" y={CURB_Y} width="1320" height="4" fill="#e2e8f0" />
        {/* White Steel Guardrail Posts & Dual Horizontal Rails Separating Road from Sidewalk */}
        {Array.from({ length: 15 }, (_, i) => (
          <rect
            key={`post-${i}`}
            x={-130 + i * 86}
            y={GUARDRAIL_TOP_Y - 2}
            width="8"
            height={GUARDRAIL_BASE_Y - GUARDRAIL_TOP_Y + 4}
            rx="2"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="2.2"
          />
        ))}
        <rect
          x="-180"
          y={GUARDRAIL_TOP_Y}
          width="1320"
          height="7"
          fill="#ffffff"
          stroke={INK}
          strokeWidth="2.4"
        />
        <rect
          x="-180"
          y={GUARDRAIL_TOP_Y + 12}
          width="1320"
          height="7"
          fill="#ffffff"
          stroke={INK}
          strokeWidth="2.4"
        />
      </g>

      {/* Layer 4: Foreground Pedestrian Sidewalk (歩道 y >= 360) & Characters (NEVER overlap cars!) */}
      <g transform={`translate(${camGlideX}, 0)`}>
        <rect
          x="-180"
          y={SIDEWALK_TOP_Y}
          width="1320"
          height="130"
          fill="#94a3b8"
          stroke={INK}
          strokeWidth="2.8"
        />
        {/* Subtle sidewalk paving tile joints & yellow tactile warning edge */}
        <rect x="-180" y={SIDEWALK_TOP_Y + 8} width="1320" height="7" fill="#facc15" stroke={INK} strokeWidth="1.6" />
        {Array.from({ length: 18 }, (_, i) => (
          <line
            key={`tile-${i}`}
            x1={-120 + i * 74}
            y1={SIDEWALK_TOP_Y + 16}
            x2={-150 + i * 74}
            y2={475}
            stroke="#64748b"
            strokeWidth="1.8"
            opacity="0.55"
          />
        ))}

        {/* Background Commuters / Reactors Walking on Foreground Sidewalk */}
        <ToonCharacter2D
          x={536 + Math.sin(localSec * 1.6) * 14}
          y={companionCenterY}
          facing={-1}
          scale={0.84}
          seed={2}
          jacketColor="#3f6fb5"
          hairOrBandColor="#f59e0b"
          expr={cycleExpression(localSec, 2, ["focused", "amazed", "happy"])}
          blink={computeBlink(frame, 2)}
          rightUpperArmDeg={76}
          rightForearmDeg={95}
        />
        <ToonCharacter2D
          x={822 - Math.cos(localSec * 1.3) * 12}
          y={companionCenterY}
          facing={-1}
          scale={0.84}
          seed={3}
          jacketColor="#7b5ac9"
          hairOrBandColor="#f43f5e"
          expr={cycleExpression(localSec, 3, ["happy", "wink", "focused"])}
          blink={computeBlink(frame, 3)}
        />

        {/* Hero Traveler Strictly on Foreground Sidewalk */}
        <ToonCharacter2D
          x={stickX}
          y={heroCenterY}
          facing={1}
          scale={1.04}
          seed={1}
          jacketColor="#148c53"
          hairOrBandColor={activeExit.color}
          leanDeg={isHook ? -4 : 6}
          headTiltDeg={isHook ? -10 : -8}
          leftUpperArmDeg={stride * 0.65 - 12}
          leftForearmDeg={stride * 0.45 + 14}
          rightUpperArmDeg={isHook ? 132 : 114}
          rightForearmDeg={isHook ? 148 : 126}
          leftThighDeg={-stride * 0.72}
          leftCalfDeg={-stride * 0.4 - 4}
          rightThighDeg={stride * 0.72}
          rightCalfDeg={stride * 0.4}
          hasBackpack
          expr={heroExpr}
          blink={computeBlink(frame, 1)}
          sweatDrop={isHook}
          accentColor={activeExit.color}
        />

        <SceneSpeechTag
          x={stickX - 8}
          y={heroCenterY - 96}
          jp={isHook ? "出口が200以上？！" : `${activeExit.jp}はどこですか？`}
          en={isHook ? "200+ Exits at Shinjuku?!" : `Where is ${activeExit.en} Exit?`}
          accent={activeExit.color}
        />
      </g>

      {/* Layer 5: Foreground Parallax Streetlight Pole (1.18x) */}
      <g transform={`translate(${camGlideX * 1.18}, 0)`}>
        <rect x="44" y="88" width="12" height="390" fill="#1e293b" stroke={INK} strokeWidth="2.6" />
        <rect x="34" y="76" width="54" height="22" rx="8" fill="#fbbf24" stroke={INK} strokeWidth="2.4" />
        <text x="61" y="91" textAnchor="middle" fill={INK} fontSize="11" fontWeight="900">
          JR 駅
        </text>
      </g>
    </g>
  );
};

/**
 * Scene 2 (Real-Japan 2.5D Ticket Concourse — `960×460`):
 * Bright concourse with skylights, full color-coded Tokyo 運賃表 (Fare Map),
 * 2 Ticket Machines (券売機) with [EN] touchscreen, sparkling yen coins, Suica IC charge wave,
 * printed ticket ejection, and 3 queuing characters!
 */
const BuyTicketIcRealJapan25D: React.FC<{
  readonly frame: number;
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ frame, localSec, progress, activeKey }) => {
  const effectiveKey =
    activeKey || (progress < 0.28 ? "machine" : progress < 0.54 ? "ticket" : progress < 0.78 ? "fare" : "charge");
  const camGlideX = Math.sin(localSec * 0.5) * 14;

  const isMachine = effectiveKey === "machine" || effectiveKey === "ticket_machine";
  const isTicket = effectiveKey === "ticket";
  const isFare = effectiveKey === "fare";
  const isCharge = effectiveKey === "charge";

  const coinDropY = (localSec * 42) % 44;
  const chargeFill = isCharge ? 0.35 + 0.6 * clamp01((localSec % 2.2) / 1.8) : 0.78;
  const rippleR = ((localSec * 38) % 30) + 6;
  const rippleA = 1 - (rippleR - 6) / 30;
  const heroExpr = cycleExpression(localSec, 1, isCharge ? ["amazed", "happy", "proud"] : ["focused", "happy", "wink"]);

  return (
    <g>
      {/* Layer 0: Bright Station Concourse Interior & Skylight Beams (0.3x parallax) */}
      <g transform={`translate(${camGlideX * 0.3}, 0)`}>
        <defs>
          <linearGradient id="concourse-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f3d56" />
            <stop offset="100%" stopColor="#1e4963" />
          </linearGradient>
        </defs>
        <rect x="-180" y="-40" width="1320" height="420" fill="url(#concourse-sky)" />
        {[140, 480, 820].map((lx) => (
          <g key={lx}>
            <polygon points={`${lx - 48},18 ${lx + 48},18 ${lx + 115},360 ${lx - 115},360`} fill="#fef3c7" opacity="0.09" />
            <rect x={lx - 54} y="12" width="108" height="14" rx="7" fill="#fef3c7" stroke={INK} strokeWidth="2.4" />
          </g>
        ))}

        {/* Illuminated Large Tokyo 運賃表 Fare Map Panel */}
        <g transform="translate(46, 56)">
          <rect
            x="0"
            y="0"
            width="284"
            height="170"
            rx="12"
            fill="#f8fafc"
            stroke={isFare ? "#fbbf24" : INK}
            strokeWidth={isFare ? "4.6" : "3.2"}
          />
          <rect x="0" y="0" width="284" height="34" rx="10" fill={isFare ? "#f59e0b" : "#0f766e"} stroke={INK} strokeWidth="2.6" />
          <text x="142" y="23" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
            運賃表 FARE MAP
          </text>
          <line x1="34" y1="92" x2="250" y2="92" stroke="#10b981" strokeWidth="7" strokeLinecap="round" />
          {[
            { cx: 52, price: "¥180", name: "渋谷" },
            { cx: 142, price: "¥200", name: "新宿" },
            { cx: 232, price: "¥320", name: "東京" },
          ].map((st) => (
            <g key={st.name}>
              <circle cx={st.cx} cy="92" r="10" fill="#ffffff" stroke={INK} strokeWidth="2.8" />
              <text x={st.cx} y="70" textAnchor="middle" fill={INK} fontSize="14.5" fontWeight="900">
                {st.name}
              </text>
              <rect x={st.cx - 26} y="112" width="52" height="26" rx="6" fill={isFare ? "#fde047" : "#e2e8f0"} stroke={INK} strokeWidth="2" />
              <text x={st.cx} y="130" textAnchor="middle" fill={INK} fontSize="13.5" fontWeight="900">
                {st.price}
              </text>
            </g>
          ))}
        </g>
      </g>

      {/* Layer 1: Polished Concourse Floor + Secondary Companion Ticket Machine (0.65x) */}
      <rect x="-180" y="360" width="1320" height="140" fill="#334155" stroke={INK} strokeWidth="3.2" />
      <rect x="-180" y="360" width="1320" height="14" fill="#64748b" />

      <g transform={`translate(${742 + camGlideX * 0.72}, 78)`} opacity="0.9">
        <rect x="0" y="0" width="166" height="282" rx="12" fill="#0d9488" stroke={INK} strokeWidth="3.2" />
        <rect x="12" y="14" width="142" height="28" rx="6" fill="#064e3b" />
        <text x="83" y="33" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="900">
          IC 専用機
        </text>
        <rect x="20" y="54" width="126" height="90" rx="7" fill="#0f172a" stroke={INK} strokeWidth="2.4" />
        <text x="83" y="102" textAnchor="middle" fill="#34d399" fontSize="15" fontWeight="900">
          Suica / PASMO
        </text>
      </g>

      {/* Main Detailed Hero 券売機 Ticket Vending Machine (Widened & Clip-Path Protected) */}
      <g transform={`translate(${452 + camGlideX * 0.85}, 56)`}>
        <defs>
          <clipPath id="ticket-screen-clip">
            <rect x="16" y="56" width="166" height="122" rx="8" />
          </clipPath>
          <clipPath id="ticket-slot-clip">
            <rect x="24" y="196" width="226" height="52" rx="8" />
          </clipPath>
        </defs>
        <rect x="10" y="10" width="274" height="304" rx="14" fill="rgba(17,24,39,0.4)" />
        <rect x="0" y="0" width="274" height="304" rx="14" fill="#0284c7" stroke={INK} strokeWidth="3.6" />
        <rect x="14" y="12" width="246" height="36" rx="7" fill="#064e3b" stroke={INK} strokeWidth="2.6" />
        <text x="137" y="36" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
          きっぷ 券売機・チャージ
        </text>

        <rect
          x="16"
          y="56"
          width="166"
          height="122"
          rx="8"
          fill="#0f172a"
          stroke={isMachine || isFare ? "#fde047" : INK}
          strokeWidth="3.2"
        />
        <g clipPath="url(#ticket-screen-clip)">
          <rect x="22" y="64" width="154" height="22" rx="4" fill="#148c53" />
          <text x="99" y="79" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900">
            {isCharge ? "Suica チャージ" : isTicket ? "きっぷ購入 TICKETS" : "TICKET MENU"}
          </text>

          {isCharge ? (
            <g>
              <rect x="26" y="102" width="146" height="18" rx="9" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.6" />
              <rect x="28" y="104" width={Math.round(142 * chargeFill)} height="14" rx="7" fill="#34d399" />
              <text x="99" y="148" textAnchor="middle" fill="#fde047" fontSize="17" fontWeight="900">
                +¥1,000 OK!
              </text>
            </g>
          ) : (
            <g>
              <rect x="22" y="94" width="74" height="32" rx="5" fill="#10b981" stroke="#a7f3d0" strokeWidth="1.6" />
              <text x="59" y="114" textAnchor="middle" fill="#ffffff" fontSize="11.5" fontWeight="900">
                片道 ¥200
              </text>
              <rect x="102" y="94" width="74" height="32" rx="5" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.6" />
              <text x="139" y="114" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="900">
                往復 ¥400
              </text>
              <rect x="22" y="136" width="74" height="28" rx="5" fill="#f59e0b" />
              <text x="59" y="154" textAnchor="middle" fill={INK} fontSize="10.5" fontWeight="900">
                ICチャージ
              </text>
              <rect x="102" y="136" width="74" height="28" rx="5" fill="#6366f1" />
              <text x="139" y="154" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="900">
                ENGLISH
              </text>
            </g>
          )}
        </g>

        <rect x="194" y="60" width="64" height="44" rx="6" fill="#fbbf24" stroke={INK} strokeWidth="2.4" />
        <text x="226" y="79" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="900">
          硬貨
        </text>
        <rect x="210" y="86" width="32" height="7" rx="3" fill={INK} />

        <rect
          x="192"
          y="116"
          width="68"
          height="58"
          rx="8"
          fill={isCharge ? "#0284c7" : "#0c4a6e"}
          stroke={isCharge ? "#34d399" : INK}
          strokeWidth="2.8"
        />
        <text x="226" y="151" textAnchor="middle" fill="#ffffff" fontSize="16.5" fontWeight="900">
          IC
        </text>
        {isCharge ? (
          <circle cx="226" cy="145" r={rippleR} fill="none" stroke="#34d399" strokeWidth="3.2" opacity={rippleA} />
        ) : null}

        <rect x="24" y="196" width="226" height="52" rx="8" fill="#0f172a" stroke={INK} strokeWidth="2.8" />
        <g clipPath="url(#ticket-slot-clip)">
          <g transform={`translate(82, ${isTicket ? 204 : 208})`}>
            <rect x="0" y="0" width="110" height="30" rx="5" fill="#fde68a" stroke={INK} strokeWidth="2.4" />
            <text x="55" y="20" textAnchor="middle" fill={INK} fontSize="13" fontWeight="900">
              切符 ¥200
            </text>
          </g>
        </g>

        <YenCoin x={-36} y={182 + (coinDropY % 26)} label="¥500" gold sparklePhase={localSec * 4.2} />
        <YenCoin x={-72} y={204 + ((coinDropY + 12) % 24)} label="¥100" gold={false} sparklePhase={localSec * 4.2 + 1.4} />
      </g>

      {/* Layer 2: 3 Characters in the Concourse */}
      <g transform={`translate(${camGlideX}, 0)`}>
        <ToonCharacter2D
          x={148}
          y={308}
          facing={1}
          scale={0.96}
          seed={4}
          jacketColor="#7b5ac9"
          hairOrBandColor="#fb7185"
          hasBackpack
          expr={cycleExpression(localSec, 4, ["happy", "focused", "amazed"])}
          blink={computeBlink(frame, 4)}
        />
        <ToonCharacter2D
          x={746}
          y={306}
          facing={1}
          scale={0.95}
          seed={5}
          jacketColor="#f08a2c"
          hairOrBandColor="#38bdf8"
          holdCardHand="right"
          rightUpperArmDeg={78}
          rightForearmDeg={95}
          expr={cycleExpression(localSec, 5, ["focused", "happy"])}
          blink={computeBlink(frame, 5)}
        />

        {/* Hero Traveler at Main Ticket Machine */}
        <ToonCharacter2D
          x={344 + Math.sin(localSec * 1.1) * 8}
          y={302}
          facing={1}
          scale={1.18}
          seed={1}
          jacketColor="#148c53"
          hairOrBandColor="#34d399"
          leanDeg={4}
          headTiltDeg={-4}
          rightUpperArmDeg={isCharge ? 78 : isTicket ? 114 : 96}
          rightForearmDeg={isCharge ? 96 : isTicket ? 124 : 112}
          hasBackpack
          holdCardHand={isCharge ? "right" : null}
          holdTicketHand={isTicket ? "right" : null}
          holdCoinHand={isFare || isMachine ? "right" : null}
          expr={heroExpr}
          blink={computeBlink(frame, 1)}
        />

        <SceneSpeechTag
          x={338}
          y={192}
          jp={isCharge ? "チャージします！" : isFare ? "東京駅までいくら？" : isTicket ? "切符を買いました！" : "英語ボタンで安心！"}
          en={isCharge ? "Top up Suica / PASMO" : isFare ? "Check train fare" : isTicket ? "Got my ticket!" : "Tap [English]"}
          accent={isCharge ? "#34d399" : "#fbbf24"}
        />
      </g>
    </g>
  );
};

/**
 * Scene 3 (Real-Japan 2.5D Ticket Gates & Uniformed 駅員 Staff Booth — `960×460`):
 * Multi-lane silver/blue 改札口 gates, bright yellow 精算機 with sparkling coins,
 * uniformed Japanese 駅員 in staff booth helping politely, + 3 commuters!
 */
const TapTicketGateRealJapan25D: React.FC<{
  readonly frame: number;
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ frame, localSec, progress, activeKey }) => {
  const effectiveKey =
    activeKey || (progress < 0.34 ? "gate" : progress < 0.62 ? "low_balance" : progress < 0.85 ? "adjust" : "staff");
  const camGlideX = Math.sin(localSec * 0.45) * 14;

  const isGate = effectiveKey === "gate";
  const isLowBalance = effectiveKey === "low_balance";
  const isAdjust = effectiveKey === "adjust";
  const isStaff = effectiveKey === "staff";

  const stickX = isStaff ? 268 : isAdjust ? 684 : 388 + (isGate ? Math.sin(localSec * 1.4) * 16 : 0);
  const pulseR = ((localSec * 38) % 32) + 6;
  const pulseA = 1 - (pulseR - 6) / 32;
  const heroExpr = isLowBalance
    ? cycleExpression(localSec, 1, ["surprised", "amazed"])
    : cycleExpression(localSec, 1, ["happy", "proud", "wink"]);

  return (
    <g>
      <rect x="-180" y="-40" width="1320" height="410" fill="#13293d" />
      <rect x="-180" y="356" width="1320" height="140" fill="#334155" stroke={INK} strokeWidth="3" />
      <rect x="-180" y="356" width="1320" height="14" fill="#64748b" />

      {/* Overhead Station Gate Signboard */}
      <g transform={`translate(${310 + camGlideX * 0.4}, 18)`}>
        <rect x="0" y="0" width="340" height="44" rx="9" fill="#064e3b" stroke={INK} strokeWidth="3.2" />
        <text x="170" y="29" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="900">
          改札口 TICKET GATES
        </text>
      </g>

      {/* Station Staff Window Booth (駅員室) with Uniformed Staff */}
      <g transform={`translate(${44 + camGlideX * 0.72}, 116)`}>
        <rect
          x="0"
          y="0"
          width="176"
          height="240"
          rx="10"
          fill="#1e3a5f"
          stroke={isStaff ? "#34d399" : INK}
          strokeWidth={isStaff ? "4.4" : "3.2"}
        />
        <rect x="16" y="14" width="144" height="28" rx="6" fill="#148c53" stroke={INK} strokeWidth="2.2" />
        <text x="88" y="33" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="900">
          駅員室 Staff
        </text>
        <rect x="20" y="54" width="136" height="104" rx="8" fill="#fef3c7" stroke={INK} strokeWidth="2.8" />
        {/* Uniformed Station Attendant inside window */}
        <ToonCharacter2D
          x={88}
          y={132}
          facing={1}
          scale={0.95}
          seed={7}
          jacketColor="#1e3a8a"
          uniformCap
          rightUpperArmDeg={isStaff ? 112 : 42}
          rightForearmDeg={isStaff ? 128 : 54}
          expr={cycleExpression(localSec, 7, ["happy", "proud", "happy"])}
          blink={computeBlink(frame, 7)}
          accentColor="#fbbf24"
        />
      </g>

      {/* Double Lane Silver & Blue Automatic Ticket Gate (改札口) */}
      <g transform={`translate(${434 + camGlideX * 0.85}, 186)`}>
        <rect
          x="0"
          y="0"
          width="126"
          height="170"
          rx="10"
          fill="#cbd5e1"
          stroke={isLowBalance ? "#f43f5e" : INK}
          strokeWidth="3.6"
        />
        <rect x="0" y="0" width="126" height="30" rx="8" fill={isLowBalance ? "#be123c" : "#0284c7"} stroke={INK} strokeWidth="3" />
        <text x="63" y="21" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="900">
          改札口
        </text>
        <rect
          x="20"
          y="46"
          width="52"
          height="40"
          rx="7"
          fill={isLowBalance ? "#4c0519" : "#0c4a6e"}
          stroke={isLowBalance ? "#fb7185" : "#38bdf8"}
          strokeWidth="2.8"
        />
        <text x="46" y="72" textAnchor="middle" fill="#e0f2fe" fontSize="15.5" fontWeight="900">
          IC
        </text>
        <rect
          x="98"
          y="50"
          width={isLowBalance ? 52 : 18}
          height="66"
          rx="5"
          fill={isLowBalance ? "#e11d48" : "#10b981"}
          stroke={INK}
          strokeWidth="2.6"
        />
        {(isGate || isLowBalance) ? (
          <circle cx="46" cy="66" r={pulseR} fill="none" stroke={isLowBalance ? "#f43f5e" : "#34d399"} strokeWidth="3.2" opacity={pulseA} />
        ) : null}
      </g>

      {/* Bright Yellow Fare Adjustment Machine (精算機) */}
      <g transform={`translate(${752 + camGlideX * 0.9}, 102)`}>
        <defs>
          <clipPath id="adjust-screen-clip">
            <rect x="16" y="58" width="116" height="68" rx="7" />
          </clipPath>
        </defs>
        <rect
          x="0"
          y="0"
          width="148"
          height="254"
          rx="12"
          fill="#facc15"
          stroke={isAdjust ? "#ffffff" : INK}
          strokeWidth={isAdjust ? "4.2" : "3.4"}
        />
        <rect x="14" y="14" width="120" height="32" rx="6" fill="#1e293b" stroke={INK} strokeWidth="2.4" />
        <text x="74" y="35" textAnchor="middle" fill="#facc15" fontSize="16" fontWeight="900">
          精算機
        </text>
        <rect x="16" y="58" width="116" height="68" rx="7" fill="#0f172a" stroke={INK} strokeWidth="2.4" />
        <g clipPath="url(#adjust-screen-clip)">
          <text x="74" y="86" textAnchor="middle" fill={isAdjust ? "#34d399" : "#fde047"} fontSize="14.5" fontWeight="900">
            {isAdjust ? "精算完了 ✓" : "不足 +¥180"}
          </text>
          <text x="74" y="109" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="800">
            Fare Adjust
          </text>
        </g>
        <rect x="34" y="144" width="80" height="18" rx="4" fill="#1e293b" />
        <rect x="28" y="180" width="92" height="44" rx="6" fill="#1e293b" stroke={INK} strokeWidth="2" />
        {isAdjust ? (
          <g transform="translate(36, 189)">
            <rect x="0" y="0" width="76" height="24" rx="4" fill="#fde68a" stroke={INK} strokeWidth="2" />
            <text x="38" y="16" textAnchor="middle" fill={INK} fontSize="10.5" fontWeight="900">
              精算券 OK
            </text>
          </g>
        ) : null}
        {isAdjust ? <YenCoin x={-16} y={48 + ((localSec * 22) % 24)} label="¥100" gold sparklePhase={localSec * 4.2} /> : null}
      </g>

      {/* Commuter passing through adjacent lane + Hero Traveler */}
      <g transform={`translate(${camGlideX}, 0)`}>
        <ToonCharacter2D
          x={608 + Math.sin(localSec * 1.2) * 14}
          y={292}
          facing={1}
          scale={0.92}
          seed={6}
          jacketColor="#0d9488"
          hairOrBandColor="#fbbf24"
          expr={cycleExpression(localSec, 6, ["happy", "focused"])}
          blink={computeBlink(frame, 6)}
        />

        <ToonCharacter2D
          x={stickX}
          y={296}
          facing={isStaff ? -1 : 1}
          scale={1.18}
          seed={1}
          jacketColor="#148c53"
          hairOrBandColor={isLowBalance ? "#fb7185" : "#34d399"}
          leanDeg={isLowBalance ? -10 : 5}
          headTiltDeg={isLowBalance ? -10 : 2}
          rightUpperArmDeg={isAdjust || isGate || isLowBalance ? 84 : 112}
          rightForearmDeg={isAdjust || isGate || isLowBalance ? 98 : 122}
          hasBackpack
          holdCardHand={isGate || isLowBalance ? "right" : null}
          holdCoinHand={isAdjust ? "right" : null}
          expr={heroExpr}
          blink={computeBlink(frame, 1)}
          sweatDrop={isLowBalance}
          accentColor={isLowBalance ? "#fb7185" : "#34d399"}
        />

        <SceneSpeechTag
          x={stickX}
          y={188}
          jp={isLowBalance ? "✕ 残高不足！" : isAdjust ? "精算 OK! ✓" : isStaff ? "すみません！" : "ピッ！ ✓ OK"}
          en={isLowBalance ? "Use yellow 精算機" : isAdjust ? "Fare Adjusted" : isStaff ? "Ask station staff" : "Pass smoothly"}
          accent={isLowBalance ? "#f43f5e" : isAdjust ? "#facc15" : "#34d399"}
        />
      </g>
    </g>
  );
};

/**
 * Scene 4 (Real-Japan 2.5D Platform & Train World — `960×460`):
 * Elevated Tokyo platform with yellow tactile blocks (点字ブロック),
 * passing illuminated city buildings, multi-car Japanese commuter train with
 * air-brake steam puffs, bright yellow 出口 EXIT gantry, and Priority Seat / Manner Mode beats!
 */
const RideAndExitTrainRealJapan25D: React.FC<{
  readonly frame: number;
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
  readonly visualBeat?: string;
}> = ({ frame, localSec, progress, activeKey, visualBeat }) => {
  const effectiveKey = visualBeat || activeKey || (progress < 0.5 ? "rapid" : "exit");
  const camGlideX = Math.sin(localSec * 0.45) * 14;

  const isTrainType =
    effectiveKey === "local" || effectiveKey === "rapid" || effectiveKey === "express" || effectiveKey === "limited";
  const isTransfer = effectiveKey === "transfer";
  const isLastTrain = effectiveKey === "last_train";
  const isPrioritySeat = effectiveKey === "priority_seat";
  const isMannerMode = effectiveKey === "manner_mode";
  const isTactile = effectiveKey === "tactile";
  const isExitOrGuide = effectiveKey === "exit" || effectiveKey === "guide";

  const trainBadge =
    effectiveKey === "local"
      ? { jp: "各駅停車", en: "Local", color: "#38bdf8" }
      : effectiveKey === "express"
        ? { jp: "急行", en: "Express", color: "#fbbf24" }
        : effectiveKey === "limited"
          ? { jp: "特急", en: "Ltd. Exp.", color: "#f43f5e" }
          : { jp: "快速", en: "Rapid", color: "#34d399" };

  const trainCruiseX = isTrainType ? -14 + Math.sin(localSec * 0.9) * 18 : 0;
  const doorOpen = isExitOrGuide ? 26 : 10;
  const bgScroll = isTrainType ? (localSec * 100) % 160 : 0;
  const heroExpr = cycleExpression(localSec, 1, ["happy", "proud", "amazed"]);

  return (
    <g>
      {/* Layer 0: Scrolling Twilight Tokyo Skyline & Illuminated Buildings (0.3x parallax) */}
      <g transform={`translate(${camGlideX * 0.3}, 0)`}>
        <defs>
          <linearGradient id="sky-platform-25d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e3a5f" />
          </linearGradient>
        </defs>
        <rect x="-180" y="-40" width="1320" height="420" fill="url(#sky-platform-25d)" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const bx = ((i * 160 - bgScroll + 1120) % 1120) - 90;
          return (
            <g key={i} transform={`translate(${bx}, ${112 + (i % 2) * 28})`}>
              <rect width="84" height="164" rx="5" fill="#1e293b" stroke={INK} strokeWidth="2.5" />
              {[18, 46, 74].map((wy) => (
                <g key={wy}>
                  <rect x="14" y={wy} width="18" height="15" rx="2" fill="#fde047" opacity="0.82" />
                  <rect x="48" y={wy} width="18" height="15" rx="2" fill="#7dd3fc" opacity="0.56" />
                </g>
              ))}
            </g>
          );
        })}
      </g>

      {/* Layer 1: Overhead Platform Signage & Yellow EXIT Gantry (0.65x) */}
      <g transform={`translate(${camGlideX * 0.65}, 0)`}>
        <g transform="translate(226, 20)">
          <rect
            x="0"
            y="0"
            width="216"
            height="64"
            rx="10"
            fill="#0f172a"
            stroke={isTrainType ? trainBadge.color : INK}
            strokeWidth="3.2"
          />
          <rect x="10" y="9" width="196" height="24" rx="6" fill={trainBadge.color} />
          <text x="108" y="26" textAnchor="middle" fill={INK} fontSize="15.5" fontWeight="900">
            3番線 {trainBadge.jp}
          </text>
          <text x="108" y="52" textAnchor="middle" fill="#e2e8f0" fontSize="12.5" fontWeight="800">
            {trainBadge.en} · 新宿 Shinjuku
          </text>
        </g>

        {isLastTrain ? (
          <g transform="translate(340, 22)">
            <rect x="0" y="0" width="234" height="62" rx="10" fill="#450a0a" stroke="#fbbf24" strokeWidth="3.4" />
            <text x="117" y="27" textAnchor="middle" fill="#fde047" fontSize="18" fontWeight="900">
              23:58 終電!
            </text>
            <text x="117" y="49" textAnchor="middle" fill="#ffffff" fontSize="12.5" fontWeight="800">
              Last Train Departing
            </text>
          </g>
        ) : isTransfer ? (
          <g transform="translate(332, 22)">
            <rect x="0" y="0" width="250" height="62" rx="10" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="3.4" />
            <text x="125" y="27" textAnchor="middle" fill="#ffffff" fontSize="16.5" fontWeight="900">
              乗り換え Transfer ⇄
            </text>
            <text x="125" y="49" textAnchor="middle" fill="#7dd3fc" fontSize="12.5" fontWeight="800">
              JR 山手線 → 東京メトロ
            </text>
          </g>
        ) : null}

        <g transform="translate(690, 20)" opacity={isExitOrGuide ? 1 : 0.78}>
          <rect
            x="0"
            y="0"
            width="230"
            height="64"
            rx="10"
            fill="#facc15"
            stroke={isExitOrGuide ? "#ffffff" : INK}
            strokeWidth={isExitOrGuide ? "4.2" : "3"}
          />
          <text x="115" y="30" textAnchor="middle" fill={INK} fontSize="22" fontWeight="900">
            出口 EXIT →
          </text>
          <text x="115" y="51" textAnchor="middle" fill="#1e293b" fontSize="12.5" fontWeight="800">
            案内 Station Guide
          </text>
        </g>
      </g>

      {/* Layer 1.5: Multi-Car Commuter Train with Air-Brake Steam Puffs */}
      <g transform={`translate(${126 + trainCruiseX + camGlideX * 0.85}, 148)`}>
        <SteamPuffs originX={44} originY={186} localSec={localSec} driftX={-34} riseY={24} scale={0.9} />
        <SteamPuffs originX={640} originY={186} localSec={localSec + 0.45} driftX={34} riseY={24} scale={0.9} />

        <rect x="0" y="0" width="708" height="198" rx="20" fill="#e2e8f0" stroke={INK} strokeWidth="3.8" />
        <rect x="4" y="114" width="700" height="24" fill={trainBadge.color} />
        <rect x="82" y="-10" width="110" height="10" rx="4" fill="#64748b" stroke={INK} strokeWidth="2.4" />
        <rect x="510" y="-10" width="110" height="10" rx="4" fill="#64748b" stroke={INK} strokeWidth="2.4" />

        {/* Lit Passenger Windows + Etiquette Cutaways */}
        <rect x="34" y="36" width="150" height="68" rx="9" fill="#fef3c7" stroke={INK} strokeWidth="3" />
        <rect x="524" y="36" width="150" height="68" rx="9" fill="#fef3c7" stroke={INK} strokeWidth="3" />
        {isPrioritySeat ? (
          <g transform="translate(46, 44)">
            <rect x="0" y="0" width="126" height="52" rx="6" fill="#fbcfe8" stroke={INK} strokeWidth="2.2" />
            <text x="63" y="24" textAnchor="middle" fill="#be185d" fontSize="14.5" fontWeight="900">
              ♡ 優先席
            </text>
            <text x="63" y="42" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="800">
              Priority Seat
            </text>
          </g>
        ) : isMannerMode ? (
          <g transform="translate(536, 44)">
            <rect x="0" y="0" width="126" height="52" rx="6" fill="#dbeafe" stroke={INK} strokeWidth="2.2" />
            <text x="63" y="24" textAnchor="middle" fill="#1d4ed8" fontSize="14" fontWeight="900">
              🔇 マナーモード
            </text>
            <text x="63" y="42" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="800">
              No Phone Calls
            </text>
          </g>
        ) : null}

        <rect x="48" y="10" width="138" height="21" rx="5" fill="#0f172a" stroke={INK} strokeWidth="2" />
        <text x="117" y="25" textAnchor="middle" fill={trainBadge.color} fontSize="12.5" fontWeight="900">
          {trainBadge.jp} · 新宿行
        </text>

        {/* Center Sliding Doorway */}
        <rect x="288" y="28" width="132" height="158" rx="7" fill="#0f172a" stroke={INK} strokeWidth="3.2" />
        <rect
          x={290 - doorOpen}
          y="30"
          width="62"
          height="154"
          rx="3"
          fill="#94a3b8"
          fillOpacity={0.85}
          stroke={INK}
          strokeWidth="2.2"
        />
        <rect
          x={356 + doorOpen}
          y="30"
          width="62"
          height="154"
          rx="3"
          fill="#94a3b8"
          fillOpacity={0.85}
          stroke={INK}
          strokeWidth="2.2"
        />
      </g>

      {/* Platform Foreground + Authentic Yellow 点字ブロック Tactile Paving Blocks */}
      <rect x="-180" y="348" width="1320" height="150" fill="#334155" stroke={INK} strokeWidth="3.2" />
      <rect x="-180" y="348" width="1320" height="18" fill={isTactile ? "#fde047" : "#facc15"} stroke={INK} strokeWidth="2.2" />
      {Array.from({ length: 38 }, (_, i) => (
        <g key={i} transform={`translate(${-160 + i * 34}, 352)`}>
          <circle cx="4" cy="5" r="2.2" fill="#a16207" />
          <circle cx="14" cy="5" r="2.2" fill="#a16207" />
          <circle cx="24" cy="5" r="2.2" fill="#a16207" />
        </g>
      ))}
      <text x="34" y="392" fill="#fde047" fontSize="14" fontWeight="900">
        点字ブロック (Yellow Tactile Blocks — Stay Behind Line!)
      </text>

      {/* 3+ Characters on Platform */}
      <g transform={`translate(${camGlideX}, 0)`}>
        <ToonCharacter2D
          x={226}
          y={292}
          facing={1}
          scale={0.94}
          seed={8}
          jacketColor="#7b5ac9"
          hairOrBandColor="#f43f5e"
          expr={cycleExpression(localSec, 8, ["happy", "focused"])}
          blink={computeBlink(frame, 8)}
        />
        <ToonCharacter2D
          x={746}
          y={292}
          facing={-1}
          scale={0.94}
          seed={9}
          jacketColor="#3f6fb5"
          hairOrBandColor="#fbbf24"
          holdPhoneHand={isMannerMode ? "right" : null}
          expr={cycleExpression(localSec, 9, ["focused", "happy"])}
          blink={computeBlink(frame, 9)}
        />

        <ToonCharacter2D
          x={isExitOrGuide ? 626 : 478}
          y={294}
          facing={1}
          scale={1.16}
          seed={1}
          jacketColor="#148c53"
          hairOrBandColor={isExitOrGuide ? "#facc15" : trainBadge.color}
          leanDeg={4}
          headTiltDeg={isExitOrGuide ? -8 : 0}
          rightUpperArmDeg={isExitOrGuide ? 116 : 90}
          rightForearmDeg={isExitOrGuide ? 126 : 104}
          hasBackpack
          holdPhoneHand={isMannerMode ? "right" : null}
          expr={heroExpr}
          blink={computeBlink(frame, 1)}
          accentColor={isExitOrGuide ? "#facc15" : trainBadge.color}
        />

        <SceneSpeechTag
          x={isExitOrGuide ? 610 : 478}
          y={188}
          jp={
            isPrioritySeat
              ? "どうぞ、優先席へ！"
              : isMannerMode
                ? "マナーモードに！"
                : isTactile
                  ? "黄色い線の内側に！"
                  : isTransfer
                    ? "乗り換えはどこ？"
                    : isLastTrain
                      ? "急いで！終電です！"
                      : isExitOrGuide
                        ? "黄色い出口へ！"
                        : `${trainBadge.jp}に乗ります！`
          }
          en={
            isPrioritySeat
              ? "Offer the Priority Seat"
              : isMannerMode
                ? "Keep phone silent"
                : isTactile
                  ? "Behind tactile blocks"
                  : isTransfer
                    ? "Find transfer line"
                    : isLastTrain
                      ? "Catch last train"
                      : isExitOrGuide
                        ? "Follow yellow EXIT"
                        : `${trainBadge.en} Train`
          }
          accent={isExitOrGuide || isTactile ? "#facc15" : trainBadge.color}
        />
      </g>
    </g>
  );
};

/**
 * Giant (~72% blackboard stage) Real-Japan 2.5D Toon-3D Animation Player
 * following `reference_kit/ricksclips-style` principles: bright >= 4 hues,
 * dark ink outlines, unlit white faces, >95% continuous camera & world motion,
 * 3+ expressive characters per shot, and zero dead holds.
 */
export const StickmanScenePlayer: React.FC<StickmanScenePlayerProps> = ({
  scene,
  sectionStartSec,
  sectionEndSec,
  activeSubTopicKey = "",
  activeSubTopicLabel,
  visualBeat,
  caption,
  width = "100%",
  height = 490,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const localSec = Math.max(0, timeSec - sectionStartSec);
  const sectionDur = Math.max(9, sectionEndSec - sectionStartSec);
  const progress = clamp01(localSec / sectionDur);

  // Continuous camera flight: push-in breath + gentle roll oscillation (never parks!)
  const breath = smootherstep(0.5 + 0.5 * Math.sin(localSec * 0.45));
  const camZoom = interpolate(breath, [0, 1], [1.0, 1.022], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const camRollDeg = Math.sin(localSec * 0.38) * 0.55;

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        borderRadius: 18,
        overflow: "hidden",
        border: "2px solid rgba(52, 211, 153, 0.38)",
        backgroundColor: "#0a1420",
        boxShadow: "0 18px 42px rgba(0, 0, 0, 0.48)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          overflow: "hidden",
          backgroundColor: "#0a1420",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="-80 -18 1120 496"
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            fontFamily:
              '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
            transform: `scale(${camZoom.toFixed(4)}) rotate(${camRollDeg.toFixed(2)}deg)`,
            transformOrigin: "center center",
          }}
        >
          {scene === "walk_to_station" ? (
            <WalkToStationRealJapan25D
              frame={frame}
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
              visualBeat={visualBeat}
            />
          ) : scene === "buy_ticket_ic" || scene === "buy_ticket_and_suica" ? (
            <BuyTicketIcRealJapan25D
              frame={frame}
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          ) : scene === "tap_ticket_gate" ||
            scene === "tap_ic_card_gate" ||
            scene === "roleplay_shinjuku" ? (
            <TapTicketGateRealJapan25D
              frame={frame}
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          ) : (
            <RideAndExitTrainRealJapan25D
              frame={frame}
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
              visualBeat={visualBeat}
            />
          )}

          {/* Bottom progress bar */}
          <rect x="28" y="446" width="904" height="5" rx="2.5" fill="rgba(17,24,39,0.55)" />
          <rect x="28" y="446" width={Math.round(904 * progress)} height="5" rx="2.5" fill="#34d399" />
        </svg>

        {activeSubTopicLabel ? (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 14,
              padding: "5px 14px",
              borderRadius: 999,
              backgroundColor: "rgba(11, 18, 26, 0.88)",
              border: "1.5px solid rgba(52, 211, 153, 0.72)",
              color: "#34d399",
              fontSize: 13.5,
              fontWeight: 800,
              letterSpacing: "0.03em",
            }}
          >
            ● LIVE: {activeSubTopicLabel}
          </div>
        ) : null}
      </div>

      {caption ? (
        <div
          style={{
            padding: "7px 14px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "#0e1720",
            fontSize: 14,
            fontWeight: 600,
            color: "#b7d9ca",
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};
