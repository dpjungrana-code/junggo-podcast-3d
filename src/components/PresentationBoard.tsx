import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EpisodeSection,
  QuizCardData,
  SubtitleCue,
  VocabCardData,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";

export type PresentationBoardProps = {
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
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
  return staticFile(src);
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
}> = ({ vocab, sectionLabel }) => {
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

        {vocab.imageSrc ? (
          <div
            style={{
              width: 162,
              flexShrink: 0,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              backgroundColor: "#0e151b",
            }}
          >
            <Img
              src={resolveImageSrc(vocab.imageSrc)}
              style={{ width: 162, height: 138, objectFit: "cover" }}
            />
          </div>
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
          {revealed ? "B — おいしい (oishii) = Delicious!" : "TIME REMAINING"}
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

const OverviewBoardContent: React.FC<{
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly activeSection: EpisodeSection;
  readonly featuredVocab?: VocabCardData;
  readonly activeCue: SubtitleCue | null;
}> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  activeSection,
  featuredVocab,
  activeCue,
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
            {isDialogue ? "Cafe Dialogue" : "Today's Lesson"}
          </span>
        </div>
      </div>

      {isDialogue && activeCue ? (
        <div
          style={{
            backgroundColor: "#0d141a",
            border: "1px solid rgba(251, 191, 36, 0.28)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
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
              Natural Tokyo Cafe Conversation
            </span>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.3,
            }}
          >
            {activeCue.japanese}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#fde68a" }}>
            {activeCue.romaji}
          </div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#cbd5e1" }}>
            {activeCue.english}
          </div>
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
            Warm, clear JLPT N5 Japanese you can use in real Tokyo cafes.
          </div>
        </div>
      )}

      {activeSection.imageSrc ? (
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          <Img
            src={resolveImageSrc(activeSection.imageSrc)}
            style={{ width: "100%", height: 148, objectFit: "cover" }}
          />
        </div>
      ) : featuredVocab ? (
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

/**
 * Straight, flat, front-facing 2D matte-dark presentation board with crisp
 * emerald-mint border matching `public/images/studio-reference.jpg`.
 */
export const PresentationBoard: React.FC<PresentationBoardProps> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  sections,
  subtitles,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const activeSection = getActiveSection(sections, timeSec);
  const activeCue = getActiveSubtitle(subtitles, timeSec);
  const featuredVocab = sections.find((s) => s.vocab)?.vocab;

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
          top: 136,
          right: 175,
          width: 650,
          minHeight: 440,
          backgroundColor: "#121b22",
          borderRadius: 16,
          border: "2.5px solid #2ee8a5",
          boxShadow: "0 0 0 6px #182128, 0 22px 52px rgba(0, 0, 0, 0.55)",
          padding: "28px 32px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          key={activeSection.id}
          style={{
            opacity: contentOpacity,
            translate: `0px ${contentOffsetY}px`,
          }}
        >
          {(activeSection.type === "vocabulary" ||
            activeSection.type === "grammar") &&
          activeSection.vocab ? (
            <VocabBoardContent
              vocab={activeSection.vocab}
              sectionLabel={activeSection.label}
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
              activeCue={activeCue}
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
