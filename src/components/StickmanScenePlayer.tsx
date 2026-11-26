import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { StickmanSceneId } from "../data/demoEpisode";

export type StickmanScenePlayerProps = {
  readonly scene: StickmanSceneId;
  readonly sectionStartSec: number;
  readonly sectionEndSec: number;
  readonly activeSubTopicKey?: string;
  readonly activeSubTopicLabel?: string;
  readonly caption?: string;
  readonly width?: number | string;
  readonly height?: number;
};

type StickmanPoseProps = {
  readonly x: number;
  readonly y: number;
  readonly facing?: 1 | -1;
  readonly scale?: number;
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
  readonly expression?: "neutral" | "happy" | "surprised" | "focused";
  readonly sweatDrop?: boolean;
  readonly accentColor?: string;
};

const INK = "#111827";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

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

/**
 * Dual-pass 2.5D stylized Stickman rig with bold `#111827` cartoon ink outlines,
 * bright highlights, JungGo ninja headband, colorful backpack, and hand props.
 */
const StickmanFigure: React.FC<StickmanPoseProps> = ({
  x,
  y,
  facing = 1,
  scale = 1,
  leanDeg = 0,
  headTiltDeg = 0,
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
  expression = "neutral",
  sweatDrop = false,
  accentColor = "#34d399",
}) => {
  const torsoLen = 46;
  const upperArmLen = 25;
  const forearmLen = 23;
  const thighLen = 29;
  const calfLen = 28;
  const headRadius = 17.5;

  const hip = { x: 0, y: 0 };
  const leanRad = degToRad(leanDeg);
  const shoulder = {
    x: Math.sin(leanRad) * torsoLen,
    y: -Math.cos(leanRad) * torsoLen,
  };
  const neck = {
    x: shoulder.x + Math.sin(leanRad) * 6,
    y: shoulder.y - Math.cos(leanRad) * 6,
  };
  const headTotalRad = degToRad(leanDeg + headTiltDeg);
  const headCenter = {
    x: neck.x + Math.sin(headTotalRad) * headRadius,
    y: neck.y - Math.cos(headTotalRad) * headRadius,
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
          <rect
            x="0"
            y="0"
            width="24"
            height="15"
            rx="3.5"
            fill="#10b981"
            stroke={INK}
            strokeWidth="2.4"
          />
          <rect x="3.5" y="4" width="7.5" height="4" rx="1" fill="#fde047" />
          <line x1="13" y1="10.5" x2="20" y2="10.5" stroke="#ecfdf5" strokeWidth="1.8" />
        </g>
      ) : null}
      {holdTicketHand === side ? (
        <g transform={`translate(${hand.x + 1}, ${hand.y - 10}) rotate(-16)`}>
          <rect
            x="0"
            y="0"
            width="22"
            height="13"
            rx="2.5"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="2.2"
          />
          <circle cx="6.5" cy="6.5" r="2" fill="#d97706" />
          <line x1="11" y1="6.5" x2="18" y2="6.5" stroke="#92400e" strokeWidth="2" />
        </g>
      ) : null}
      {holdCoinHand === side ? (
        <g transform={`translate(${hand.x + 6}, ${hand.y - 4})`}>
          <circle cx="0" cy="0" r="7.5" fill="#fbbf24" stroke={INK} strokeWidth="2.2" />
          <circle cx="0" cy="0" r="2.2" fill="#fef3c7" stroke={INK} strokeWidth="1.2" />
        </g>
      ) : null}
    </g>
  );

  return (
    <g transform={`translate(${x}, ${y}) scale(${facing * scale}, ${scale})`}>
      {/* Soft grounded 2.5D contact shadow */}
      <ellipse cx="2" cy={57} rx="24" ry="6" fill="rgba(17, 24, 39, 0.45)" />

      {/* Back arm (left): ink outline + cool slate fill */}
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${lElbow.x} ${lElbow.y} L ${lHand.x} ${lHand.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="9.2"
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
      <circle cx={lHand.x} cy={lHand.y} r="4.4" fill="#cbd5e1" stroke={INK} strokeWidth="2" />
      {renderHandProp(lHand, "left")}

      {/* Traveler backpack with dark cartoon outline */}
      {hasBackpack ? (
        <g
          transform={`translate(${shoulder.x - 19}, ${shoulder.y + 3}) rotate(${leanDeg})`}
        >
          <rect
            x="0"
            y="0"
            width="17"
            height="31"
            rx="6.5"
            fill="#0f766e"
            stroke={INK}
            strokeWidth="2.8"
          />
          <rect x="2.5" y="4" width="12" height="9" rx="3" fill="#14b8a6" />
          <line x1="3" y1="18" x2="14" y2="18" stroke="#fde047" strokeWidth="2.2" />
        </g>
      ) : null}

      {/* Back leg (left) */}
      <path
        d={`M ${hip.x} ${hip.y} L ${lKnee.x} ${lKnee.y} L ${lFoot.x} ${lFoot.y} L ${lFoot.x + 10} ${lFoot.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="9.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${hip.x} ${hip.y} L ${lKnee.x} ${lKnee.y} L ${lFoot.x} ${lFoot.y} L ${lFoot.x + 10} ${lFoot.y}`}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Torso (bright white core inside dark ink outline) */}
      <line
        x1={hip.x}
        y1={hip.y}
        x2={neck.x}
        y2={neck.y}
        stroke={INK}
        strokeWidth="11.2"
        strokeLinecap="round"
      />
      <line
        x1={hip.x}
        y1={hip.y}
        x2={neck.x}
        y2={neck.y}
        stroke="#ffffff"
        strokeWidth="6.2"
        strokeLinecap="round"
      />
      {/* Colorful JungGo Hoodie Scarf Accent */}
      <circle cx={neck.x} cy={neck.y + 4} r="6.2" fill={accentColor} stroke={INK} strokeWidth="2.2" />

      {/* Front leg (right) */}
      <path
        d={`M ${hip.x} ${hip.y} L ${rKnee.x} ${rKnee.y} L ${rFoot.x} ${rFoot.y} L ${rFoot.x + 11} ${rFoot.y}`}
        fill="none"
        stroke={INK}
        strokeWidth="10.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${hip.x} ${hip.y} L ${rKnee.x} ${rKnee.y} L ${rFoot.x} ${rFoot.y} L ${rFoot.x + 11} ${rFoot.y}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Head with crisp warm light reflection + dark outline */}
      <circle
        cx={headCenter.x}
        cy={headCenter.y}
        r={headRadius}
        fill="#fff8f0"
        stroke={INK}
        strokeWidth="3.2"
      />
      {/* Emerald Ninja Headband + Ribbon Tail */}
      <path
        d={`M ${headCenter.x - 16} ${headCenter.y - 6} Q ${headCenter.x} ${headCenter.y - 10} ${headCenter.x + 16} ${headCenter.y - 6}`}
        fill="none"
        stroke={INK}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d={`M ${headCenter.x - 16} ${headCenter.y - 6} Q ${headCenter.x} ${headCenter.y - 10} ${headCenter.x + 16} ${headCenter.y - 6}`}
        fill="none"
        stroke={accentColor}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${headCenter.x - 15} ${headCenter.y - 6} L ${headCenter.x - 25} ${headCenter.y - 11} L ${headCenter.x - 23} ${headCenter.y - 2} Z`}
        fill={accentColor}
        stroke={INK}
        strokeWidth="1.8"
      />

      {/* Rosy cheek + Expressive eyes & mouth */}
      <ellipse
        cx={headCenter.x + 6}
        cy={headCenter.y + 4.5}
        rx="4"
        ry="2.4"
        fill="rgba(251, 113, 133, 0.45)"
      />
      <circle cx={headCenter.x + 5.5} cy={headCenter.y - 0.5} r="2.3" fill={INK} />
      <circle cx={headCenter.x + 11.5} cy={headCenter.y - 0.5} r="2" fill={INK} />
      <circle cx={headCenter.x + 6.2} cy={headCenter.y - 1.3} r="0.8" fill="#ffffff" />
      <circle cx={headCenter.x + 12} cy={headCenter.y - 1.3} r="0.7" fill="#ffffff" />

      {expression === "happy" ? (
        <path
          d={`M ${headCenter.x + 4.5} ${headCenter.y + 6} Q ${headCenter.x + 8.5} ${headCenter.y + 10.5} ${headCenter.x + 12.5} ${headCenter.y + 5.5}`}
          fill="none"
          stroke={INK}
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      ) : expression === "surprised" ? (
        <circle
          cx={headCenter.x + 8.5}
          cy={headCenter.y + 7.5}
          r="3.2"
          fill="#fb7185"
          stroke={INK}
          strokeWidth="1.8"
        />
      ) : (
        <path
          d={`M ${headCenter.x + 5.5} ${headCenter.y + 7} Q ${headCenter.x + 8.5} ${headCenter.y + 8.5} ${headCenter.x + 11.5} ${headCenter.y + 6.8}`}
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {sweatDrop ? (
        <path
          d={`M ${headCenter.x - 20} ${headCenter.y - 14} C ${headCenter.x - 24} ${headCenter.y - 5}, ${headCenter.x - 16} ${headCenter.y - 5}, ${headCenter.x - 20} ${headCenter.y - 14} Z`}
          fill="#38bdf8"
          stroke={INK}
          strokeWidth="1.8"
        />
      ) : null}

      {/* Front arm (right) */}
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
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={rHand.x} cy={rHand.y} r="4.6" fill={accentColor} stroke={INK} strokeWidth="2.1" />
      {renderHandProp(rHand, "right")}
    </g>
  );
};

/** Soft drifting cartoon smoke/steam puff cluster for chimneys & train air-brakes */
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
      const phase = ((localSec * 0.6 + i * 0.33) % 1);
      const px = originX + phase * driftX;
      const py = originY - phase * riseY;
      const r = (7 + phase * 11) * scale;
      const alpha = Math.sin(phase * Math.PI) * 0.72;
      return (
        <circle
          key={i}
          cx={px}
          cy={py}
          r={r}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.5"
          opacity={alpha}
        />
      );
    })}
  </g>
);

/** Crisp sparkling yen coin icon with shine star */
const YenCoin: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  readonly gold?: boolean;
  readonly sparklePhase: number;
}> = ({ x, y, label = "¥100", gold = false, sparklePhase }) => (
  <g transform={`translate(${x}, ${y})`}>
    <circle
      cx="0"
      cy="0"
      r="16"
      fill={gold ? "#fbbf24" : "#e2e8f0"}
      stroke={INK}
      strokeWidth="2.8"
    />
    <circle
      cx="0"
      cy="0"
      r="11.5"
      fill="none"
      stroke={gold ? "#f59e0b" : "#94a3b8"}
      strokeWidth="1.5"
    />
    <text
      x="0"
      y="4"
      textAnchor="middle"
      fill={INK}
      fontSize="9.5"
      fontWeight="900"
    >
      {label}
    </text>
    {/* Twinkling sparkle */}
    <path
      d={`M 13 -13 L 15 -19 L 17 -13 L 23 -11 L 17 -9 L 15 -3 L 13 -9 L 7 -11 Z`}
      fill="#fef08a"
      stroke={INK}
      strokeWidth="1"
      opacity={0.45 + 0.55 * Math.abs(Math.sin(sparklePhase))}
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
  const w = Math.max(138, jp.length * 16 + 34);
  const h = en ? 50 : 34;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-w / 2}
        y={-h}
        width={w}
        height={h}
        rx="13"
        fill="#ffffff"
        stroke={INK}
        strokeWidth="3"
      />
      <polygon points="-7,-1 7,-1 0,10" fill="#ffffff" stroke={INK} strokeWidth="2.6" />
      <rect x={-w / 2 + 4} y={-6} width={w - 8} height="6" fill="#ffffff" />
      <text
        x="0"
        y={en ? -27 : -12}
        textAnchor="middle"
        fill={INK}
        fontSize="16.5"
        fontWeight="900"
      >
        {jp}
      </text>
      {en ? (
        <text
          x="0"
          y="-10"
          textAnchor="middle"
          fill={accent === "#facc15" ? "#b45309" : "#047857"}
          fontSize="12"
          fontWeight="800"
        >
          {en}
        </text>
      ) : null}
    </g>
  );
};

/**
 * Scene 1 (Layered 2.5D): Sunset Tokyo neighborhood -> glowing cozy houses & shops ->
 * colorful Station building -> live highlighted 北口 / 南口 / 東口 / 西口 exit sign!
 */
const WalkToStation25D: React.FC<{
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ localSec, progress, activeKey }) => {
  const effectiveKey =
    activeKey ||
    (progress < 0.25
      ? "north"
      : progress < 0.5
        ? "south"
        : progress < 0.75
          ? "east"
          : "west");

  const camPan = Math.sin(localSec * 0.45) * 14;
  const stride = Math.sin(localSec * 6.5) * 23;
  const bob = Math.abs(Math.cos(localSec * 6.5)) * 3.5;

  const stickX = lerpRange(progress, 0.0, 0.4, 92, 232);
  const isNorth = effectiveKey === "north";
  const isSouth = effectiveKey === "south";
  const isEast = effectiveKey === "east";
  const isWest = effectiveKey === "west";

  const exits: {
    readonly key: string;
    readonly jp: string;
    readonly en: string;
    readonly x: number;
    readonly y: number;
    readonly color: string;
  }[] = [
    { key: "north", jp: "北口", en: "North", x: 14, y: 12, color: "#34d399" },
    { key: "south", jp: "南口", en: "South", x: 122, y: 12, color: "#38bdf8" },
    { key: "east", jp: "東口", en: "East", x: 14, y: 54, color: "#fbbf24" },
    { key: "west", jp: "西口", en: "West", x: 122, y: 54, color: "#fb7185" },
  ];

  const activeExit = exits.find((e) => e.key === effectiveKey) ?? exits[0];

  return (
    <g>
      {/* Layer 0: Warm Japanese twilight sky + Distant Mt. Fuji + City Skyline (0.25x parallax) */}
      <g transform={`translate(${camPan * 0.25}, 0)`}>
        <defs>
          <linearGradient id="sky-walk-25d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="55%" stopColor="#3b2f6e" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <rect x="-40" y="-20" width="720" height="360" fill="url(#sky-walk-25d)" />
        {/* Warm setting sun */}
        <circle cx="515" cy="148" r="46" fill="#fde047" opacity="0.28" />
        <circle cx="515" cy="148" r="30" fill="#fbbf24" opacity="0.55" />
        {/* Distant Mt. Fuji silhouette */}
        <path d="M 380 280 L 490 176 L 540 176 L 650 280 Z" fill="#312e81" stroke={INK} strokeWidth="2.5" />
        <path d="M 468 197 L 490 176 L 540 176 L 562 197 L 540 205 L 515 196 L 490 205 Z" fill="#f8fafc" />
        {/* Distant apartment silhouettes with tiny glowing windows */}
        {[35, 110, 185, 250].map((bx, i) => (
          <g key={bx} transform={`translate(${bx}, ${160 + (i % 2) * 24})`}>
            <rect width="58" height="120" rx="4" fill="#1e293b" stroke={INK} strokeWidth="2.2" />
            {[14, 34, 54].map((wy) => (
              <g key={wy}>
                <rect x="10" y={wy} width="12" height="10" rx="2" fill={i % 2 === 0 ? "#fde047" : "#7dd3fc"} opacity="0.7" />
                <rect x="34" y={wy} width="12" height="10" rx="2" fill="#fde047" opacity="0.5" />
              </g>
            ))}
          </g>
        ))}
      </g>

      {/* Layer 1: Midground Cozy Houses, Glowing Café Window, Drink Vending Machine & JR Station (0.6x parallax) */}
      <g transform={`translate(${camPan * 0.6}, 0)`}>
        {/* Cozy Neighborhood House on Left */}
        <g transform="translate(22, 198)">
          <SteamPuffs originX={28} originY={-10} localSec={localSec} driftX={22} riseY={36} scale={0.95} />
          <rect x="20" y="-8" width="14" height="24" fill="#94a3b8" stroke={INK} strokeWidth="2.5" />
          <polygon points="-8,30 62,-6 132,30" fill="#dc2626" stroke={INK} strokeWidth="3" />
          <rect x="6" y="30" width="112" height="114" rx="4" fill="#fef3c7" stroke={INK} strokeWidth="3" />
          {/* Warm glowing windows */}
          <rect x="18" y="48" width="36" height="30" rx="4" fill="#fbbf24" stroke={INK} strokeWidth="2.5" />
          <line x1="36" y1="48" x2="36" y2="78" stroke={INK} strokeWidth="2" />
          <line x1="18" y1="63" x2="54" y2="63" stroke={INK} strokeWidth="2" />
          {/* Striped awning & door */}
          <rect x="68" y="58" width="40" height="86" rx="3" fill="#0f766e" stroke={INK} strokeWidth="2.6" />
          <path d="M 64 56 L 112 56 L 116 68 L 60 68 Z" fill="#10b981" stroke={INK} strokeWidth="2.4" />
        </g>

        {/* Classic Japanese Red Street Vending Machine */}
        <g transform="translate(160, 250)">
          <rect x="0" y="0" width="46" height="92" rx="5" fill="#ef4444" stroke={INK} strokeWidth="2.8" />
          <rect x="6" y="10" width="34" height="36" rx="3" fill="#e0f2fe" stroke={INK} strokeWidth="2" />
          <rect x="10" y="15" width="8" height="10" rx="1.5" fill="#38bdf8" />
          <rect x="21" y="15" width="8" height="10" rx="1.5" fill="#34d399" />
          <rect x="10" y="30" width="18" height="8" rx="1.5" fill="#facc15" />
          <rect x="10" y="64" width="26" height="14" rx="2" fill="#1e293b" stroke={INK} strokeWidth="1.6" />
        </g>

        {/* Colorful Japanese Train Station Building on Right */}
        <g transform="translate(348, 126)">
          <rect x="0" y="42" width="266" height="176" rx="10" fill="#e2e8f0" stroke={INK} strokeWidth="3.4" />
          {/* Emerald JR-inspired canopy */}
          <path d="M -12 48 L 278 48 L 266 20 L 0 20 Z" fill="#10b981" stroke={INK} strokeWidth="3.2" />
          {/* Illuminated 駅 STATION Header Sign */}
          <rect x="42" y="-12" width="182" height="44" rx="8" fill="#064e3b" stroke={INK} strokeWidth="3.2" />
          <text x="133" y="18" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="900">
            駅 STATION
          </text>
          {/* Large Glass Sliding Entrance + Glowing Interior */}
          <rect x="74" y="94" width="118" height="124" rx="6" fill="#fef08a" stroke={INK} strokeWidth="3" opacity="0.88" />
          <line x1="133" y1="94" x2="133" y2="218" stroke={INK} strokeWidth="2.8" />
          <rect x="92" y="62" width="82" height="24" rx="5" fill="#148c53" stroke={INK} strokeWidth="2.2" />
          <text x="133" y="79" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="900">
            入口 ENTRANCE
          </text>
        </g>
      </g>

      {/* Layer 2: Foreground Pavement & Dynamic 4-Exit Directional Gantry + Stickman (1.0x) */}
      <g transform={`translate(${camPan}, 0)`}>
        {/* Sidewalk & Road */}
        <rect x="-40" y="340" width="720" height="128" fill="#334155" stroke={INK} strokeWidth="3" />
        <rect x="-40" y="340" width="720" height="18" fill="#64748b" stroke={INK} strokeWidth="2.5" />
        {/* Tactile yellow curb dots */}
        {Array.from({ length: 18 }, (_, i) => (
          <rect
            key={i}
            x={-20 + i * 40}
            y="344"
            width="24"
            height="6"
            rx="2"
            fill="#facc15"
            stroke={INK}
            strokeWidth="1.2"
          />
        ))}

        {/* Overhead 4-Exit Gantry Board (Lights up active 北口 / 南口 / 東口 / 西口 dynamically!) */}
        <g transform="translate(362, 18)">
          <rect
            x="0"
            y="0"
            width="234"
            height="100"
            rx="12"
            fill="#1e293b"
            stroke={INK}
            strokeWidth="3.4"
          />
          {exits.map((ex) => {
            const isLit = ex.key === effectiveKey;
            return (
              <g key={ex.key} transform={`translate(${ex.x}, ${ex.y})`}>
                <rect
                  x="0"
                  y="0"
                  width="98"
                  height="34"
                  rx="8"
                  fill={isLit ? ex.color : "#0f172a"}
                  stroke={isLit ? "#ffffff" : "#475569"}
                  strokeWidth={isLit ? "3" : "1.8"}
                  opacity={isLit ? 1 : 0.6}
                />
                <text
                  x="49"
                  y="16"
                  textAnchor="middle"
                  fill={isLit ? INK : "#cbd5e1"}
                  fontSize="14.5"
                  fontWeight="900"
                >
                  {ex.jp}
                </text>
                <text
                  x="49"
                  y="29"
                  textAnchor="middle"
                  fill={isLit ? INK : "#94a3b8"}
                  fontSize="10"
                  fontWeight="800"
                >
                  {ex.en} Exit
                </text>
              </g>
            );
          })}
          {/* Post */}
          <line x1="117" y1="100" x2="117" y2="124" stroke="#64748b" strokeWidth="6" />
        </g>

        {/* Expressive 2.5D Stickman pointing to active Exit Sign */}
        <StickmanFigure
          x={stickX}
          y={292 - bob}
          facing={1}
          scale={1.16}
          leanDeg={6}
          headTiltDeg={-12}
          leftUpperArmDeg={stride * 0.6 - 14}
          leftForearmDeg={stride * 0.4 + 14}
          rightUpperArmDeg={isNorth || isWest ? 122 : isSouth || isEast ? 104 : 115}
          rightForearmDeg={132}
          leftThighDeg={-stride * 0.75}
          leftCalfDeg={-stride * 0.45 - 5}
          rightThighDeg={stride * 0.75}
          rightCalfDeg={stride * 0.45}
          hasBackpack
          expression="happy"
          accentColor={activeExit.color}
        />

        {/* Crisp Comic Speech Tag echoing active Exit */}
        <SceneSpeechTag
          x={stickX - 18}
          y={192 - bob}
          jp={`${activeExit.jp}はどこ？`}
          en={`Where is ${activeExit.en} Exit?`}
          accent={activeExit.color}
        />
      </g>
    </g>
  );
};

/**
 * Scene 2 (Layered 2.5D): Bright Concourse + Colorful 券売機 Ticket Machine +
 * Sparkling Yen Coins + Glowing Green Suica IC Top-Up + Printed Ticket!
 */
const BuyTicketIc25D: React.FC<{
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ localSec, progress, activeKey }) => {
  const effectiveKey =
    activeKey ||
    (progress < 0.28
      ? "machine"
      : progress < 0.54
        ? "ticket"
        : progress < 0.78
          ? "fare"
          : "charge");

  const camPan = Math.sin(localSec * 0.4) * 10;
  const isMachine = effectiveKey === "machine";
  const isTicket = effectiveKey === "ticket";
  const isFare = effectiveKey === "fare";
  const isCharge = effectiveKey === "charge";

  const coinDropY = ((localSec * 38) % 52);
  const chargeFill = isCharge ? 0.45 + 0.5 * clamp01((localSec % 2.4) / 2.0) : 0.75;
  const rippleR = ((localSec * 36) % 28) + 6;
  const rippleA = 1 - (rippleR - 6) / 28;
  const stickX = 210 + Math.sin(localSec * 1.1) * 8;

  return (
    <g>
      {/* Layer 0: Bright Station Concourse Back Wall & Warm Ceiling Lamps */}
      <g transform={`translate(${camPan * 0.35}, 0)`}>
        <defs>
          <linearGradient id="wall-ticket-25d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f293a" />
            <stop offset="100%" stopColor="#1e3a4c" />
          </linearGradient>
        </defs>
        <rect x="-30" y="-20" width="700" height="390" fill="url(#wall-ticket-25d)" />
        {/* Warm recessed ceiling light fixtures */}
        {[95, 320, 545].map((lx) => (
          <g key={lx}>
            <ellipse cx={lx} cy="72" rx="75" ry="52" fill="#fde68a" opacity="0.14" />
            <rect x={lx - 44} y="14" width="88" height="12" rx="6" fill="#fef3c7" stroke={INK} strokeWidth="2.4" />
          </g>
        ))}

        {/* Overhead Fare Map Poster on Left Wall (Lights up when 運賃 Fare is active!) */}
        <g transform="translate(36, 74)">
          <rect
            x="0"
            y="0"
            width="184"
            height="136"
            rx="10"
            fill="#f8fafc"
            stroke={isFare ? "#fbbf24" : INK}
            strokeWidth={isFare ? "4.5" : "3"}
          />
          <rect x="0" y="0" width="184" height="28" rx="8" fill={isFare ? "#f59e0b" : "#0f766e"} stroke={INK} strokeWidth="2.4" />
          <text x="92" y="19" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="900">
            運賃表 FARE MAP
          </text>
          {/* Mini colorful route line with prices */}
          <line x1="22" y1="74" x2="162" y2="74" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
          {[
            { cx: 36, price: "¥180", name: "渋谷" },
            { cx: 92, price: "¥200", name: "新宿" },
            { cx: 148, price: "¥320", name: "東京" },
          ].map((st) => (
            <g key={st.name}>
              <circle cx={st.cx} cy="74" r="8" fill="#ffffff" stroke={INK} strokeWidth="2.5" />
              <text x={st.cx} y="56" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="900">
                {st.name}
              </text>
              <rect x={st.cx - 20} y="88" width="40" height="20" rx="5" fill={isFare ? "#fde047" : "#e2e8f0"} stroke={INK} strokeWidth="1.8" />
              <text x={st.cx} y="102" textAnchor="middle" fill={INK} fontSize="11" fontWeight="900">
                {st.price}
              </text>
            </g>
          ))}
        </g>
      </g>

      {/* Floor */}
      <rect x="-30" y="362" width="700" height="110" fill="#334155" stroke={INK} strokeWidth="3" />
      <rect x="-30" y="362" width="700" height="14" fill="#475569" />

      {/* Layer 1: Detailed Colorful 2.5D Japanese Ticket Vending Machine (券売機) */}
      <g transform={`translate(${328 + camPan * 0.85}, 66)`}>
        {/* Drop shadow */}
        <rect x="10" y="10" width="234" height="296" rx="14" fill="rgba(17,24,39,0.45)" />
        {/* Machine Cabinet */}
        <rect
          x="0"
          y="0"
          width="234"
          height="296"
          rx="14"
          fill="#0284c7"
          stroke={INK}
          strokeWidth="3.6"
        />
        <rect x="12" y="12" width="210" height="36" rx="7" fill="#064e3b" stroke={INK} strokeWidth="2.6" />
        <text x="117" y="36" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
          きっぷ 券売機・チャージ
        </text>

        {/* Touchscreen Display */}
        <rect
          x="18"
          y="60"
          width="136"
          height="112"
          rx="8"
          fill="#0f172a"
          stroke={isMachine || isFare ? "#fde047" : INK}
          strokeWidth="3"
        />
        <rect x="26" y="68" width="120" height="22" rx="4" fill="#148c53" />
        <text x="86" y="83" textAnchor="middle" fill="#ffffff" fontSize="11.5" fontWeight="900">
          {isCharge ? "Suica チャージ" : isTicket ? "片道 / 往復 切符" : "English Guide [EN]"}
        </text>

        {isCharge ? (
          <g>
            <rect x="30" y="104" width="112" height="18" rx="9" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
            <rect x="32" y="106" width={Math.round(108 * chargeFill)} height="14" rx="7" fill="#34d399" />
            <text x="86" y="146" textAnchor="middle" fill="#fde047" fontSize="16" fontWeight="900">
              +¥1,000 OK!
            </text>
          </g>
        ) : (
          <g>
            <rect x="28" y="100" width="54" height="28" rx="5" fill="#10b981" stroke="#a7f3d0" strokeWidth="1.6" />
            <text x="55" y="118" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900">
              片道 ¥200
            </text>
            <rect x="88" y="100" width="54" height="28" rx="5" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.6" />
            <text x="115" y="118" textAnchor="middle" fill={INK} fontSize="12" fontWeight="900">
              往復 ¥400
            </text>
            <rect x="28" y="136" width="114" height="24" rx="5" fill="#f59e0b" />
            <text x="85" y="152" textAnchor="middle" fill={INK} fontSize="11.5" fontWeight="900">
              IC チャージ Top-Up
            </text>
          </g>
        )}

        {/* Coin Slot & Blue IC Card Reader Tray */}
        <rect
          x="166"
          y="64"
          width="52"
          height="42"
          rx="6"
          fill="#fbbf24"
          stroke={INK}
          strokeWidth="2.4"
        />
        <text x="192" y="83" textAnchor="middle" fill={INK} fontSize="11" fontWeight="900">
          硬貨
        </text>
        <rect x="176" y="89" width="32" height="7" rx="3" fill={INK} />

        {/* Blue IC Pad */}
        <rect
          x="164"
          y="118"
          width="56"
          height="54"
          rx="8"
          fill={isCharge ? "#0284c7" : "#0c4a6e"}
          stroke={isCharge ? "#34d399" : INK}
          strokeWidth="2.8"
        />
        <text x="192" y="151" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
          IC
        </text>
        {isCharge ? (
          <circle
            cx="192"
            cy="145"
            r={rippleR}
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            opacity={rippleA}
          />
        ) : null}

        {/* Ticket & Change Dispenser Tray */}
        <rect x="30" y="200" width="174" height="44" rx="8" fill="#0f172a" stroke={INK} strokeWidth="2.8" />
        {/* Emerging Printed Ticket */}
        <g transform={`translate(56, ${isTicket ? 202 : 212})`}>
          <rect
            x="0"
            y="0"
            width="52"
            height="28"
            rx="4"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="2.4"
          />
          <text x="26" y="18" textAnchor="middle" fill={INK} fontSize="12" fontWeight="900">
            切符 ¥200
          </text>
        </g>

        {/* Floating Sparkling Yen Coins near Coin Tray (when Fare/Charge active) */}
        <YenCoin
          x={-30}
          y={182 + (coinDropY % 28)}
          label="¥500"
          gold
          sparklePhase={localSec * 4}
        />
        <YenCoin
          x={-64}
          y={202 + ((coinDropY + 14) % 24)}
          label="¥100"
          gold={false}
          sparklePhase={localSec * 4 + 1.5}
        />
      </g>

      {/* Layer 2: Stickman interacting with Ticket Machine */}
      <g transform={`translate(${camPan}, 0)`}>
        <StickmanFigure
          x={stickX}
          y={305}
          facing={1}
          scale={1.2}
          leanDeg={4}
          headTiltDeg={-4}
          leftUpperArmDeg={-18}
          leftForearmDeg={-6}
          rightUpperArmDeg={isCharge ? 78 : isTicket ? 114 : 96}
          rightForearmDeg={isCharge ? 96 : isTicket ? 124 : 112}
          leftThighDeg={-10}
          leftCalfDeg={-4}
          rightThighDeg={10}
          rightCalfDeg={4}
          hasBackpack
          holdCardHand={isCharge ? "right" : null}
          holdTicketHand={isTicket ? "right" : null}
          holdCoinHand={isFare || isMachine ? "right" : null}
          expression="happy"
        />

        <SceneSpeechTag
          x={stickX - 4}
          y={205}
          jp={isCharge ? "チャージします！" : isFare ? "東京駅までいくら？" : isTicket ? "切符を買いました！" : "券売機でピッ！"}
          en={isCharge ? "Top up Suica!" : isFare ? "Check train fare" : isTicket ? "Got my ticket!" : "Tap English button"}
          accent={isCharge ? "#34d399" : "#facc15"}
        />
      </g>
    </g>
  );
};

/**
 * Scene 3 (Layered 2.5D): Automatic Ticket Gate (改札口) + Bright Yellow Fare Adjustment (精算機)
 * + Station Staff Booth (駅員), reacting cleanly to `gate | adjust | low_balance | staff`!
 */
const TapTicketGate25D: React.FC<{
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ localSec, progress, activeKey }) => {
  const effectiveKey =
    activeKey ||
    (progress < 0.34
      ? "gate"
      : progress < 0.62
        ? "low_balance"
        : progress < 0.85
          ? "adjust"
          : "staff");

  const camPan = Math.sin(localSec * 0.4) * 10;
  const isGate = effectiveKey === "gate";
  const isLowBalance = effectiveKey === "low_balance";
  const isAdjust = effectiveKey === "adjust";
  const isStaff = effectiveKey === "staff";

  const stride = Math.sin(localSec * 6.8) * 20;
  const stickX = isStaff ? 148 : isAdjust ? 416 : 210 + (isGate ? Math.sin(localSec * 1.4) * 18 : 0);
  const pulseR = ((localSec * 38) % 32) + 6;
  const pulseA = 1 - (pulseR - 6) / 32;

  return (
    <g>
      {/* Concourse wall & floor */}
      <rect x="-30" y="-20" width="700" height="390" fill="#132433" />
      <rect x="-30" y="356" width="700" height="114" fill="#334155" stroke={INK} strokeWidth="3" />
      <rect x="-30" y="356" width="700" height="14" fill="#475569" />

      {/* Background Overhead Station Sign */}
      <g transform={`translate(${188 + camPan * 0.4}, 22)`}>
        <rect x="0" y="0" width="264" height="40" rx="8" fill="#064e3b" stroke={INK} strokeWidth="3" />
        <text x="132" y="26" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
          改札口 TICKET GATES
        </text>
      </g>

      {/* Layer 1: Station Staff Window Booth (駅員) on Left */}
      <g
        transform={`translate(${24 + camPan * 0.7}, 126)`}
        opacity={isStaff ? 1 : 0.7}
      >
        <rect
          x="0"
          y="0"
          width="116"
          height="230"
          rx="10"
          fill="#1e3a5f"
          stroke={isStaff ? "#34d399" : INK}
          strokeWidth={isStaff ? "4" : "3"}
        />
        <rect x="12" y="14" width="92" height="24" rx="5" fill="#148c53" stroke={INK} strokeWidth="2" />
        <text x="58" y="30" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900">
          駅員 Staff
        </text>
        {/* Glowing Staff Window */}
        <rect x="14" y="48" width="88" height="84" rx="6" fill="#fef3c7" stroke={INK} strokeWidth="2.6" />
        {/* Friendly Station Attendant inside window */}
        <circle cx="58" cy="84" r="16" fill="#fde68a" stroke={INK} strokeWidth="2.4" />
        <rect x="42" y="64" width="32" height="11" rx="3" fill="#1d4ed8" stroke={INK} strokeWidth="2" />
        <circle cx="53" cy="84" r="2" fill={INK} />
        <circle cx="63" cy="84" r="2" fill={INK} />
        <path d="M 52 91 Q 58 96 64 91" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <rect x="38" y="102" width="40" height="30" rx="6" fill="#1e40af" stroke={INK} strokeWidth="2.2" />
      </g>

      {/* Layer 1.5: Silver & Cobalt Automatic Ticket Gate (改札口) Center */}
      <g
        transform={`translate(${254 + camPan * 0.85}, 200)`}
        opacity={isAdjust || isStaff ? 0.82 : 1}
      >
        <rect
          x="0"
          y="0"
          width="110"
          height="156"
          rx="10"
          fill="#cbd5e1"
          stroke={isLowBalance ? "#f43f5e" : INK}
          strokeWidth="3.6"
        />
        <rect x="0" y="0" width="110" height="28" rx="8" fill={isLowBalance ? "#be123c" : "#0284c7"} stroke={INK} strokeWidth="3" />
        <text x="55" y="19" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="900">
          改札口
        </text>
        {/* Glowing Blue IC Pad */}
        <rect
          x="16"
          y="42"
          width="46"
          height="36"
          rx="7"
          fill={isLowBalance ? "#4c0519" : "#0c4a6e"}
          stroke={isLowBalance ? "#fb7185" : "#38bdf8"}
          strokeWidth="2.8"
        />
        <text x="39" y="66" textAnchor="middle" fill="#e0f2fe" fontSize="14.5" fontWeight="900">
          IC
        </text>
        {/* Animated Gate Flaps */}
        <rect
          x="84"
          y="46"
          width={isLowBalance ? 46 : 16}
          height="58"
          rx="5"
          fill={isLowBalance ? "#e11d48" : "#10b981"}
          stroke={INK}
          strokeWidth="2.6"
        />
        {(isGate || isLowBalance) ? (
          <circle
            cx="39"
            cy="60"
            r={pulseR}
            fill="none"
            stroke={isLowBalance ? "#f43f5e" : "#34d399"}
            strokeWidth="3.2"
            opacity={pulseA}
          />
        ) : null}
      </g>

      {/* Bright Yellow Fare Adjustment Machine (精算機) on Right */}
      <g
        transform={`translate(${476 + camPan * 0.9}, 110)`}
        opacity={isAdjust ? 1 : 0.72}
      >
        <rect
          x="0"
          y="0"
          width="126"
          height="246"
          rx="12"
          fill="#facc15"
          stroke={isAdjust ? "#ffffff" : INK}
          strokeWidth={isAdjust ? "4" : "3.4"}
        />
        <rect x="12" y="12" width="102" height="30" rx="6" fill="#1e293b" stroke={INK} strokeWidth="2.2" />
        <text x="63" y="32" textAnchor="middle" fill="#facc15" fontSize="15" fontWeight="900">
          精算機
        </text>
        <rect x="14" y="52" width="98" height="62" rx="7" fill="#0f172a" stroke={INK} strokeWidth="2.4" />
        <text x="63" y="77" textAnchor="middle" fill={isAdjust ? "#34d399" : "#fde047"} fontSize="13.5" fontWeight="900">
          {isAdjust ? "精算完了 ✓" : "不足 +¥180"}
        </text>
        <text x="63" y="98" textAnchor="middle" fill="#e2e8f0" fontSize="11.5" fontWeight="800">
          Fare Adjust
        </text>
        <rect x="28" y="130" width="70" height="18" rx="4" fill="#1e293b" />
        <rect x="28" y="168" width="70" height="36" rx="5" fill="#1e293b" stroke={INK} strokeWidth="2" />

        {isAdjust ? (
          <YenCoin
            x={16}
            y={46 + ((localSec * 22) % 24)}
            label="¥100"
            gold
            sparklePhase={localSec * 4.2}
          />
        ) : null}
      </g>

      {/* Foreground Stickman */}
      <g transform={`translate(${camPan}, 0)`}>
        <StickmanFigure
          x={stickX}
          y={299}
          facing={isStaff ? -1 : 1}
          scale={1.18}
          leanDeg={isLowBalance ? -10 : 5}
          headTiltDeg={isLowBalance ? -12 : 2}
          leftUpperArmDeg={stride * 0.35 - 12}
          leftForearmDeg={16}
          rightUpperArmDeg={isAdjust || isGate || isLowBalance ? 82 : 112}
          rightForearmDeg={isAdjust || isGate || isLowBalance ? 98 : 122}
          leftThighDeg={-8}
          leftCalfDeg={-4}
          rightThighDeg={8}
          rightCalfDeg={4}
          hasBackpack
          holdCardHand={isGate || isLowBalance ? "right" : null}
          holdCoinHand={isAdjust ? "right" : null}
          expression={isLowBalance ? "surprised" : "happy"}
          sweatDrop={isLowBalance}
          accentColor={isLowBalance ? "#fb7185" : "#34d399"}
        />

        <SceneSpeechTag
          x={stickX}
          y={196}
          jp={
            isLowBalance
              ? "✕ 残高不足！"
              : isAdjust
                ? "精算 OK! ✓"
                : isStaff
                  ? "すみません！"
                  : "ピッ！ ✓ OK"
          }
          en={
            isLowBalance
              ? "Use yellow 精算機"
              : isAdjust
                ? "Fare Adjusted"
                : isStaff
                  ? "Ask station staff"
                  : "Pass smoothly"
          }
          accent={isLowBalance ? "#f43f5e" : isAdjust ? "#facc15" : "#34d399"}
        />
      </g>
    </g>
  );
};

/**
 * Scene 4 (Layered 2.5D): Elevated Twilight Platform -> Commuter Train with Air-Brake Steam Puffs
 * -> City Windows -> Dynamic Train-Type Badges & Bright Yellow 出口 EXIT Sign!
 */
const RideAndExitTrain25D: React.FC<{
  readonly localSec: number;
  readonly progress: number;
  readonly activeKey: string;
}> = ({ localSec, progress, activeKey }) => {
  const effectiveKey = activeKey || (progress < 0.5 ? "rapid" : "exit");
  const camPan = Math.sin(localSec * 0.42) * 12;

  const isTrainType =
    effectiveKey === "local" ||
    effectiveKey === "rapid" ||
    effectiveKey === "express" ||
    effectiveKey === "limited";
  const isTransfer = effectiveKey === "transfer";
  const isLastTrain = effectiveKey === "last_train";
  const isExitOrGuide = effectiveKey === "exit" || effectiveKey === "guide";

  const trainBadge =
    effectiveKey === "local"
      ? { jp: "各駅停車", en: "Local", color: "#38bdf8" }
      : effectiveKey === "express"
        ? { jp: "急行", en: "Express", color: "#fbbf24" }
        : effectiveKey === "limited"
          ? { jp: "特急", en: "Ltd. Exp.", color: "#f43f5e" }
          : { jp: "快速", en: "Rapid", color: "#34d399" };

  const trainCruiseX = isTrainType
    ? -16 + Math.sin(localSec * 0.9) * 14
    : 0;
  const doorOpen = isExitOrGuide ? 22 : 8;
  const bgScroll = isTrainType ? (localSec * 90) % 140 : 0;

  return (
    <g>
      {/* Layer 0: Twilight City Skyline & Warm Lit Windows Scrolling Past Tracks */}
      <g transform={`translate(${camPan * 0.3}, 0)`}>
        <defs>
          <linearGradient id="sky-train-25d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
        </defs>
        <rect x="-40" y="-20" width="720" height="390" fill="url(#sky-train-25d)" />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const bx = ((i * 140 - bgScroll + 840) % 840) - 90;
          return (
            <g key={i} transform={`translate(${bx}, ${118 + (i % 2) * 26})`}>
              <rect width="74" height="150" rx="5" fill="#1e293b" stroke={INK} strokeWidth="2.5" />
              {[18, 44, 70].map((wy) => (
                <g key={wy}>
                  <rect x="12" y={wy} width="16" height="14" rx="2" fill="#fde047" opacity="0.72" />
                  <rect x="42" y={wy} width="16" height="14" rx="2" fill="#fde047" opacity="0.45" />
                </g>
              ))}
            </g>
          );
        })}
      </g>

      {/* Layer 1: Overhead Gantries (3番線 / Clock for 終電 / Yellow 出口 EXIT / 乗り換え Transfer) */}
      <g transform={`translate(${camPan * 0.65}, 0)`}>
        {/* Platform 3 & Train-Type LED Sign (clear of top-left LIVE pill) */}
        <g transform="translate(26, 56)">
          <rect
            x="0"
            y="0"
            width="172"
            height="62"
            rx="10"
            fill="#0f172a"
            stroke={isTrainType ? trainBadge.color : INK}
            strokeWidth="3.2"
          />
          <rect x="8" y="8" width="156" height="24" rx="6" fill={trainBadge.color} />
          <text x="86" y="25" textAnchor="middle" fill={INK} fontSize="14.5" fontWeight="900">
            3番線 {trainBadge.jp}
          </text>
          <text x="86" y="50" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="800">
            {trainBadge.en} · 新宿 Shinjuku
          </text>
        </g>

        {/* Illuminated Last Train Clock when 終電 active */}
        {isLastTrain ? (
          <g transform="translate(226, 20)">
            <rect x="0" y="0" width="166" height="60" rx="10" fill="#450a0a" stroke="#fbbf24" strokeWidth="3.2" />
            <text x="83" y="25" textAnchor="middle" fill="#fde047" fontSize="16" fontWeight="900">
              23:58 終電!
            </text>
            <text x="83" y="46" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800">
              Last Train Departing
            </text>
          </g>
        ) : null}

        {/* Transfer Sign when 乗り換え active */}
        {isTransfer ? (
          <g transform="translate(216, 20)">
            <rect x="0" y="0" width="182" height="60" rx="10" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="3.2" />
            <text x="91" y="26" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="900">
              乗り換え Transfer ⇄
            </text>
            <text x="91" y="46" textAnchor="middle" fill="#7dd3fc" fontSize="11.5" fontWeight="800">
              JR 山手線 → 東京メトロ
            </text>
          </g>
        ) : null}

        {/* Japan Standardized Bright Yellow EXIT Sign (Always visible, glows on Exit/Guide) */}
        <g
          transform="translate(422, 20)"
          opacity={isExitOrGuide ? 1 : 0.72}
        >
          <rect
            x="0"
            y="0"
            width="192"
            height="62"
            rx="10"
            fill="#facc15"
            stroke={isExitOrGuide ? "#ffffff" : INK}
            strokeWidth={isExitOrGuide ? "4" : "3"}
          />
          <text x="96" y="29" textAnchor="middle" fill={INK} fontSize="20" fontWeight="900">
            出口 EXIT →
          </text>
          <text x="96" y="49" textAnchor="middle" fill="#1e293b" fontSize="12" fontWeight="800">
            案内 Station Guide
          </text>
        </g>
      </g>

      {/* Layer 1.5: Sleek Colorful Commuter Train Car with Air-Brake Steam Puffs */}
      <g transform={`translate(${88 + trainCruiseX + camPan * 0.85}, 152)`}>
        {/* Air-brake steam puffs near bogies */}
        <SteamPuffs originX={34} originY={184} localSec={localSec} driftX={-32} riseY={24} scale={0.85} />
        <SteamPuffs originX={390} originY={184} localSec={localSec + 0.4} driftX={32} riseY={24} scale={0.85} />

        {/* Train body */}
        <rect
          x="0"
          y="0"
          width="454"
          height="196"
          rx="18"
          fill="#e2e8f0"
          stroke={INK}
          strokeWidth="3.8"
        />
        {/* Iconic JR/Metro vibrant color stripe */}
        <rect x="3" y="114" width="448" height="22" fill={trainBadge.color} />
        {/* Roof detail */}
        <rect x="52" y="-10" width="90" height="10" rx="4" fill="#64748b" stroke={INK} strokeWidth="2.4" />
        <rect x="290" y="-10" width="90" height="10" rx="4" fill="#64748b" stroke={INK} strokeWidth="2.4" />

        {/* Warm Lit Train Passenger Windows */}
        <rect x="26" y="34" width="114" height="66" rx="8" fill="#fef3c7" stroke={INK} strokeWidth="3" />
        <rect x="310" y="34" width="114" height="66" rx="8" fill="#fef3c7" stroke={INK} strokeWidth="3" />

        {/* Train Destination Sign */}
        <rect x="36" y="10" width="124" height="20" rx="4" fill="#0f172a" stroke={INK} strokeWidth="1.8" />
        <text x="98" y="24" textAnchor="middle" fill={trainBadge.color} fontSize="11.5" fontWeight="900">
          {trainBadge.jp} · 新宿行
        </text>

        {/* Center Sliding Doorway */}
        <rect x="170" y="28" width="114" height="156" rx="6" fill="#0f172a" stroke={INK} strokeWidth="3" />
        <rect
          x={172 - doorOpen}
          y="30"
          width="54"
          height="152"
          rx="3"
          fill="#94a3b8"
          fillOpacity={0.82}
          stroke={INK}
          strokeWidth="2.2"
        />
        <rect
          x={228 + doorOpen}
          y="30"
          width="54"
          height="152"
          rx="3"
          fill="#94a3b8"
          fillOpacity={0.82}
          stroke={INK}
          strokeWidth="2.2"
        />
      </g>

      {/* Platform Foreground + Yellow Tactile Line */}
      <rect x="-40" y="352" width="720" height="118" fill="#334155" stroke={INK} strokeWidth="3.2" />
      <rect x="-40" y="352" width="720" height="11" fill="#facc15" stroke={INK} strokeWidth="2" />

      {/* Stickman riding / pointing to Exit */}
      <g transform={`translate(${camPan}, 0)`}>
        <StickmanFigure
          x={isExitOrGuide ? 464 : 308}
          y={296}
          facing={1}
          scale={1.16}
          leanDeg={4}
          headTiltDeg={isExitOrGuide ? -10 : 0}
          leftUpperArmDeg={-16}
          leftForearmDeg={12}
          rightUpperArmDeg={isExitOrGuide ? 115 : 88}
          rightForearmDeg={isExitOrGuide ? 124 : 102}
          leftThighDeg={-8}
          leftCalfDeg={-4}
          rightThighDeg={8}
          rightCalfDeg={4}
          hasBackpack
          expression="happy"
          accentColor={isExitOrGuide ? "#facc15" : trainBadge.color}
        />

        <SceneSpeechTag
          x={isExitOrGuide ? 430 : 308}
          y={196}
          jp={
            isTransfer
              ? "乗り換えはどこ？"
              : isLastTrain
                ? "急いで！終電です！"
                : isExitOrGuide
                  ? "黄色い出口へ！"
                  : `${trainBadge.jp}に乗ります！`
          }
          en={
            isTransfer
              ? "Find transfer line"
              : isLastTrain
                ? "Catch the last train"
                : isExitOrGuide
                  ? "Follow yellow EXIT"
                  : `${trainBadge.en} Train`
          }
          accent={isExitOrGuide ? "#facc15" : trainBadge.color}
        />
      </g>
    </g>
  );
};

/**
 * Vibrant, colorful, layered 2.5D vector animation stage driven strictly by
 * `useCurrentFrame()` and dynamically synced to `activeSubTopicKey`.
 */
export const StickmanScenePlayer: React.FC<StickmanScenePlayerProps> = ({
  scene,
  sectionStartSec,
  sectionEndSec,
  activeSubTopicKey = "",
  activeSubTopicLabel,
  caption,
  width = "100%",
  height = 465,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const localSec = Math.max(0, timeSec - sectionStartSec);
  const sectionDur = Math.max(9, sectionEndSec - sectionStartSec);
  const progress = clamp01(localSec / sectionDur);

  // Subtle continuous camera breathing/zoom inside viewport
  const camZoom = interpolate(
    Math.sin(localSec * 0.55),
    [-1, 1],
    [1.0, 1.045],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        borderRadius: 18,
        overflow: "hidden",
        border: "2px solid rgba(52, 211, 153, 0.36)",
        backgroundColor: "#0a121a",
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.45)",
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
          backgroundColor: "#0a121a",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 640 460"
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            fontFamily:
              '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
            transform: `scale(${camZoom.toFixed(4)})`,
            transformOrigin: "center center",
          }}
        >
          {scene === "walk_to_station" ? (
            <WalkToStation25D
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          ) : scene === "buy_ticket_ic" ? (
            <BuyTicketIc25D
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          ) : scene === "tap_ticket_gate" ? (
            <TapTicketGate25D
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          ) : (
            <RideAndExitTrain25D
              localSec={localSec}
              progress={progress}
              activeKey={activeSubTopicKey}
            />
          )}

          {/* Bottom live progress bar */}
          <rect x="20" y="446" width="600" height="5" rx="2.5" fill="rgba(17,24,39,0.55)" />
          <rect
            x="20"
            y="446"
            width={Math.round(600 * progress)}
            height="5"
            rx="2.5"
            fill="#34d399"
          />
        </svg>

        {activeSubTopicLabel ? (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              padding: "5px 13px",
              borderRadius: 999,
              backgroundColor: "rgba(11, 18, 26, 0.86)",
              border: "1.5px solid rgba(52, 211, 153, 0.65)",
              color: "#34d399",
              fontSize: 13,
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
            padding: "8px 14px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "#0e1720",
            fontSize: 14.5,
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
