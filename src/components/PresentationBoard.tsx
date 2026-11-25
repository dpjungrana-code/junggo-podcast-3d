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
  KanjiLessonData,
  QuizCardData,
  StationGuideData,
  StudioMode,
  SubtitleCue,
  VocabCardData,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";

export type PresentationBoardProps = {
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly studioMode?: StudioMode;
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
            padding: "6px 12px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "#0f171e",
            fontSize: 13,
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
}> = ({ vocab, sectionLabel, visualUrl, visualCaption }) => {
  const mediaUrl = visualUrl ?? vocab.imageUrl ?? vocab.imageSrc;
  const mediaCaption = visualCaption ?? vocab.imageCaption;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header Row */}
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
              padding: "6px 16px",
              borderRadius: 999,
            }}
          >
            {vocab.jlptLevel}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#98c8b6",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "5px 13px",
              borderRadius: 999,
            }}
          >
            {vocab.partOfSpeech}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span
            style={{
              fontSize: 16,
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
          gap: 18,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div
              style={{
                fontSize: 66,
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
                fontSize: 24,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.5)",
                whiteSpace: "nowrap",
              }}
            >
              {vocab.reading}
            </div>
          </div>

          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 21,
                fontWeight: 800,
                color: "#ffffff",
                backgroundColor: "#179658",
                padding: "5px 20px",
                borderRadius: 999,
              }}
            >
              {vocab.romaji}
            </span>
          </div>

          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            {vocab.meaning}
          </div>
        </div>

        {mediaUrl ? (
          <MediaVisualFrame
            imageUrl={mediaUrl}
            caption={mediaCaption}
            width={196}
            height={146}
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
          borderRadius: 14,
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 23,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.3,
          }}
        >
          {vocab.exampleJp}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "#36f2ae",
          }}
        >
          {vocab.exampleRomaji}
        </div>
        <div
          style={{
            fontSize: 18,
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
  const remainingFraction = interpolate(
    timeSec,
    [
      quiz.countdownStartSec,
      quiz.countdownStartSec + quiz.countdownDurationSec,
    ],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const barFraction = revealed ? 1 : remainingFraction;
  const barColor = revealed
    ? "#36f2ae"
    : remainingFraction > 0.5
      ? "#36f2ae"
      : remainingFraction > 0.25
        ? "#fbbf24"
        : "#fb7185";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.05em",
            color: "#ffffff",
            backgroundColor: revealed ? "#148c53" : "#5b21b6",
            padding: "6px 16px",
            borderRadius: 999,
          }}
        >
          {revealed ? "CORRECT ANSWER!" : quiz.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#b6d8cb" }}>
            Listening Check
          </span>
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 33,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
          }}
        >
          {quiz.questionJp}
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 600,
            color: "#c4b5fd",
            marginTop: 4,
          }}
        >
          {quiz.questionEn}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {quiz.options.map((opt) => {
          const isHit = revealed && opt.isCorrect;
          const isDimmed = revealed && !opt.isCorrect;
          return (
            <div
              key={opt.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderRadius: 12,
                backgroundColor: isHit
                  ? "rgba(20, 140, 83, 0.36)"
                  : isDimmed
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(255, 255, 255, 0.07)",
                border: isHit
                  ? "2px solid #36f2ae"
                  : isDimmed
                    ? "1px solid rgba(255, 255, 255, 0.08)"
                    : "1px solid rgba(196, 181, 253, 0.25)",
                opacity: isDimmed ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                    fontWeight: 900,
                    backgroundColor: isHit ? "#36f2ae" : "#4c2c96",
                    color: isHit ? "#082419" : "#ffffff",
                  }}
                >
                  {opt.label}
                </span>
                <span style={{ fontSize: 23, fontWeight: 800, color: "#ffffff" }}>
                  {opt.english}
                </span>
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: isHit ? "#7cf5c4" : "#cbd5e1",
                }}
              >
                {opt.jp} ({opt.romaji})
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: revealed ? "#36f2ae" : "#f5cf93",
            marginBottom: 6,
          }}
        >
          {revealed ? revealSummary : "TIME REMAINING"}
        </div>
        <div
          style={{
            width: "100%",
            height: 9,
            borderRadius: 999,
            backgroundColor: "#0c1116",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.round(barFraction * 100)}%`,
              height: "100%",
              borderRadius: 999,
              backgroundColor: barColor,
            }}
          />
        </div>
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
}> = ({ kanji, sectionStartFrame, visualUrl, visualCaption }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mediaUrl = visualUrl ?? kanji.imageUrl;
  const mediaCaption = visualCaption ?? kanji.imageCaption;

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

        {/* Auto-Generated Illustration Slot */}
        {mediaUrl ? (
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

/**
 * Authoritative Station Survival Guide lesson card (100% English explanations):
 * Displays JR/Tokyo Metro terminology grid, auto-generated SVG station diagram,
 * survival key phrase with Hepburn Romaji, and practical station tip.
 */
const StationGuideBoardContent: React.FC<{
  readonly guide: StationGuideData;
  readonly visualUrl?: string;
  readonly visualCaption?: string;
}> = ({ guide, visualUrl, visualCaption }) => {
  const mediaUrl = visualUrl ?? guide.imageUrl;
  const mediaCaption = visualCaption ?? guide.imageCaption;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "4px 14px",
              borderRadius: 999,
            }}
          >
            {guide.jlptLevel}
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "#98c8b6",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "4px 12px",
              borderRadius: 999,
            }}
          >
            {guide.sceneTag}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2f5ec" }}>
            Station Survival Guide
          </span>
        </div>
      </div>

      {/* Main Split Row: Title + 2x2 Terms Grid + Auto-Generated Station SVG */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.15,
              }}
            >
              {guide.titleJp}
            </div>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                color: "#34d399",
                marginTop: 2,
              }}
            >
              {guide.titleEn}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 7,
            }}
          >
            {guide.terms.slice(0, 4).map((term) => (
              <div
                key={`${term.jp}-${term.romaji}`}
                style={{
                  backgroundColor: "#0d141a",
                  border: "1px solid rgba(52, 211, 153, 0.22)",
                  borderLeft: `3.5px solid ${term.badgeColor ?? "#34d399"}`,
                  borderRadius: 9,
                  padding: "6px 9px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 5,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: term.jp.length >= 4 ? 14.5 : 16.5,
                      fontWeight: 800,
                      color: "#ffffff",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {term.jp}
                  </span>
                  <span
                    style={{
                      fontSize: term.reading.length >= 6 ? 10 : 11,
                      fontWeight: 700,
                      color: "#34d399",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {term.reading}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "#cbd5e1" }}>
                  {term.meaningEn}
                </div>
              </div>
            ))}
          </div>
        </div>

        {mediaUrl ? (
          <MediaVisualFrame
            imageUrl={mediaUrl}
            caption={mediaCaption}
            width={220}
            height={158}
          />
        ) : null}
      </div>

      {/* Survival Key Phrase Box */}
      <div
        style={{
          backgroundColor: "#0d141a",
          border: "1px solid rgba(52, 211, 153, 0.28)",
          borderRadius: 12,
          padding: "9px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: "#34d399",
          }}
        >
          SURVIVAL PHRASE
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#ffffff", lineHeight: 1.25 }}>
          {guide.keyPhraseJp}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#34d399" }}>
          {guide.keyPhraseRomaji}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "#e2e8f0" }}>
          {guide.keyPhraseEn}
        </div>
      </div>

      {/* Practical Tip Footer */}
      <div
        style={{
          backgroundColor: "#0d141a",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderLeft: "3px solid #f59e0b",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 500,
          color: "#d6e6df",
          lineHeight: 1.32,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: "#fbbf24",
            marginRight: 6,
          }}
        >
          TIP
        </span>
        {guide.tipEn}
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
}) => {
  const isDialogue = activeSection.type === "dialogue";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              color: "#ffffff",
              backgroundColor: "#148c53",
              padding: "6px 16px",
              borderRadius: 999,
            }}
          >
            {jlptLevel}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#a5c9ba",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "5px 14px",
              borderRadius: 999,
            }}
          >
            {episodeNumber}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AudioWaveIcon />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e2f5ec" }}>
            {visualUrl && !isDialogue
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
            alignItems: "stretch",
            gap: 16,
          }}
        >
          <div
            style={{
              flex: 1,
              backgroundColor: "#0d141a",
              border: "1px solid rgba(251, 191, 36, 0.28)",
              borderRadius: 14,
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  padding: "4px 10px",
                  borderRadius: 6,
                  backgroundColor: isGuestSpeaker(activeCue.speaker)
                    ? "#f59e0b"
                    : "#148c53",
                  color: isGuestSpeaker(activeCue.speaker) ? "#1f1402" : "#ffffff",
                }}
              >
                {activeCue.speaker}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#9fb0c0" }}>
                Practical Station Roleplay
              </span>
            </div>
            <div
              style={{
                fontSize: visualUrl ? 26 : 32,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.3,
              }}
            >
              {activeCue.japanese}
            </div>
            <div style={{ fontSize: visualUrl ? 16 : 18, fontWeight: 600, color: "#fde68a" }}>
              {activeCue.romaji}
            </div>
            <div style={{ fontSize: visualUrl ? 17 : 19, fontWeight: 500, color: "#cbd5e1" }}>
              {activeCue.english}
            </div>
          </div>

          {visualUrl ? (
            <MediaVisualFrame
              imageUrl={visualUrl}
              caption={visualCaption}
              width={220}
              height={165}
            />
          ) : null}
        </div>
      ) : visualUrl ? (
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
          <MediaVisualFrame
            imageUrl={visualUrl}
            caption={visualCaption}
            width="100%"
            height={230}
          />
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

      {!visualUrl && stationGuides.length > 0 ? (
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
      ) : !visualUrl && kanjiList.length > 0 ? (
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
      ) : !visualUrl && featuredVocab ? (
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
 * Straight, flat, front-facing 2D matte-dark presentation board with crisp
 * emerald-mint border and `spring()` dynamic zoom-in focus mode on `point_board`.
 */
export const PresentationBoard: React.FC<PresentationBoardProps> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  studioMode = "solo",
  sections,
  subtitles,
}) => {
  const isDual = studioMode === "dual";
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const zoomProgress = computeBoardZoomProgress(frame, fps, sections, subtitles);
  const boardScale = interpolate(
    zoomProgress,
    [0, 1],
    [1, isDual ? 1.32 : 1.38],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const boardSlideX = interpolate(
    zoomProgress,
    [0, 1],
    [0, isDual ? -28 : -115],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const boardSlideY = interpolate(
    zoomProgress,
    [0, 1],
    [0, isDual ? 48 : 52],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

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
      {/* Center-stage studio dim scrim during dynamic `point_board` zoom-in focus */}
      {zoomProgress > 0.01 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#040810",
            opacity: zoomProgress * 0.52,
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 136,
          right: isDual ? 108 : 175,
          width: isDual ? 632 : 650,
          minHeight: 440,
          backgroundColor: "#121b22",
          borderRadius: 16,
          border: "2.5px solid #2ee8a5",
          boxShadow:
            zoomProgress > 0.05
              ? `0 0 0 6px #182128, 0 0 ${Math.round(44 * zoomProgress)}px rgba(46, 232, 165, ${(0.44 * zoomProgress).toFixed(2)}), 0 32px 76px rgba(0, 0, 0, 0.78)`
              : "0 0 0 6px #182128, 0 22px 52px rgba(0, 0, 0, 0.55)",
          padding: "28px 32px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          transformOrigin: "center center",
          scale: boardScale,
          translate: `${boardSlideX.toFixed(1)}px ${boardSlideY.toFixed(1)}px`,
        }}
      >
        <div
          key={activeSection.id}
          style={{
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
            />
          ) : (activeSection.type === "kanji_lesson" ||
              Boolean(activeSection.kanji)) &&
            activeSection.kanji ? (
            <KanjiLessonBoardContent
              kanji={activeSection.kanji}
              sectionStartFrame={sectionStartFrame}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
            />
          ) : (activeSection.type === "vocabulary" ||
              activeSection.type === "grammar") &&
            activeSection.vocab ? (
            <VocabBoardContent
              vocab={activeSection.vocab}
              sectionLabel={activeSection.label}
              visualUrl={activeVisualUrl}
              visualCaption={activeVisualCaption}
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
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
