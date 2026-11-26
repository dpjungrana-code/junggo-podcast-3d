import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EpisodeSection,
  FuriganaToken,
  KanjiLessonData,
  QuizCardData,
  StationGuideData,
  StickmanSceneId,
  StudioMode,
  SubTopicItem,
  SubtitleCue,
  VocabCardData,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";
import { StickmanScenePlayer } from "./StickmanScenePlayer";

const RubyText: React.FC<{
  readonly tokens?: readonly FuriganaToken[];
  readonly fallback: string;
  readonly rtSize?: string;
  readonly rtColor?: string;
}> = ({ tokens, fallback, rtSize = "0.45em", rtColor = "#34d399" }) => {
  if (!tokens || tokens.length === 0) {
    return <>{fallback}</>;
  }
  return (
    <>
      {tokens.map((tok, idx) =>
        tok.furigana ? (
          <ruby key={`rt-${idx}`} style={{ rubyPosition: "over" }}>
            {tok.text}
            <rt
              style={{
                fontSize: rtSize,
                fontWeight: 800,
                color: rtColor,
                lineHeight: 1.05,
                letterSpacing: "0.02em",
              }}
            >
              {tok.furigana}
            </rt>
          </ruby>
        ) : (
          <React.Fragment key={`pl-${idx}`}>{tok.text}</React.Fragment>
        ),
      )}
    </>
  );
};

export type PresentationBoardProps = {
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly studioMode?: StudioMode;
  readonly boardFocusProgress?: number;
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
};

const resolveImageSrc = (src: string): string => {
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  ) {
    return src;
  }
  return staticFile(src.replace(/^\/+/, ""));
};

/**
 * Clean framed visual / kanji diagram card with opaque dark backdrop,
 * `object-contain` sizing, optional caption, and Remotion frame fade-in.
 */
const MediaVisualFrame: React.FC<{
  readonly imageUrl: string;
  readonly caption?: string;
  readonly width?: number | string;
  readonly height?: number;
}> = ({ imageUrl, caption, width = "100%", height = 220 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame % Math.max(12, Math.round(fps * 1000)), [0, 8], [0.92, 1], {
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
        border: "1px solid rgba(54, 242, 174, 0.28)",
        backgroundColor: "#0b1116",
        display: "flex",
        flexDirection: "column",
        opacity: fade,
      }}
    >
      <div
        style={{
          width: "100%",
          height,
          padding: 10,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b1116",
        }}
      >
        <Img
          src={resolveImageSrc(imageUrl)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
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

/**
 * Crisp inline vector bowl of steaming Japanese ramen for the "おいしい" vocab spotlight.
 */
const RamenBowlIllustration: React.FC = () => (
  <svg
    width="156"
    height="156"
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0 }}
  >
    {/* Steam wisps */}
    <path
      d="M54 38 C48 26, 62 20, 56 10"
      stroke="rgba(255,255,255,0.45)"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <path
      d="M78 34 C72 22, 86 16, 80 6"
      stroke="rgba(255,255,255,0.55)"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <path
      d="M102 38 C96 26, 110 20, 104 10"
      stroke="rgba(255,255,255,0.45)"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    {/* Accent sparkle ticks */}
    <path
      d="M126 30 L138 20 M132 42 L146 38"
      stroke="#fbbf24"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    {/* Bowl outer & broth */}
    <path d="M22 86 C22 126, 138 126, 138 86 Z" fill="#e5e9ef" />
    <rect x="52" y="122" width="56" height="10" rx="4" fill="#cbd5e1" />
    <ellipse cx="80" cy="84" rx="58" ry="22" fill="#f8fafc" />
    <ellipse cx="80" cy="85" rx="51" ry="17" fill="#c97a33" />
    {/* Noodles wave */}
    <path
      d="M42 87 Q56 76 70 87 T98 87 T118 85"
      stroke="#f6d57a"
      strokeWidth="5"
      strokeLinecap="round"
    />
    {/* Boiled egg half */}
    <ellipse cx="102" cy="76" rx="14" ry="10" fill="#ffffff" />
    <ellipse cx="102" cy="76" rx="7" ry="5.5" fill="#f59e0b" />
    {/* Narutomaki fishcake */}
    <circle cx="62" cy="77" r="9.5" fill="#fff5f5" />
    <path
      d="M62 77 C64 74, 67 77, 64 80 C60 82, 57 77, 61 73"
      stroke="#f43f5e"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    {/* Green nori / scallion garnish */}
    <circle cx="80" cy="88" r="3.5" fill="#22c55e" />
    <circle cx="89" cy="89" r="3" fill="#16a34a" />
  </svg>
);

const AudioWaveIcon: React.FC = () => (
  <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
    <rect x="1" y="6" width="2.4" height="4" rx="1.2" fill="#36f2ae" />
    <rect x="5" y="3" width="2.4" height="10" rx="1.2" fill="#36f2ae" />
    <rect x="9" y="1" width="2.4" height="14" rx="1.2" fill="#36f2ae" />
    <rect x="13" y="4" width="2.4" height="8" rx="1.2" fill="#36f2ae" />
    <rect x="17" y="6" width="2.4" height="4" rx="1.2" fill="#36f2ae" />
  </svg>
);

const VocabBoardContent: React.FC<{
  readonly vocab: VocabCardData;
  readonly sectionLabel: string;
  readonly visualUrl?: string;
  readonly visualCaption?: string;
  readonly animationScene?: StickmanSceneId;
  readonly sectionStartSec?: number;
  readonly sectionEndSec?: number;
}> = ({
  vocab,
  sectionLabel,
  visualUrl,
  visualCaption,
  animationScene,
  sectionStartSec = 0,
  sectionEndSec = 15,
}) => {
  const mediaUrl = visualUrl ?? vocab.imageUrl ?? vocab.imageSrc;
  const mediaCaption = visualCaption ?? vocab.imageCaption;
  const activeScene = animationScene ?? vocab.animationScene;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "8px 20px",
              borderRadius: 999,
            }}
          >
            {vocab.jlptLevel}
          </span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#98c8b6",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "7px 18px",
              borderRadius: 999,
            }}
          >
            {vocab.partOfSpeech}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AudioWaveIcon />
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#e2f5ec",
            }}
          >
            {sectionLabel === "VOCABULARY"
              ? "Vocabulary Spotlight"
              : `${sectionLabel} Spotlight`}
          </span>
        </div>
      </div>

      {/* Main Word + Illustration */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 28,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div
              style={{
                fontSize: 92,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.05,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {vocab.word}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.55)",
                whiteSpace: "nowrap",
              }}
            >
              {vocab.reading}
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 26,
                fontWeight: 800,
                color: "#ffffff",
                backgroundColor: "#179658",
                padding: "8px 26px",
                borderRadius: 999,
              }}
            >
              {vocab.romaji}
            </span>
          </div>

          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            {vocab.meaning}
          </div>
        </div>

        {activeScene ? (
          <StickmanScenePlayer
            scene={activeScene}
            sectionStartSec={sectionStartSec}
            sectionEndSec={sectionEndSec}
            caption={mediaCaption}
            width={420}
            height={315}
          />
        ) : mediaUrl ? (
          <MediaVisualFrame
            imageUrl={mediaUrl}
            caption={mediaCaption}
            width={420}
            height={315}
          />
        ) : (
          <RamenBowlIllustration />
        )}
      </div>

      <div
        style={{
          height: 1,
          backgroundColor: "rgba(54, 242, 174, 0.24)",
        }}
      />

      {/* Example Sentence Box */}
      <div
        style={{
          backgroundColor: "#0d141a",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: "20px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.3,
          }}
        >
          {vocab.exampleJp}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#36f2ae",
          }}
        >
          {vocab.exampleRomaji}
        </div>
        <div
          style={{
            fontSize: 23,
            fontWeight: 500,
            color: "#d1dce6",
          }}
        >
          {vocab.exampleEn}
        </div>
      </div>
    </div>
  );
};

const QuizBoardContent: React.FC<{
  readonly quiz: QuizCardData;
  readonly timeSec: number;
}> = ({ quiz, timeSec }) => {
  const revealed = timeSec >= quiz.revealSec;
  const correctOpt = quiz.options.find((opt) => opt.isCorrect);
  const revealSummary = correctOpt
    ? `${correctOpt.label} — ${correctOpt.jp} (${correctOpt.romaji}) = ${correctOpt.english}!`
    : "CORRECT ANSWER!";

  const totalDur = Math.max(0.5, quiz.countdownDurationSec || 5);
  const remainingSec = Math.max(0, quiz.revealSec - timeSec);
  const countdownStarted = timeSec >= quiz.countdownStartSec;
  const remainingFraction = revealed
    ? 0
    : countdownStarted
      ? Math.max(0, Math.min(1, remainingSec / totalDur))
      : 1;

  // Integer countdown 5 -> 4 -> 3 -> 2 -> 1
  const countNum = revealed
    ? 0
    : countdownStarted
      ? Math.max(1, Math.min(5, Math.ceil(remainingSec)))
      : 5;

  // Per-second subtle pulse when counting down
  const secFrac = countdownStarted && !revealed ? remainingSec - Math.floor(remainingSec) : 0;
  const tickPulse =
    countdownStarted && !revealed
      ? 1 + Math.sin(secFrac * Math.PI) * 0.08
      : 1;

  const ringColor = revealed
    ? "#34d399"
    : countNum >= 4
      ? "#34d399"
      : countNum >= 2
        ? "#fbbf24"
        : "#f43f5e";

  const ringRadius = 68;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - remainingFraction);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        gap: 18,
      }}
    >
      {/* Top Badge Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.05em",
            color: "#ffffff",
            backgroundColor: revealed ? "#148c53" : "#5b21b6",
            padding: "8px 22px",
            borderRadius: 999,
          }}
        >
          {revealed ? "CORRECT ANSWER!" : quiz.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#b6d8cb" }}>
            5-Second Listening Quiz
          </span>
        </div>
      </div>

      {/* Question + Glowing Circular 5-Second SVG Countdown Timer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 28,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.52,
            }}
          >
            <RubyText
              tokens={quiz.questionTokens}
              fallback={quiz.questionJp}
              rtSize="0.4em"
              rtColor="#c4b5fd"
            />
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "#c4b5fd",
              marginTop: 8,
            }}
          >
            {quiz.questionEn}
          </div>
        </div>

        {/* Circular SVG Countdown Ring */}
        <div
          style={{
            position: "relative",
            width: 172,
            height: 172,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: tickPulse,
          }}
        >
          <svg width="172" height="172" viewBox="0 0 172 172">
            <circle
              cx="86"
              cy="86"
              r={ringRadius}
              fill="rgba(11, 17, 24, 0.9)"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="12"
            />
            <circle
              cx="86"
              cy="86"
              r={ringRadius}
              fill="none"
              stroke={ringColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={revealed ? 0 : ringOffset}
              transform="rotate(-90 86 86)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: revealed ? 56 : 64,
                fontWeight: 900,
                color: ringColor,
                lineHeight: 1,
                textShadow: `0 0 22px ${ringColor}66`,
              }}
            >
              {revealed ? "✓" : countNum}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "#cbd5e1",
                marginTop: 4,
              }}
            >
              {revealed ? "ANSWER" : "SECONDS"}
            </span>
          </div>
        </div>
      </div>

      {/* 2x2 Grid of Interactive A/B/C/D Answer Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: quiz.options.length >= 4 ? "1fr 1fr" : "1fr",
          gap: 16,
        }}
      >
        {quiz.options.map((opt) => {
          const isHit = revealed && opt.isCorrect;
          const isDimmed = revealed && !opt.isCorrect;
          return (
            <div
              key={opt.label}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 6,
                padding: "18px 22px",
                borderRadius: 16,
                backgroundColor: isHit
                  ? "rgba(20, 140, 83, 0.42)"
                  : isDimmed
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(255, 255, 255, 0.07)",
                border: isHit
                  ? "3px solid #34d399"
                  : isDimmed
                    ? "1px solid rgba(255, 255, 255, 0.06)"
                    : "1.5px solid rgba(196, 181, 253, 0.28)",
                boxShadow: isHit ? "0 0 28px rgba(52, 211, 153, 0.35)" : "none",
                opacity: isDimmed ? 0.42 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 21,
                      fontWeight: 900,
                      flexShrink: 0,
                      backgroundColor: isHit ? "#34d399" : "#5b21b6",
                      color: isHit ? "#082419" : "#ffffff",
                    }}
                  >
                    {opt.label}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#ffffff" }}>
                    {opt.english}
                  </span>
                </div>
                {isHit ? (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#06291b",
                      backgroundColor: "#34d399",
                      padding: "4px 12px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    ✓ CORRECT
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isHit ? "#a7f3d0" : "#cbd5e1",
                  paddingLeft: 54,
                  lineHeight: 1.55,
                }}
              >
                <RubyText
                  tokens={opt.jpTokens}
                  fallback={opt.jp}
                  rtSize="0.46em"
                  rtColor={isHit ? "#7cf5c4" : "#93c5fd"}
                />{" "}
                <span style={{ fontSize: 16, fontWeight: 600, color: "#94a3b8" }}>
                  ({opt.romaji})
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Reveal Banner */}
      <div
        style={{
          padding: "10px 18px",
          borderRadius: 12,
          backgroundColor: revealed ? "rgba(20, 140, 83, 0.25)" : "rgba(12, 17, 22, 0.85)",
          border: revealed
            ? "1.5px solid rgba(52, 211, 153, 0.55)"
            : "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: 18,
          fontWeight: 700,
          color: revealed ? "#7cf5c4" : "#fde68a",
          textAlign: "center",
        }}
      >
        {revealed ? `✓ ${revealSummary}` : `Think fast! Answer reveals in ${countNum}s...`}
      </div>
    </div>
  );
};

/**
 * Dedicated `kanji_lesson` spotlight card: large Kanji box with 十字リーダー
 * stroke-guide crosshairs, On/Kun reading pills, English + Nepali meanings,
 * mnemonic tip, auto-generated illustration slot, and 2 example compounds.
 */
const KanjiLessonBoardContent: React.FC<{
  readonly kanji: KanjiLessonData;
  readonly sectionStartFrame: number;
  readonly visualUrl?: string;
  readonly visualCaption?: string;
  readonly animationScene?: StickmanSceneId;
  readonly sectionStartSec?: number;
  readonly sectionEndSec?: number;
}> = ({
  kanji,
  sectionStartFrame,
  visualUrl,
  visualCaption,
  animationScene,
  sectionStartSec = 0,
  sectionEndSec = 15,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mediaUrl = visualUrl ?? kanji.imageUrl;
  const mediaCaption = visualCaption ?? kanji.imageCaption;
  const activeScene = animationScene ?? kanji.animationScene;

  const kanjiScale = interpolate(
    frame,
    [sectionStartFrame, sectionStartFrame + Math.max(8, Math.round(0.32 * fps))],
    [0.93, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "5px 15px",
              borderRadius: 999,
            }}
          >
            {kanji.jlptLevel}
          </span>
          {kanji.strokeCount ? (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#98c8b6",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                padding: "5px 12px",
                borderRadius: 999,
              }}
            >
              {kanji.strokeCount} Strokes
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e2f5ec" }}>
            Kanji Spotlight
          </span>
        </div>
      </div>

      {/* Hero Row: Calligraphy Box + Readings/Meaning/Mnemonic + Optional Vector Visual */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 14,
        }}
      >
        {/* Crisp Kanji Calligraphy Box with 十字リーダー Stroke Guides */}
        <div
          style={{
            position: "relative",
            width: 148,
            height: 148,
            flexShrink: 0,
            borderRadius: 14,
            backgroundColor: "#0b1116",
            border: "2px solid rgba(54, 242, 174, 0.48)",
            boxShadow: "inset 0 0 24px rgba(54, 242, 174, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <svg
            width="148"
            height="148"
            viewBox="0 0 148 148"
            style={{ position: "absolute", inset: 0 }}
          >
            <line
              x1="0"
              y1="0"
              x2="148"
              y2="148"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="148"
              y1="0"
              x2="0"
              y2="148"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="74"
              y1="4"
              x2="74"
              y2="144"
              stroke="rgba(54, 242, 174, 0.34)"
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
            <line
              x1="4"
              y1="74"
              x2="144"
              y2="74"
              stroke="rgba(54, 242, 174, 0.34)"
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
          </svg>
          <span
            style={{
              position: "relative",
              fontSize: 94,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1,
              scale: kanjiScale,
            }}
          >
            {kanji.kanji}
          </span>
        </div>

        {/* Center Info Column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 7,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 23,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.15,
              }}
            >
              {kanji.meaningEn}
            </div>
          </div>

          {/* On-yomi & Kun-yomi Reading Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#0d141a",
                border: "1px solid rgba(96, 165, 250, 0.35)",
                borderRadius: 8,
                padding: "3px 8px",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: "#ffffff",
                  backgroundColor: "#1d4ed8",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                音 ON
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#dbeafe" }}>
                {kanji.onyomi}
              </span>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#0d141a",
                border: "1px solid rgba(54, 242, 174, 0.35)",
                borderRadius: 8,
                padding: "3px 8px",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: "#ffffff",
                  backgroundColor: "#148c53",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                訓 KUN
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#bbf7d0" }}>
                {kanji.kunyomi}
              </span>
            </div>
          </div>

          {/* Mnemonic Memory Tip Box */}
          <div
            style={{
              backgroundColor: "#0d141a",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderLeft: "3px solid #f59e0b",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              color: "#d6e6df",
              lineHeight: 1.32,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: "#fbbf24",
                marginRight: 6,
              }}
            >
              TIP
            </span>
            {kanji.mnemonic}
          </div>
        </div>

        {/* Auto-Generated Illustration or Animated Stickman Slot */}
        {activeScene ? (
          <StickmanScenePlayer
            scene={activeScene}
            sectionStartSec={sectionStartSec}
            sectionEndSec={sectionEndSec}
            caption={mediaCaption}
            width={196}
            height={146}
          />
        ) : mediaUrl ? (
          <MediaVisualFrame
            imageUrl={mediaUrl}
            caption={mediaCaption}
            width={118}
            height={146}
          />
        ) : null}
      </div>

      <div
        style={{
          height: 1,
          backgroundColor: "rgba(54, 242, 174, 0.22)",
        }}
      />

      {/* 2 Example Words Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {kanji.examples.slice(0, 2).map((ex) => (
          <div
            key={`${ex.word}-${ex.romaji}`}
            style={{
              backgroundColor: "#0d141a",
              border: "1px solid rgba(54, 242, 174, 0.22)",
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#ffffff" }}>
                {ex.word}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#36f2ae" }}>
                {ex.reading}
              </span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#94a3b8" }}>
              {ex.romaji}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
              {ex.meaning}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const synthesizeFallbackSubTopics = (
  guide: StationGuideData,
): readonly SubTopicItem[] => {
  if (guide.subTopics && guide.subTopics.length > 0) {
    return guide.subTopics;
  }
  return guide.terms.slice(0, 4).map((term, idx) => ({
    id: `term-${idx}`,
    pillLabel: `${term.jp} ${term.meaningEn.split("(")[0].trim()}`,
    jp: term.jp,
    reading: term.reading,
    romaji: term.romaji,
    meaningEn: term.meaningEn,
    exampleJp: guide.keyPhraseJp,
    exampleRomaji: guide.keyPhraseRomaji,
    exampleEn: guide.keyPhraseEn,
    accentColor: term.badgeColor ?? "#34d399",
  }));
};

const resolveActiveSubTopicState = (
  subTopics: readonly SubTopicItem[],
  activeCue: SubtitleCue | null,
  sectionStartSec: number,
  sectionEndSec: number,
  timeSec: number,
): {
  readonly index: number;
  readonly topic: SubTopicItem;
  readonly switchSec: number;
} => {
  const count = Math.max(1, subTopics.length);
  let resolvedIdx = 0;
  let switchSec = sectionStartSec;

  if (activeCue?.subTopicSwitches && activeCue.subTopicSwitches.length > 0) {
    const sorted = [...activeCue.subTopicSwitches].sort(
      (a, b) => a.timeSec - b.timeSec,
    );
    resolvedIdx = Math.max(0, Math.min(count - 1, sorted[0].subTopicIndex));
    switchSec = sorted[0].timeSec;
    for (const sw of sorted) {
      if (timeSec >= sw.timeSec) {
        resolvedIdx = Math.max(0, Math.min(count - 1, sw.subTopicIndex));
        switchSec = sw.timeSec;
      }
    }
  } else if (typeof activeCue?.activeSubTopicIndex === "number") {
    resolvedIdx = Math.max(0, Math.min(count - 1, activeCue.activeSubTopicIndex));
    switchSec = activeCue.startSec;
  } else if (activeCue?.activeSubTopic) {
    const target = activeCue.activeSubTopic.trim().toLowerCase();
    const matched = subTopics.findIndex(
      (t) =>
        t.id.toLowerCase() === target ||
        t.jp.toLowerCase() === target ||
        (t.highlightKey ?? "").toLowerCase() === target,
    );
    if (matched >= 0) {
      resolvedIdx = matched;
      switchSec = activeCue.startSec;
    }
  } else {
    const dur = Math.max(4, sectionEndSec - sectionStartSec);
    const frac = Math.max(0, Math.min(0.999, (timeSec - sectionStartSec) / dur));
    resolvedIdx = Math.min(count - 1, Math.floor(frac * count));
    switchSec = sectionStartSec + (resolvedIdx * dur) / count;
  }

  return {
    index: resolvedIdx,
    topic: subTopics[resolvedIdx],
    switchSec,
  };
};

/**
 * Uncluttered, single-topic focused Station Survival Guide layout:
 * - Compact Header + Top Sub-Topic Pill Bar (highlights ONLY the active sub-topic)
 * - Left Focus Column (~43%): Huge Kanji, Furigana, Romaji, English & 1 Survival Example
 * - Right Animated Stage (~57%): Colorful layered 2.5D animated world synced to active sub-topic
 */
const StationGuideBoardContent: React.FC<{
  readonly guide: StationGuideData;
  readonly visualUrl?: string;
  readonly visualCaption?: string;
  readonly animationScene?: StickmanSceneId;
  readonly sectionStartSec: number;
  readonly sectionEndSec: number;
  readonly activeCue: SubtitleCue | null;
  readonly timeSec: number;
}> = ({
  guide,
  visualUrl,
  visualCaption,
  animationScene,
  sectionStartSec,
  sectionEndSec,
  activeCue,
  timeSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mediaUrl = visualUrl ?? guide.imageUrl;
  const mediaCaption = visualCaption ?? guide.imageCaption;
  const activeScene = animationScene ?? guide.animationScene;

  const subTopics = synthesizeFallbackSubTopics(guide);
  const {
    index: activeIdx,
    topic: activeTopic,
    switchSec,
  } = resolveActiveSubTopicState(
    subTopics,
    activeCue,
    sectionStartSec,
    sectionEndSec,
    timeSec,
  );

  const switchFrame = Math.round(switchSec * fps);
  const localFrames = Math.max(0, frame - switchFrame);
  const focusPop = spring({
    frame: localFrames,
    fps,
    config: { damping: 16, stiffness: 150, mass: 0.75 },
  });
  const cardFade = interpolate(localFrames, [0, 7], [0.55, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardSlideY = interpolate(localFrames, [0, 8], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const accent = activeTopic.accentColor ?? "#34d399";
  const jpLen = activeTopic.jp.length;
  const jpFontSize = jpLen >= 8 ? 34 : jpLen >= 5 ? 42 : jpLen >= 4 ? 48 : 54;
  const activeVisualBeat = activeCue?.visualBeat ?? activeTopic.visualBeat;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        gap: 11,
      }}
    >
      {/* Compact Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "5px 15px",
              borderRadius: 999,
            }}
          >
            {guide.jlptLevel}
          </span>
          <span
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: "#98c8b6",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "5px 14px",
              borderRadius: 999,
            }}
          >
            {guide.sceneTag}
          </span>
          <span style={{ fontSize: 18.5, fontWeight: 800, color: "#e2f5ec", marginLeft: 4 }}>
            {guide.titleJp} · <span style={{ color: "#34d399" }}>{guide.titleEn}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 15.5, fontWeight: 700, color: "#b7d9ca" }}>
            2.5D Visual Lesson
          </span>
        </div>
      </div>

      {/* Top Sub-Topic Pill Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 12,
          backgroundColor: "rgba(10, 17, 23, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {subTopics.map((item, idx) => {
          const isActive = idx === activeIdx;
          const pillAccent = item.accentColor ?? "#34d399";
          const pillScale = isActive ? 1 + (1 - focusPop) * 0.015 + focusPop * 0.02 : 1;
          return (
            <div
              key={item.id}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                padding: "8px 12px",
                borderRadius: 9,
                backgroundColor: isActive
                  ? "rgba(20, 140, 83, 0.36)"
                  : "rgba(255, 255, 255, 0.03)",
                border: isActive
                  ? `2px solid ${pillAccent}`
                  : "1px solid rgba(255, 255, 255, 0.07)",
                boxShadow: isActive ? `0 0 16px ${pillAccent}44` : "none",
                color: isActive ? "#ffffff" : "#7b93a3",
                fontSize: 16.5,
                fontWeight: isActive ? 900 : 600,
                opacity: isActive ? 1 : 0.6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                scale: pillScale,
              }}
            >
              {isActive ? "● " : ""}
              {item.pillLabel}
            </div>
          );
        })}
      </div>

      {/* Compact Single-Topic Header Strip (~105px height -> leaving ~72% for 2.5D World!) */}
      <div
        key={activeTopic.id}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "10px 18px",
          borderRadius: 14,
          backgroundColor: "rgba(12, 20, 27, 0.85)",
          border: `1.5px solid ${accent}44`,
          opacity: cardFade,
          translate: `0px ${cardSlideY}px`,
        }}
      >
        {/* Active Kanji + Furigana + Romaji + English Meaning */}
        <div
          style={{
            flex: "0 0 46%",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: jpFontSize,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.45,
              whiteSpace: "nowrap",
            }}
          >
            <RubyText
              tokens={activeTopic.jpTokens}
              fallback={activeTopic.jp}
              rtSize="0.34em"
              rtColor={accent}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span
              style={{
                display: "inline-block",
                alignSelf: "flex-start",
                fontSize: 16.5,
                fontWeight: 700,
                color: "#e2f5ec",
                backgroundColor: "rgba(52, 211, 153, 0.14)",
                border: `1px solid ${accent}55`,
                padding: "3px 13px",
                borderRadius: 999,
              }}
            >
              {activeTopic.romaji}
            </span>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#f8fafc",
                lineHeight: 1.2,
                maxWidth: 260,
              }}
            >
              {activeTopic.meaningEn}
            </div>
          </div>
        </div>

        {/* 1 Concise Survival Example with Inline Ruby Furigana */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            borderLeft: `4px solid ${accent}`,
            paddingLeft: 16,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 21,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.6,
            }}
          >
            <RubyText
              tokens={activeTopic.exampleTokens}
              fallback={activeTopic.exampleJp}
              rtSize="0.46em"
              rtColor={accent}
            />
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: accent }}>
            {activeTopic.exampleRomaji} —{" "}
            <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{activeTopic.exampleEn}</span>
          </div>
        </div>
      </div>

      {/* GIANT ~72% Area Real-Japan 2.5D Toon-3D Animated Stage */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch" }}>
        {activeScene ? (
          <StickmanScenePlayer
            scene={activeScene}
            sectionStartSec={sectionStartSec}
            sectionEndSec={sectionEndSec}
            activeSubTopicKey={activeTopic.highlightKey ?? activeTopic.id}
            activeSubTopicLabel={activeTopic.pillLabel}
            visualBeat={activeVisualBeat}
            width="100%"
            height={480}
          />
        ) : mediaUrl ? (
          <MediaVisualFrame
            imageUrl={mediaUrl}
            caption={mediaCaption}
            width="100%"
            height={480}
          />
        ) : null}
      </div>
    </div>
  );
};

const OverviewBoardContent: React.FC<{
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly activeSection: EpisodeSection;
  readonly featuredVocab?: VocabCardData;
  readonly kanjiList: readonly KanjiLessonData[];
  readonly stationGuides: readonly StationGuideData[];
  readonly activeCue: SubtitleCue | null;
  readonly visualUrl?: string;
  readonly visualCaption?: string;
  readonly animationScene?: StickmanSceneId;
  readonly sectionStartSec: number;
  readonly sectionEndSec: number;
}> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  activeSection,
  featuredVocab,
  kanjiList,
  stationGuides,
  activeCue,
  visualUrl,
  visualCaption,
  animationScene,
  sectionStartSec,
  sectionEndSec,
}) => {
  const isDialogue = activeSection.type === "dialogue";
  const hasVisual = Boolean(animationScene || visualUrl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "8px 20px",
              borderRadius: 999,
            }}
          >
            {jlptLevel}
          </span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#a5c9ba",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "7px 18px",
              borderRadius: 999,
            }}
          >
            {episodeNumber}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 19, fontWeight: 700, color: "#e2f5ec" }}>
            {hasVisual && !isDialogue
              ? "Visual Guide"
              : isDialogue
                ? activeSection.label || "Station Roleplay"
                : "Today's Lesson"}
          </span>
        </div>
      </div>

      {isDialogue && activeCue ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            height: "100%",
          }}
        >
          <div
            style={{
              backgroundColor: "#0d141a",
              border: "1px solid rgba(251, 191, 36, 0.32)",
              borderRadius: 15,
              padding: "14px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  padding: "6px 15px",
                  borderRadius: 8,
                  flexShrink: 0,
                  backgroundColor: isGuestSpeaker(activeCue.speaker)
                    ? "#f59e0b"
                    : "#148c53",
                  color: isGuestSpeaker(activeCue.speaker) ? "#1f1402" : "#ffffff",
                }}
              >
                {activeCue.speaker}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: "#ffffff",
                    lineHeight: 1.58,
                  }}
                >
                  <RubyText
                    tokens={activeCue.furiganaTokens}
                    fallback={activeCue.japanese}
                    rtSize="0.45em"
                    rtColor="#34d399"
                  />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#fde68a" }}>
                  {activeCue.romaji} —{" "}
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
                    {activeCue.english}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {animationScene ? (
            <StickmanScenePlayer
              scene={animationScene}
              sectionStartSec={sectionStartSec}
              sectionEndSec={sectionEndSec}
              visualBeat={activeCue.visualBeat}
              activeSubTopicLabel={activeSection.label}
              caption={visualCaption}
              width="100%"
              height={460}
            />
          ) : visualUrl ? (
            <MediaVisualFrame
              imageUrl={visualUrl}
              caption={visualCaption}
              width="100%"
              height={460}
            />
          ) : null}
        </div>
      ) : hasVisual ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            {episodeTitle}
          </div>
          {animationScene ? (
            <StickmanScenePlayer
              scene={animationScene}
              sectionStartSec={sectionStartSec}
              sectionEndSec={sectionEndSec}
              visualBeat={activeCue?.visualBeat ?? activeSection.visualBeat}
              activeSubTopicLabel={activeSection.label}
              caption={visualCaption}
              width="100%"
              height={460}
            />
          ) : visualUrl ? (
            <MediaVisualFrame
              imageUrl={visualUrl}
              caption={visualCaption}
              width="100%"
              height={230}
            />
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.12,
            }}
          >
            {episodeTitle}
          </div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#b6c5d4" }}>
            Step-by-step {jlptLevel} Japanese podcast lesson with Sensei & Maria.
          </div>
        </div>
      )}

      {!hasVisual && stationGuides.length > 0 ? (
        <div
          style={{
            backgroundColor: "#0d141a",
            border: "1px solid rgba(52, 211, 153, 0.25)",
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#34d399",
            }}
          >
            STATION SURVIVAL ROADMAP ({stationGuides.length} SCENES)
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {stationGuides.slice(0, 5).map((item, idx) => (
              <div
                key={`${item.sceneTag}-${idx}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  backgroundColor: "#121b22",
                  border: "1px solid rgba(52, 211, 153, 0.22)",
                  borderRadius: 10,
                  padding: "9px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 900, color: "#ffffff", textAlign: "center" }}>
                  {item.titleJp.split("・")[0]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#98c8b6",
                    textAlign: "center",
                    lineHeight: 1.15,
                  }}
                >
                  {item.titleEn.split("&")[0].trim()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : !hasVisual && kanjiList.length > 0 ? (
        <div
          style={{
            backgroundColor: "#0d141a",
            border: "1px solid rgba(54, 242, 174, 0.25)",
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#36f2ae",
            }}
          >
            TODAY&apos;S TARGET KANJI ({kanjiList.length})
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {kanjiList.slice(0, 5).map((item) => (
              <div
                key={item.kanji}
                style={{
                  flex: 1,
                  minWidth: 0,
                  backgroundColor: "#121b22",
                  border: "1px solid rgba(54, 242, 174, 0.22)",
                  borderRadius: 10,
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 32, fontWeight: 900, color: "#ffffff" }}>
                  {item.kanji}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#98c8b6",
                    textAlign: "center",
                    lineHeight: 1.15,
                  }}
                >
                  {item.meaningEn.split("/")[0].trim()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : !hasVisual && featuredVocab ? (
        <div
          style={{
            backgroundColor: "#0d141a",
            border: "1px solid rgba(54, 242, 174, 0.25)",
            borderRadius: 14,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#36f2ae",
                marginBottom: 4,
              }}
            >
              KEY WORD IN THIS EPISODE
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, color: "#ffffff" }}>
              {featuredVocab.word}{" "}
              <span
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.55)",
                }}
              >
                ({featuredVocab.reading})
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#36f2ae" }}>
              {featuredVocab.romaji}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#ffffff" }}>
              {featuredVocab.meaning}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const findSectionForTime = (
  sections: readonly EpisodeSection[],
  timeSec: number,
): EpisodeSection | undefined => {
  for (const section of sections) {
    if (timeSec >= section.startSec && timeSec < section.endSec) {
      return section;
    }
  }
  return sections[sections.length - 1];
};

/**
 * Computes a smooth 0..1 Remotion `spring()` zoom-in focus factor whenever
 * either Sensei or Maria triggers `point_board` (explicitly or via keywords).
 */
const computeBoardZoomProgress = (
  frame: number,
  fps: number,
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[],
): number => {
  const rawWindows: [number, number][] = [];
  for (const cue of subtitles) {
    const midSec = (cue.startSec + cue.endSec) * 0.5;
    const sec = findSectionForTime(sections, midSec);
    const triggersZoom =
      resolveCueGesture(cue, sec, false) === "point_board" ||
      resolveCueGesture(cue, sec, true) === "point_board";
    if (triggersZoom) {
      rawWindows.push([cue.startSec, cue.endSec]);
    }
  }

  if (rawWindows.length === 0) {
    return 0;
  }

  // Merge adjacent/consecutive board-focus cues so zoom stays rock-steady
  const merged: [number, number][] = [];
  for (const [start, end] of rawWindows) {
    const prev = merged[merged.length - 1];
    if (prev && start - prev[1] <= 0.65) {
      prev[1] = Math.max(prev[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  let maxZoom = 0;
  for (const [startSec, endSec] of merged) {
    const startFrame = Math.round(startSec * fps);
    const endFrame = Math.round(endSec * fps);
    if (frame < startFrame - 1 || frame > endFrame + Math.round(fps * 1.2)) {
      continue;
    }
    const enter = spring({
      frame: Math.max(0, frame - startFrame),
      fps,
      config: { damping: 16, stiffness: 130, mass: 0.85 },
    });
    const exit =
      frame >= endFrame
        ? 1 -
          spring({
            frame: frame - endFrame,
            fps,
            config: { damping: 18, stiffness: 120, mass: 0.9 },
          })
        : 1;
    maxZoom = Math.max(maxZoom, Math.min(enter, exit));
  }

  return Math.max(0, Math.min(1, maxZoom));
};

/**
 * Giant 2K/4K-sharp Content Blackboard matching the upper-right/center wireframe
 * layout (~1320x794px at 1080p) with subtle `point_board` emerald emphasis.
 */
export const PresentationBoard: React.FC<PresentationBoardProps> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  studioMode = "solo",
  boardFocusProgress = 1,
  sections,
  subtitles,
}) => {
  void studioMode;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  if (boardFocusProgress <= 0.01) {
    return null;
  }

  const pointPulse = computeBoardZoomProgress(frame, fps, sections, subtitles);
  const boardScale =
    interpolate(boardFocusProgress, [0, 1], [0.95, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    (1 + pointPulse * 0.014);

  const activeSection = getActiveSection(sections, timeSec);
  const activeCue = getActiveSubtitle(subtitles, timeSec);
  const featuredVocab = sections.find((s) => s.vocab)?.vocab;
  const kanjiList = sections
    .map((s) => s.kanji)
    .filter((k): k is KanjiLessonData => Boolean(k));
  const stationGuides = sections
    .map((s) => s.stationGuide)
    .filter((g): g is StationGuideData => Boolean(g));
  const activeVisualUrl =
    activeCue?.imageUrl ??
    activeSection.stationGuide?.imageUrl ??
    activeSection.kanji?.imageUrl ??
    activeSection.vocab?.imageUrl ??
    activeSection.vocab?.imageSrc ??
    activeSection.imageUrl ??
    activeSection.imageSrc;
  const activeVisualCaption =
    activeCue?.imageCaption ??
    activeSection.stationGuide?.imageCaption ??
    activeSection.kanji?.imageCaption ??
    activeSection.vocab?.imageCaption ??
    activeSection.imageCaption;
  const activeAnimationScene =
    activeCue?.animationScene ??
    activeSection.stationGuide?.animationScene ??
    activeSection.kanji?.animationScene ??
    activeSection.vocab?.animationScene ??
    activeSection.animationScene;

  const fadeFrames = Math.max(6, Math.round(0.32 * fps));
  const sectionStartFrame = Math.round(activeSection.startSec * fps);
  const sectionEndFrame = Math.round(activeSection.endSec * fps);

  const contentOpacity = Math.min(
    interpolate(frame, [sectionStartFrame, sectionStartFrame + fadeFrames], [0.2, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
    interpolate(frame, [sectionEndFrame - fadeFrames, sectionEndFrame], [1, 0.2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    }),
  );

  const contentOffsetY = interpolate(
    frame,
    [sectionStartFrame, sectionStartFrame + fadeFrames],
    [8, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        fontFamily:
          '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 40,
          width: 1320,
          height: 794,
          background: "linear-gradient(160deg, #13202a 0%, #0c141b 100%)",
          borderRadius: 22,
          border: `3px solid ${pointPulse > 0.05 ? "#34d399" : "#2ee8a5"}`,
          boxShadow:
            pointPulse > 0.05
              ? `0 0 0 6px #162028, 0 0 ${Math.round(38 * pointPulse)}px rgba(52, 211, 153, ${(0.36 * pointPulse).toFixed(2)}), 0 26px 64px rgba(0, 0, 0, 0.65)`
              : "0 0 0 6px #162028, 0 24px 56px rgba(0, 0, 0, 0.58)",
          padding: "34px 42px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          transformOrigin: "center center",
          opacity: boardFocusProgress,
          scale: boardScale,
        }}
      >
        <div
          key={activeSection.id}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            opacity: contentOpacity,
            translate: `0px ${contentOffsetY}px`,
          }}
        >
          {(activeSection.type === "station_guide" ||
            Boolean(activeSection.stationGuide)) &&
          activeSection.stationGuide ? (
            <StationGuideBoardContent
              guide={activeSection.stationGuide}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
              animationScene={activeAnimationScene}
              sectionStartSec={activeSection.startSec}
              sectionEndSec={activeSection.endSec}
              activeCue={activeCue}
              timeSec={timeSec}
            />
          ) : (activeSection.type === "kanji_lesson" ||
              Boolean(activeSection.kanji)) &&
            activeSection.kanji ? (
            <KanjiLessonBoardContent
              kanji={activeSection.kanji}
              sectionStartFrame={sectionStartFrame}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
              animationScene={activeAnimationScene}
              sectionStartSec={activeSection.startSec}
              sectionEndSec={activeSection.endSec}
            />
          ) : (activeSection.type === "vocabulary" ||
              activeSection.type === "grammar") &&
            activeSection.vocab ? (
            <VocabBoardContent
              vocab={activeSection.vocab}
              sectionLabel={activeSection.label}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
              animationScene={activeAnimationScene}
              sectionStartSec={activeSection.startSec}
              sectionEndSec={activeSection.endSec}
            />
          ) : activeSection.type === "quiz" && activeSection.quiz ? (
            <QuizBoardContent quiz={activeSection.quiz} timeSec={timeSec} />
          ) : (
            <OverviewBoardContent
              episodeNumber={episodeNumber}
              episodeTitle={episodeTitle}
              jlptLevel={jlptLevel}
              activeSection={activeSection}
              featuredVocab={featuredVocab}
              kanjiList={kanjiList}
              stationGuides={stationGuides}
              activeCue={activeCue}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
              animationScene={activeAnimationScene}
              sectionStartSec={activeSection.startSec}
              sectionEndSec={activeSection.endSec}
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
