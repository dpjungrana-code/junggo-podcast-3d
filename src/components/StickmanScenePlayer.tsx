import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { StickmanSceneId } from "../data/demoEpisode";

export type StickmanScenePlayerProps = {
  readonly scene: StickmanSceneId;
  readonly sectionStartSec: number;
  readonly sectionEndSec: number;
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
  readonly expression?: "neutral" | "happy" | "surprised" | "focused";
  readonly sweatDrop?: boolean;
  readonly accentColor?: string;
};

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
 * Clean 2D articulated stickman rig inspired by `stickman-video-director`.
 * Angles are specified in degrees clockwise from straight downward (+Y) when facing=+1.
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
  expression = "neutral",
  sweatDrop = false,
  accentColor = "#34d399",
}) => {
  const torsoLen = 40;
  const upperArmLen = 22;
  const forearmLen = 20;
  const thighLen = 25;
  const calfLen = 25;
  const headRadius = 14;

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

  const renderHandProp = (hand: { readonly x: number; readonly y: number }, side: "right" | "left") => (
    <g key={`prop-${side}`}>
      {holdCardHand === side ? (
        <g transform={`translate(${hand.x + 2}, ${hand.y - 5}) rotate(-14)`}>
          <rect
            x="0"
            y="0"
            width="18"
            height="12"
            rx="2.5"
            fill="#10b981"
            stroke="#a7f3d0"
            strokeWidth="1.5"
          />
          <rect x="2.5" y="3" width="6" height="3" rx="0.8" fill="#fef08a" />
          <line x1="10.5" y1="8.5" x2="15.5" y2="8.5" stroke="#ecfdf5" strokeWidth="1.4" />
        </g>
      ) : null}
      {holdTicketHand === side ? (
        <g transform={`translate(${hand.x + 1}, ${hand.y - 8}) rotate(-18)`}>
          <rect
            x="0"
            y="0"
            width="16"
            height="10"
            rx="2"
            fill="#fde68a"
            stroke="#f59e0b"
            strokeWidth="1.4"
          />
          <circle cx="5" cy="5" r="1.5" fill="#92400e" />
          <line x1="8.5" y1="5" x2="13.5" y2="5" stroke="#92400e" strokeWidth="1.5" />
        </g>
      ) : null}
    </g>
  );

  return (
    <g transform={`translate(${x}, ${y}) scale(${facing * scale}, ${scale})`}>
      {/* Ground shadow */}
      <ellipse cx="0" cy={49} rx="18" ry="4.5" fill="rgba(52, 211, 153, 0.14)" />

      {/* Back arm (left) */}
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${lElbow.x} ${lElbow.y} L ${lHand.x} ${lHand.y}`}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lHand.x} cy={lHand.y} r="3" fill="#cbd5e1" />
      {renderHandProp(lHand, "left")}

      {/* Optional traveler backpack */}
      {hasBackpack ? (
        <g
          transform={`translate(${shoulder.x - 15}, ${shoulder.y + 3}) rotate(${leanDeg})`}
        >
          <rect
            x="0"
            y="0"
            width="13"
            height="25"
            rx="5"
            fill="#1e293b"
            stroke={accentColor}
            strokeWidth="2.2"
          />
          <line x1="3" y1="8" x2="10" y2="8" stroke={accentColor} strokeWidth="1.8" />
        </g>
      ) : null}

      {/* Back leg (left) */}
      <path
        d={`M ${hip.x} ${hip.y} L ${lKnee.x} ${lKnee.y} L ${lFoot.x} ${lFoot.y}`}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={lFoot.x}
        y1={lFoot.y}
        x2={lFoot.x + 7}
        y2={lFoot.y}
        stroke="#cbd5e1"
        strokeWidth="4.4"
        strokeLinecap="round"
      />

      {/* Torso */}
      <line
        x1={hip.x}
        y1={hip.y}
        x2={neck.x}
        y2={neck.y}
        stroke="#f8fafc"
        strokeWidth="5.4"
        strokeLinecap="round"
      />

      {/* Front leg (right) */}
      <path
        d={`M ${hip.x} ${hip.y} L ${rKnee.x} ${rKnee.y} L ${rFoot.x} ${rFoot.y}`}
        fill="none"
        stroke="#f8fafc"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={rFoot.x}
        y1={rFoot.y}
        x2={rFoot.x + 8}
        y2={rFoot.y}
        stroke="#f8fafc"
        strokeWidth="4.6"
        strokeLinecap="round"
      />

      {/* Head */}
      <circle
        cx={headCenter.x}
        cy={headCenter.y}
        r={headRadius}
        fill="#0b1319"
        stroke="#f8fafc"
        strokeWidth="4.2"
      />
      {/* Headband hint connecting to JungGo ninja mascot */}
      <path
        d={`M ${headCenter.x - 12} ${headCenter.y - 6} Q ${headCenter.x} ${headCenter.y - 9} ${headCenter.x + 12} ${headCenter.y - 6}`}
        fill="none"
        stroke={accentColor}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Minimal expressive eyes & mouth facing +X */}
      <circle cx={headCenter.x + 5.2} cy={headCenter.y - 0.5} r="1.8" fill="#f8fafc" />
      <circle cx={headCenter.x + 10.2} cy={headCenter.y - 0.5} r="1.5" fill="#f8fafc" />
      {expression === "happy" ? (
        <path
          d={`M ${headCenter.x + 4} ${headCenter.y + 5} Q ${headCenter.x + 7.5} ${headCenter.y + 8.5} ${headCenter.x + 11} ${headCenter.y + 4.5}`}
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : expression === "surprised" ? (
        <circle
          cx={headCenter.x + 7.5}
          cy={headCenter.y + 6}
          r="2.4"
          fill="#fb7185"
        />
      ) : (
        <line
          x1={headCenter.x + 5}
          y1={headCenter.y + 5.5}
          x2={headCenter.x + 10}
          y2={headCenter.y + 5.5}
          stroke="#94a3b8"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}

      {/* Manga sweat drop when startled */}
      {sweatDrop ? (
        <path
          d={`M ${headCenter.x - 16} ${headCenter.y - 11} C ${headCenter.x - 19} ${headCenter.y - 4}, ${headCenter.x - 13} ${headCenter.y - 4}, ${headCenter.x - 16} ${headCenter.y - 11} Z`}
          fill="#38bdf8"
          stroke="#bae6fd"
          strokeWidth="1"
        />
      ) : null}

      {/* Front arm (right) */}
      <path
        d={`M ${shoulder.x} ${shoulder.y} L ${rElbow.x} ${rElbow.y} L ${rHand.x} ${rHand.y}`}
        fill="none"
        stroke="#f8fafc"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={rHand.x} cy={rHand.y} r="3.2" fill={accentColor} />
      {renderHandProp(rHand, "right")}
    </g>
  );
};

const HudBeatBadge: React.FC<{
  readonly beatLabel: string;
  readonly accent?: string;
}> = ({ beatLabel, accent = "#34d399" }) => (
  <g transform="translate(14, 14)">
    <rect
      x="0"
      y="0"
      width="216"
      height="26"
      rx="13"
      fill="rgba(13, 20, 26, 0.9)"
      stroke={accent}
      strokeWidth="1.3"
      strokeOpacity="0.65"
    />
    <circle cx="14" cy="13" r="4" fill={accent} />
    <text
      x="24"
      y="17"
      fill="#e2f5ec"
      fontSize="11.5"
      fontWeight="800"
      letterSpacing="0.03em"
    >
      {beatLabel}
    </text>
  </g>
);

const SpeechBubble: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly subtext?: string;
  readonly accent?: string;
  readonly opacity?: number;
}> = ({ x, y, text, subtext, accent = "#34d399", opacity = 1 }) => {
  if (opacity <= 0.02) {
    return null;
  }
  const boxW = Math.max(106, text.length * 14 + 28);
  const boxH = subtext ? 46 : 32;
  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      <rect
        x={-boxW / 2}
        y={-boxH}
        width={boxW}
        height={boxH}
        rx="12"
        fill="#101c24"
        stroke={accent}
        strokeWidth="1.8"
      />
      <polygon
        points="-6,0 6,0 0,9"
        fill="#101c24"
        stroke={accent}
        strokeWidth="1.5"
      />
      <rect x={-boxW / 2 + 2} y={-5} width={boxW - 4} height="5" fill="#101c24" />
      <text
        x="0"
        y={subtext ? -24 : -11}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="14.5"
        fontWeight="800"
      >
        {text}
      </text>
      {subtext ? (
        <text
          x="0"
          y="-9"
          textAnchor="middle"
          fill={accent}
          fontSize="10.5"
          fontWeight="700"
        >
          {subtext}
        </text>
      ) : null}
    </g>
  );
};

/**
 * Scene 1: Walking along a Tokyo sidewalk -> Spotting 駅 (Station) -> Pointing to 北口/南口 Exits
 */
const WalkToStationScene: React.FC<{
  readonly localSec: number;
  readonly progress: number;
}> = ({ localSec, progress }) => {
  const beatIndex = progress < 0.34 ? 1 : progress < 0.67 ? 2 : 3;
  const beatLabel =
    beatIndex === 1
      ? "BEAT 1/3 · 駅を探す (Find Station)"
      : beatIndex === 2
        ? "BEAT 2/3 · 入口 (Station Sign)"
        : "BEAT 3/3 · 北口・南口 (Directions)";

  const stickX =
    progress < 0.34
      ? lerpRange(progress, 0.0, 0.34, 72, 168)
      : progress < 0.67
        ? lerpRange(progress, 0.34, 0.45, 168, 178)
        : lerpRange(progress, 0.67, 1.0, 178, 226);

  const isWalking =
    progress < 0.32 || (progress > 0.78 && progress < 0.96);
  const stridePhase = localSec * 6.8;
  const walkAmp = isWalking ? 1 : 0;
  const stride = Math.sin(stridePhase) * 26 * walkAmp;
  const bob = isWalking ? Math.abs(Math.cos(stridePhase)) * 3.5 : 0;

  // Arm transitions smoothly from walking swing -> pointing up at Station/Directions sign
  const pointBlend =
    progress >= 0.4 && progress < 0.67
      ? lerpRange(progress, 0.4, 0.48, 0, 1) * (1 - lerpRange(progress, 0.62, 0.67, 0, 0.4))
      : progress >= 0.67
        ? lerpRange(progress, 0.67, 0.74, 0.6, 1)
        : 0;

  const rightUpperArmDeg = pointBlend * 116 + (1 - pointBlend) * (-stride * 0.75 + 14);
  const rightForearmDeg = pointBlend * 124 + (1 - pointBlend) * (-stride * 0.55 + 32);
  const headTiltDeg = pointBlend > 0.25 ? -15 * pointBlend : -3;

  const signReveal = clamp01((progress - 0.24) / 0.12);
  const exitBoardReveal = clamp01((progress - 0.62) / 0.1);
  const scrollOffset = isWalking ? (localSec * 52) % 60 : 0;

  return (
    <g>
      {/* Night sky & Tokyo skyline silhouettes */}
      <rect x="0" y="255" width="480" height="105" fill="#0d171f" />
      <line x1="0" y1="255" x2="480" y2="255" stroke="#34d399" strokeWidth="2" strokeOpacity="0.6" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const dashX = ((i * 60 - scrollOffset + 540) % 540) - 40;
        return (
          <rect
            key={i}
            x={dashX}
            y="296"
            width="28"
            height="4"
            rx="2"
            fill="rgba(148, 163, 184, 0.24)"
          />
        );
      })}

      {/* Stylized station building silhouette on the right */}
      <g transform={`translate(285, 118)`} opacity={0.35 + signReveal * 0.65}>
        <rect
          x="0"
          y="38"
          width="162"
          height="99"
          rx="6"
          fill="#101b24"
          stroke="#334155"
          strokeWidth="2"
        />
        {/* Station glass entrance arch */}
        <rect
          x="48"
          y="76"
          width="66"
          height="61"
          rx="4"
          fill="#091319"
          stroke="#34d399"
          strokeWidth="2"
        />
        <line x1="81" y1="76" x2="81" y2="137" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6" />
        {/* JR-style overhead station fascia */}
        <rect
          x="16"
          y="16"
          width="130"
          height="32"
          rx="6"
          fill="#14532d"
          stroke="#34d399"
          strokeWidth="2.2"
        />
        <text x="81" y="36" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">
          駅 STATION
        </text>
        <text x="81" y="68" textAnchor="middle" fill="#34d399" fontSize="11.5" fontWeight="800">
          入口 ENTRANCE
        </text>
      </g>

      {/* Directional North / South Signboard (Beat 3) */}
      {exitBoardReveal > 0.02 ? (
        <g
          transform={`translate(274, ${60 - (1 - exitBoardReveal) * 14})`}
          opacity={exitBoardReveal}
        >
          <rect
            x="0"
            y="0"
            width="184"
            height="54"
            rx="9"
            fill="#1e293b"
            stroke="#facc15"
            strokeWidth="2.2"
          />
          <rect x="0" y="0" width="184" height="24" rx="8" fill="#facc15" />
          <text x="92" y="16" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="900">
            ← 北口 North ｜ 南口 South →
          </text>
          <text x="92" y="42" textAnchor="middle" fill="#e2e8f0" fontSize="11.5" fontWeight="700">
            東口 East ・ 西口 West
          </text>
          {/* Sign post */}
          <line x1="92" y1="54" x2="92" y2="74" stroke="#94a3b8" strokeWidth="3" />
        </g>
      ) : null}

      {/* Emerald recognition spark when spotting station */}
      {progress >= 0.36 && progress <= 0.65 ? (
        <g transform={`translate(${stickX + 22}, ${148 - bob})`}>
          <circle cx="0" cy="0" r="11" fill="#148c53" stroke="#34d399" strokeWidth="1.8" />
          <text x="0" y="4.5" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="900">
            !
          </text>
        </g>
      ) : null}

      {/* Stickman traveler */}
      <StickmanFigure
        x={stickX}
        y={206 - bob}
        facing={1}
        leanDeg={isWalking ? 7 : 1}
        headTiltDeg={headTiltDeg}
        leftUpperArmDeg={stride * 0.8 - 10}
        leftForearmDeg={stride * 0.55 + 16}
        rightUpperArmDeg={rightUpperArmDeg}
        rightForearmDeg={rightForearmDeg}
        leftThighDeg={-stride}
        leftCalfDeg={-stride * 0.65 - (isWalking ? 8 : 2)}
        rightThighDeg={stride}
        rightCalfDeg={stride * 0.65 - (isWalking ? 4 : 0)}
        hasBackpack
        expression={progress > 0.42 ? "happy" : "focused"}
      />

      {/* Japanese speech prompt bubbles */}
      <SpeechBubble
        x={stickX + 8}
        y={138 - bob}
        text="駅はどこですか？"
        subtext="Where is the station?"
        opacity={
          clamp01((progress - 0.05) / 0.08) *
          (1 - clamp01((progress - 0.38) / 0.08))
        }
      />
      <SpeechBubble
        x={stickX + 12}
        y={138 - bob}
        text="あ！北口です！"
        subtext="North Exit!"
        opacity={clamp01((progress - 0.72) / 0.08)}
      />

      <HudBeatBadge beatLabel={beatLabel} />
    </g>
  );
};

/**
 * Scene 2: Japanese Ticket Vending Machine (券売機) — Screen Tap -> IC Charge -> Ticket Pickup
 */
const BuyTicketIcScene: React.FC<{
  readonly localSec: number;
  readonly progress: number;
}> = ({ localSec, progress }) => {
  const beatIndex = progress < 0.35 ? 1 : progress < 0.72 ? 2 : 3;
  const beatLabel =
    beatIndex === 1
      ? "BEAT 1/3 · 券売機 (Select Fare)"
      : beatIndex === 2
        ? "BEAT 2/3 · チャージ (IC Top-Up)"
        : "BEAT 3/3 · 切符 (Take Ticket)";

  const stickX = lerpRange(progress, 0.0, 0.22, 86, 174);
  const walkPhase = clamp01(1 - progress / 0.22);
  const stride = Math.sin(localSec * 6.5) * 20 * walkPhase;

  const isTouchScreen = progress >= 0.18 && progress < 0.42;
  const isTapCard = progress >= 0.42 && progress < 0.72;
  const isTakeTicket = progress >= 0.72;

  const armReachY = isTouchScreen ? 102 : isTapCard ? 74 : isTakeTicket ? 116 : 30;
  const chargeFill = clamp01((progress - 0.44) / 0.24);
  const ticketDrop = clamp01((progress - 0.72) / 0.14);

  const rippleRadius = ((localSec * 28) % 22) + 5;
  const rippleAlpha = 1 - (rippleRadius - 5) / 22;

  return (
    <g>
      <rect x="0" y="275" width="480" height="85" fill="#0d171f" />
      <line x1="0" y1="275" x2="480" y2="275" stroke="#34d399" strokeWidth="2" strokeOpacity="0.6" />

      {/* Japanese Ticket Vending Machine (券売機) */}
      <g transform="translate(262, 74)">
        <rect
          x="0"
          y="0"
          width="156"
          height="201"
          rx="10"
          fill="#17232e"
          stroke="#475569"
          strokeWidth="2.5"
        />
        {/* Header sign */}
        <rect x="10" y="10" width="136" height="24" rx="5" fill="#148c53" />
        <text x="78" y="26" textAnchor="middle" fill="#ffffff" fontSize="12.5" fontWeight="900">
          きっぷ 券売機・チャージ
        </text>

        {/* Illuminated touchscreen LCD */}
        <rect
          x="16"
          y="44"
          width="88"
          height="66"
          rx="6"
          fill="#0a1926"
          stroke="#38bdf8"
          strokeWidth="2"
        />
        <text x="60" y="61" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="800">
          {isTapCard ? "Suica チャージ" : isTakeTicket ? "発券完了 OK!" : "片道 / 往復 [EN]"}
        </text>
        {/* Route buttons or charge meter */}
        {isTapCard ? (
          <g>
            <rect x="24" y="72" width="72" height="12" rx="6" fill="#1e293b" />
            <rect
              x="24"
              y="72"
              width={72 * chargeFill}
              height="12"
              rx="6"
              fill="#34d399"
            />
            <text x="60" y="100" textAnchor="middle" fill="#a7f3d0" fontSize="11" fontWeight="900">
              +¥1,000 {chargeFill > 0.9 ? "✓" : "..."}
            </text>
          </g>
        ) : (
          <g>
            <rect x="22" y="69" width="34" height="16" rx="3" fill="#14532d" stroke="#34d399" strokeWidth="1.2" />
            <text x="39" y="80" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="800">
              ¥200
            </text>
            <rect x="62" y="69" width="34" height="16" rx="3" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1.2" />
            <text x="79" y="80" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="800">
              ¥320
            </text>
            <rect x="22" y="90" width="74" height="12" rx="3" fill="#0f766e" />
            <text x="59" y="99" textAnchor="middle" fill="#ecfdf5" fontSize="8.5" fontWeight="800">
              English Guide
            </text>
          </g>
        )}

        {/* Coin slot & Card holder pad */}
        <rect
          x="112"
          y="46"
          width="32"
          height="24"
          rx="4"
          fill="#0c151d"
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
        <text x="128" y="61" textAnchor="middle" fill="#fbbf24" fontSize="8.5" fontWeight="800">
          硬貨
        </text>
        {/* IC Card tray */}
        <rect
          x="110"
          y="80"
          width="36"
          height="32"
          rx="5"
          fill="#072238"
          stroke={isTapCard ? "#38bdf8" : "#334155"}
          strokeWidth="2"
        />
        <text x="128" y="99" textAnchor="middle" fill="#7dd3fc" fontSize="9.5" fontWeight="900">
          IC
        </text>

        {/* RFID tap waves on Beat 2 */}
        {isTapCard ? (
          <g transform="translate(128, 96)">
            <circle
              cx="0"
              cy="0"
              r={rippleRadius}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              opacity={rippleAlpha}
            />
          </g>
        ) : null}

        {/* Touch screen ripple on Beat 1 */}
        {isTouchScreen ? (
          <g transform="translate(46, 77)">
            <circle
              cx="0"
              cy="0"
              r={rippleRadius * 0.75}
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              opacity={rippleAlpha}
            />
          </g>
        ) : null}

        {/* Ticket dispenser slot */}
        <rect x="24" y="138" width="108" height="24" rx="4" fill="#080d12" stroke="#334155" strokeWidth="1.5" />
        <line x1="36" y1="150" x2="120" y2="150" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

        {/* Emerging paper ticket (切符) */}
        {ticketDrop > 0.05 ? (
          <g transform={`translate(56, ${147 - ticketDrop * 12})`}>
            <rect
              x="0"
              y="0"
              width="34"
              height="18"
              rx="3"
              fill="#fde68a"
              stroke="#f59e0b"
              strokeWidth="1.8"
            />
            <text x="17" y="12" textAnchor="middle" fill="#78350f" fontSize="9.5" fontWeight="900">
              切符
            </text>
          </g>
        ) : null}
      </g>

      {/* Stickman interacting with machine */}
      <StickmanFigure
        x={stickX}
        y={226}
        facing={1}
        leanDeg={isTakeTicket ? -2 : 4}
        headTiltDeg={isTouchScreen ? -6 : 2}
        leftUpperArmDeg={-16}
        leftForearmDeg={-6}
        rightUpperArmDeg={armReachY}
        rightForearmDeg={armReachY + 12}
        leftThighDeg={-stride - 6}
        leftCalfDeg={-stride * 0.4 - 4}
        rightThighDeg={stride + 6}
        rightCalfDeg={stride * 0.4 + 2}
        hasBackpack
        holdCardHand={isTapCard ? "right" : null}
        holdTicketHand={progress > 0.8 ? "right" : null}
        expression={isTakeTicket ? "happy" : "focused"}
      />

      {/* Victory checkmark bubble in Beat 3 */}
      {progress > 0.8 ? (
        <SpeechBubble
          x={stickX + 8}
          y={154}
          text="切符・チャージ OK!"
          subtext="Ready for the gate"
          opacity={clamp01((progress - 0.8) / 0.1)}
        />
      ) : null}

      <HudBeatBadge beatLabel={beatLabel} />
    </g>
  );
};

/**
 * Scene 3: Automatic Ticket Gate (改札口) Tap & Low-Balance 精算機 (Fare Adjustment)
 */
const TapTicketGateScene: React.FC<{
  readonly localSec: number;
  readonly progress: number;
}> = ({ localSec, progress }) => {
  const beatIndex = progress < 0.44 ? 1 : progress < 0.72 ? 2 : 3;
  const beatLabel =
    beatIndex === 1
      ? "BEAT 1/3 · 改札口 (IC Card Tap)"
      : beatIndex === 2
        ? "BEAT 2/3 · 残高不足 (Low Balance!)"
        : "BEAT 3/3 · 精算機 (Fare Adjust OK)";

  // Beat 1: approach & pass cleanly through gate
  // Beat 2: red alert at gate -> lean back with sweat drop
  // Beat 3: walk right to yellow 精算機 and top up!
  const stickX =
    progress < 0.44
      ? progress < 0.2
        ? lerpRange(progress, 0.0, 0.2, 68, 170)
        : progress < 0.28
          ? 170
          : lerpRange(progress, 0.28, 0.44, 170, 290)
      : progress < 0.72
        ? lerpRange(progress, 0.44, 0.56, 134, 170)
        : lerpRange(progress, 0.72, 0.88, 170, 326);

  const walkingNow =
    progress < 0.19 ||
    (progress > 0.29 && progress < 0.43) ||
    (progress > 0.44 && progress < 0.55) ||
    (progress > 0.72 && progress < 0.87);

  const stride = walkingNow ? Math.sin(localSec * 7.2) * 24 : 0;
  const bob = walkingNow ? Math.abs(Math.cos(localSec * 7.2)) * 3 : 0;

  const tapGateGreen = progress >= 0.18 && progress <= 0.3;
  const tapGateRed = progress >= 0.54 && progress <= 0.72;
  const payYellowMachine = progress >= 0.84;

  const flapOpenAmount =
    progress < 0.44
      ? clamp01((progress - 0.21) / 0.08)
      : 0; // closed during Beat 2 red alert!

  const pulseRadius = ((localSec * 36) % 28) + 6;
  const pulseAlpha = 1 - (pulseRadius - 6) / 28;

  const rightUpperArmDeg =
    tapGateGreen || tapGateRed
      ? 68
      : payYellowMachine
        ? 112
        : -stride * 0.75 + 16;
  const rightForearmDeg =
    tapGateGreen || tapGateRed
      ? 92
      : payYellowMachine
        ? 125
        : -stride * 0.5 + 28;

  return (
    <g>
      {/* Floor */}
      <rect x="0" y="278" width="480" height="82" fill="#0d171f" />
      <line x1="0" y1="278" x2="480" y2="278" stroke="#34d399" strokeWidth="2" strokeOpacity="0.6" />

      {/* Automatic Ticket Gate (改札口) centered around x=200..268 */}
      <g transform="translate(198, 168)">
        {/* Gate body */}
        <rect
          x="0"
          y="0"
          width="74"
          height="110"
          rx="8"
          fill="#1b2936"
          stroke={tapGateRed ? "#f43f5e" : "#475569"}
          strokeWidth="2.5"
        />
        {/* Top stripe */}
        <rect
          x="0"
          y="0"
          width="74"
          height="18"
          rx="6"
          fill={tapGateRed ? "#be123c" : "#14532d"}
        />
        <text x="37" y="12.5" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="900">
          改札口
        </text>
        {/* Glowing blue IC reader pad */}
        <rect
          x="10"
          y="28"
          width="30"
          height="24"
          rx="5"
          fill={tapGateRed ? "#4c0519" : "#0c4a6e"}
          stroke={tapGateRed ? "#fb7185" : "#38bdf8"}
          strokeWidth="2"
        />
        <text x="25" y="43.5" textAnchor="middle" fill="#e0f2fe" fontSize="10" fontWeight="900">
          IC
        </text>

        {/* Animated gate flap bars */}
        <g transform={`translate(56, 36) scale(${1 - flapOpenAmount * 0.75}, 1)`}>
          <rect
            x="0"
            y="0"
            width="28"
            height="42"
            rx="4"
            fill={tapGateRed ? "#e11d48" : "#34d399"}
            fillOpacity={tapGateRed ? 0.85 : 0.75}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </g>

        {/* Green Tap Ring & Soundwave (Beat 1) */}
        {tapGateGreen ? (
          <g transform="translate(25, 38)">
            <circle
              cx="0"
              cy="0"
              r={pulseRadius}
              fill="none"
              stroke="#34d399"
              strokeWidth="2.4"
              opacity={pulseAlpha}
            />
          </g>
        ) : null}

        {/* Red Low-Balance Flash Ring (Beat 2) */}
        {tapGateRed ? (
          <g transform="translate(25, 38)">
            <circle
              cx="0"
              cy="0"
              r={pulseRadius}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.6"
              opacity={pulseAlpha}
            />
          </g>
        ) : null}
      </g>

      {/* Bright Yellow Fare Adjustment Machine (精算機) on right (Beat 3 highlighted) */}
      <g
        transform="translate(366, 108)"
        opacity={beatIndex === 3 ? 1 : 0.45}
      >
        <rect
          x="0"
          y="0"
          width="94"
          height="170"
          rx="8"
          fill="#facc15"
          stroke={beatIndex === 3 ? "#fef08a" : "#ca8a04"}
          strokeWidth="2.5"
        />
        <rect x="7" y="9" width="80" height="22" rx="4" fill="#1e293b" />
        <text x="47" y="24" textAnchor="middle" fill="#facc15" fontSize="11.5" fontWeight="900">
          精算機
        </text>
        <rect x="11" y="38" width="72" height="44" rx="5" fill="#0b151e" stroke="#334155" strokeWidth="1.5" />
        <text
          x="47"
          y="56"
          textAnchor="middle"
          fill={payYellowMachine ? "#34d399" : "#fde047"}
          fontSize="10"
          fontWeight="800"
        >
          {payYellowMachine ? "精算完了 ✓" : "不足 +¥180"}
        </text>
        <text x="47" y="72" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontWeight="700">
          {payYellowMachine ? "OK! 出口へ" : "Fare Adjust"}
        </text>
        <rect x="20" y="96" width="54" height="12" rx="3" fill="#1e293b" />
        <rect x="22" y="124" width="50" height="24" rx="4" fill="#1e293b" />
      </g>

      {/* Stickman */}
      <StickmanFigure
        x={stickX}
        y={229 - bob}
        facing={1}
        leanDeg={tapGateRed ? -10 : walkingNow ? 7 : 3}
        headTiltDeg={tapGateRed ? -12 : 4}
        leftUpperArmDeg={stride * 0.7 - 12}
        leftForearmDeg={stride * 0.5 + 14}
        rightUpperArmDeg={rightUpperArmDeg}
        rightForearmDeg={rightForearmDeg}
        leftThighDeg={-stride}
        leftCalfDeg={-stride * 0.55 - 4}
        rightThighDeg={stride}
        rightCalfDeg={stride * 0.55}
        hasBackpack
        holdCardHand={beatIndex <= 2 || payYellowMachine ? "right" : null}
        expression={tapGateRed ? "surprised" : beatIndex === 3 && payYellowMachine ? "happy" : "focused"}
        sweatDrop={tapGateRed}
        accentColor={tapGateRed ? "#fb7185" : "#34d399"}
      />

      {/* Soundwave & Feedback Badges */}
      <SpeechBubble
        x={224}
        y={144}
        text="ピッ！ ✓ OK"
        subtext="Pass smoothly"
        accent="#34d399"
        opacity={tapGateGreen ? 1 : 0}
      />
      <SpeechBubble
        x={208}
        y={140}
        text="✕ 残高不足！"
        subtext="Use yellow 精算機"
        accent="#f43f5e"
        opacity={tapGateRed ? 1 : 0}
      />
      <SpeechBubble
        x={stickX - 4}
        y={152}
        text="精算 OK! ✓"
        subtext="Fare Adjusted"
        accent="#34d399"
        opacity={payYellowMachine ? clamp01((progress - 0.84) / 0.08) : 0}
      />

      <HudBeatBadge
        beatLabel={beatLabel}
        accent={beatIndex === 2 ? "#fb7185" : beatIndex === 3 ? "#facc15" : "#34d399"}
      />
    </g>
  );
};

/**
 * Scene 4: Platform Yellow Line -> Train Arrival & Boarding -> Riding -> Exiting Under Yellow 出口 Sign
 */
const RideAndExitTrainScene: React.FC<{
  readonly localSec: number;
  readonly progress: number;
}> = ({ localSec, progress }) => {
  const beatIndex = progress < 0.34 ? 1 : progress < 0.67 ? 2 : 3;
  const beatLabel =
    beatIndex === 1
      ? "BEAT 1/3 · 番線 (Platform Wait)"
      : beatIndex === 2
        ? "BEAT 2/3 · 乗車・乗り換え (Ride)"
        : "BEAT 3/3 · 黄色い出口 (Exit Sign)";

  // Train X slides in from +360 to +78 during Beat 1, holds for boarding, cruises across Beat 2, settles Beat 3
  const trainX =
    progress < 0.24
      ? lerpRange(progress, 0.0, 0.24, 340, 88)
      : progress < 0.42
        ? 88
        : progress < 0.64
          ? lerpRange(progress, 0.42, 0.64, 88, 72)
          : 72;

  const doorsOpen =
    (progress >= 0.22 && progress < 0.4) || (progress >= 0.66 && progress <= 0.86);
  const doorSlide = doorsOpen
    ? progress < 0.5
      ? lerpRange(progress, 0.22, 0.3, 0, 18) * (1 - lerpRange(progress, 0.36, 0.4, 0, 1))
      : lerpRange(progress, 0.66, 0.72, 0, 18) * (1 - lerpRange(progress, 0.82, 0.86, 0, 1))
    : 0;

  // Stickman starts left on platform behind yellow line, boards into train window, then exits right toward yellow 出口!
  const stickX =
    progress < 0.26
      ? lerpRange(progress, 0.0, 0.16, 68, 128)
      : progress < 0.38
        ? lerpRange(progress, 0.26, 0.38, 128, 224)
        : progress < 0.68
          ? 224
          : lerpRange(progress, 0.68, 0.96, 232, 386);

  const isInsideTrain = progress >= 0.38 && progress < 0.68;
  const isWalking =
    progress < 0.15 ||
    (progress >= 0.26 && progress < 0.38) ||
    (progress >= 0.68 && progress < 0.96);

  const stride = isWalking ? Math.sin(localSec * 7.0) * 23 : 0;
  const bob = isWalking ? Math.abs(Math.cos(localSec * 7.0)) * 3 : 0;
  const cruiseScroll =
    progress >= 0.42 && progress < 0.66 ? ((localSec * 140) % 120) : 0;

  return (
    <g>
      {/* Track bed + Platform */}
      <rect x="0" y="276" width="480" height="84" fill="#0d171f" />
      <rect x="0" y="276" width="480" height="7" fill="#facc15" />
      <text x="16" y="302" fill="#facc15" fontSize="11" fontWeight="800">
        黄色い線の内側 (Behind Yellow Line)
      </text>

      {/* Platform pillar sign: 3番線 */}
      <g transform="translate(24, 96)">
        <rect x="0" y="0" width="84" height="36" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
        <text x="42" y="16" textAnchor="middle" fill="#38bdf8" fontSize="12" fontWeight="900">
          3番線 快速
        </text>
        <text x="42" y="30" textAnchor="middle" fill="#cbd5e1" fontSize="9.5" fontWeight="700">
          新宿 Shinjuku
        </text>
        <line x1="42" y1="36" x2="42" y2="180" stroke="#334155" strokeWidth="3" />
      </g>

      {/* Speed lines outside train during Beat 2 cruise */}
      {progress >= 0.42 && progress < 0.65 ? (
        <g>
          {[0, 1, 2, 3].map((i) => {
            const lx = ((i * 120 - cruiseScroll + 480) % 480) - 60;
            return (
              <line
                key={i}
                x1={lx}
                y1={98 + (i % 2) * 32}
                x2={lx + 44}
                y2={98 + (i % 2) * 32}
                stroke="#34d399"
                strokeWidth="2.5"
                strokeOpacity="0.45"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      ) : null}

      {/* Commuter Train Car */}
      <g transform={`translate(${trainX}, 136)`}>
        <rect
          x="0"
          y="0"
          width="320"
          height="136"
          rx="14"
          fill="#1e293b"
          stroke="#94a3b8"
          strokeWidth="2.5"
        />
        {/* Iconic JR/Metro emerald band */}
        <rect x="0" y="84" width="320" height="14" fill="#10b981" />
        {/* Headlight & destination LED */}
        <rect x="14" y="14" width="110" height="22" rx="4" fill="#091319" stroke="#34d399" strokeWidth="1.4" />
        <text x="69" y="29" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="900">
          {beatIndex >= 2 ? "快速 · 新宿行" : "各駅 → 快速"}
        </text>

        {/* Train passenger window */}
        <rect x="20" y="44" width="84" height="36" rx="5" fill="#0c1b26" stroke="#64748b" strokeWidth="1.5" />
        <rect x="220" y="44" width="80" height="36" rx="5" fill="#0c1b26" stroke="#64748b" strokeWidth="1.5" />

        {/* Train Center Sliding Doorway (x=126..196) */}
        <rect x="126" y="24" width="70" height="106" rx="4" fill="#071016" stroke="#64748b" strokeWidth="1.5" />
        {/* Stickman visible inside train window/door during Beat 2 */}
        {isInsideTrain ? (
          <g transform="translate(161, 86) scale(0.75)">
            <circle cx="0" cy="-24" r="12" fill="#0b1319" stroke="#f8fafc" strokeWidth="3.5" />
            <path d="M -9 -29 Q 0 -32 9 -29" fill="none" stroke="#34d399" strokeWidth="2.8" />
            <circle cx="4" cy="-24" r="1.5" fill="#f8fafc" />
            <circle cx="8" cy="-24" r="1.3" fill="#f8fafc" />
            <line x1="0" y1="-12" x2="0" y2="18" stroke="#f8fafc" strokeWidth="4.5" strokeLinecap="round" />
          </g>
        ) : null}
        {/* Left & Right Door Leaves */}
        <rect
          x={127 - doorSlide}
          y="25"
          width="33"
          height="104"
          rx="2"
          fill="#263544"
          fillOpacity={0.78}
          stroke="#94a3b8"
          strokeWidth="1.4"
        />
        <rect
          x={162 + doorSlide}
          y="25"
          width="33"
          height="104"
          rx="2"
          fill="#263544"
          fillOpacity={0.78}
          stroke="#94a3b8"
          strokeWidth="1.4"
        />
      </g>

      {/* Japan's standardized bright YELLOW overhead EXIT sign (Beat 3!) */}
      <g
        transform="translate(292, 48)"
        opacity={beatIndex === 3 ? 1 : 0.45}
      >
        <line x1="46" y1="-48" x2="46" y2="0" stroke="#64748b" strokeWidth="2.5" />
        <line x1="126" y1="-48" x2="126" y2="0" stroke="#64748b" strokeWidth="2.5" />
        <rect
          x="0"
          y="0"
          width="172"
          height="46"
          rx="7"
          fill="#facc15"
          stroke="#fef08a"
          strokeWidth="2.2"
        />
        <text x="86" y="21" textAnchor="middle" fill="#090d12" fontSize="15.5" fontWeight="900">
          出口 EXIT →
        </text>
        <text x="86" y="37" textAnchor="middle" fill="#1e293b" fontSize="10.5" fontWeight="800">
          乗り換え Transfer
        </text>
      </g>

      {/* Stickman outside on platform (Beat 1 waiting/boarding, Beat 3 exiting under yellow sign) */}
      {!isInsideTrain ? (
        <StickmanFigure
          x={stickX}
          y={228 - bob}
          facing={1}
          leanDeg={isWalking ? 6 : 0}
          headTiltDeg={beatIndex === 3 ? -10 : 0}
          leftUpperArmDeg={stride * 0.8 - 10}
          leftForearmDeg={stride * 0.5 + 14}
          rightUpperArmDeg={beatIndex === 3 ? 98 : -stride * 0.8 + 16}
          rightForearmDeg={beatIndex === 3 ? 108 : -stride * 0.5 + 26}
          leftThighDeg={-stride}
          leftCalfDeg={-stride * 0.55 - 4}
          rightThighDeg={stride}
          rightCalfDeg={stride * 0.55}
          hasBackpack
          expression={beatIndex === 3 ? "happy" : "focused"}
        />
      ) : null}

      {/* Contextual Japanese Prompts */}
      <SpeechBubble
        x={stickX + 8}
        y={156 - bob}
        text="新宿に行きますか？"
        subtext="Does this go to Shinjuku?"
        opacity={clamp01((progress - 0.04) / 0.08) * (1 - clamp01((progress - 0.3) / 0.06))}
      />
      <SpeechBubble
        x={stickX - 18}
        y={154 - bob}
        text="黄色い出口！ →"
        subtext="Follow yellow EXIT"
        accent="#facc15"
        opacity={clamp01((progress - 0.74) / 0.08)}
      />

      <HudBeatBadge
        beatLabel={beatLabel}
        accent={beatIndex === 3 ? "#facc15" : "#34d399"}
      />
    </g>
  );
};

/**
 * Reusable pure-Remotion animated stickman director component (`480x360` chalkboard stage)
 * synchronized deterministically to `useCurrentFrame()` across each lesson section.
 */
export const StickmanScenePlayer: React.FC<StickmanScenePlayerProps> = ({
  scene,
  sectionStartSec,
  sectionEndSec,
  caption,
  width = 480,
  height = 360,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const localSec = Math.max(0, timeSec - sectionStartSec);
  const sectionDur = Math.max(9, sectionEndSec - sectionStartSec);
  const progress = clamp01(localSec / sectionDur);
  const entryFade = interpolate(localSec, [0, 0.25], [0.88, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        alignSelf: "center",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(54, 242, 174, 0.34)",
        backgroundColor: "#090f14",
        display: "flex",
        flexDirection: "column",
        opacity: entryFade,
      }}
    >
      <div
        style={{
          width: "100%",
          height,
          backgroundColor: "#090f14",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 480 360"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            fontFamily:
              '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
          }}
        >
          {/* Matte chalkboard dot-grid background */}
          <defs>
            <pattern
              id={`board-dots-${scene}`}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="12" cy="12" r="1" fill="rgba(148, 163, 184, 0.14)" />
            </pattern>
          </defs>
          <rect width="480" height="360" fill="#091016" />
          <rect width="480" height="360" fill={`url(#board-dots-${scene})`} />

          {/* Bottom progress bar */}
          <rect x="16" y="346" width="448" height="4" rx="2" fill="rgba(255,255,255,0.08)" />
          <rect
            x="16"
            y="346"
            width={Math.round(448 * progress)}
            height="4"
            rx="2"
            fill="#34d399"
          />

          {scene === "walk_to_station" ? (
            <WalkToStationScene localSec={localSec} progress={progress} />
          ) : scene === "buy_ticket_ic" ? (
            <BuyTicketIcScene localSec={localSec} progress={progress} />
          ) : scene === "tap_ticket_gate" ? (
            <TapTicketGateScene localSec={localSec} progress={progress} />
          ) : (
            <RideAndExitTrainScene localSec={localSec} progress={progress} />
          )}
        </svg>
      </div>
      {caption ? (
        <div
          style={{
            padding: "9px 14px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "#0f171e",
            fontSize: 16,
            fontWeight: 600,
            color: "#b7d9ca",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};
