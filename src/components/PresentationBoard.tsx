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

const VocabBoardContent: React.FC<{
  readonly vocab: VocabCardData;
  readonly sectionLabel: string;
}> = ({ vocab, sectionLabel }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header Row: Badges + Spotlight Tag */}
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
              color: "#e6faf0",
              backgroundColor: "#1d6f4b",
              padding: "6px 15px",
              borderRadius: 999,
            }}
          >
            {vocab.jlptLevel}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#a5c9ba",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "6px 15px",
              borderRadius: 999,
            }}
          >
            {vocab.partOfSpeech}
          </span>
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.09em",
            color: "#8ab8a6",
            textTransform: "uppercase",
          }}
        >
          {sectionLabel} SPOTLIGHT
        </span>
      </div>

      {/* Main Word + Optional Image Layout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 78,
                fontWeight: 900,
                color: "#ffffff",
                lineHeight: 1.05,
                letterSpacing: "0.01em",
              }}
            >
              {vocab.word}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.52)",
                whiteSpace: "nowrap",
              }}
            >
              {vocab.reading}
            </div>
          </div>

          {/* Romaji Pill */}
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 23,
                fontWeight: 700,
                color: "#6ff7c6",
                backgroundColor: "rgba(44, 175, 124, 0.14)",
                border: "1.5px solid rgba(82, 240, 180, 0.55)",
                padding: "5px 20px",
                borderRadius: 999,
              }}
            >
              {vocab.romaji}
            </span>
          </div>

          {/* English Meaning */}
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              color: "#f8efe2",
              lineHeight: 1.15,
            }}
          >
            {vocab.meaning}
          </div>
        </div>

        {vocab.imageSrc ? (
          <div
            style={{
              width: 170,
              flexShrink: 0,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              backgroundColor: "#101419",
            }}
          >
            <Img
              src={resolveImageSrc(vocab.imageSrc)}
              style={{ width: 170, height: 140, objectFit: "cover" }}
            />
            {vocab.imageCaption ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#a8b8c4",
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                {vocab.imageCaption}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          backgroundColor: "rgba(92, 224, 172, 0.22)",
          marginTop: 2,
        }}
      />

      {/* Example Sentence Box */}
      <div
        style={{
          backgroundColor: "#11161b",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 14,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div
          style={{
            fontSize: 24,
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
            color: "#6ff7c6",
          }}
        >
          {vocab.exampleRomaji}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "#c6d2dd",
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
    ? "#38f6b5"
    : remainingFraction > 0.5
      ? "#38f6b5"
      : remainingFraction > 0.25
        ? "#fbbf24"
        : "#fb7185";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
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
            letterSpacing: "0.06em",
            color: "#ffffff",
            backgroundColor: revealed ? "#167a50" : "#5b21b6",
            padding: "6px 16px",
            borderRadius: 999,
          }}
        >
          {revealed ? "CORRECT ANSWER!" : quiz.title}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#a9b7c6",
          }}
        >
          LISTENING CHECK
        </span>
      </div>

      {/* Question */}
      <div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
          }}
        >
          {quiz.questionJp}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#c4b5fd",
            marginTop: 4,
          }}
        >
          {quiz.questionEn}
        </div>
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                padding: "11px 16px",
                borderRadius: 12,
                backgroundColor: isHit
                  ? "rgba(22, 138, 90, 0.36)"
                  : isDimmed
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(255, 255, 255, 0.07)",
                border: isHit
                  ? "2px solid #38f6b5"
                  : isDimmed
                    ? "1px solid rgba(255, 255, 255, 0.08)"
                    : "1px solid rgba(196, 181, 253, 0.25)",
                opacity: isDimmed ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 900,
                    backgroundColor: isHit ? "#38f6b5" : "#4c2c96",
                    color: isHit ? "#082419" : "#ffffff",
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#ffffff",
                  }}
                >
                  {opt.english}
                </span>
              </div>
              <span
                style={{
                  fontSize: 19,
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

      {/* Countdown Progress Bar */}
      <div style={{ marginTop: 4 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 700,
            color: revealed ? "#6ff7c6" : "#f5cf93",
            marginBottom: 6,
          }}
        >
          <span>
            {revealed ? "B — おいしい (oishii) = Delicious!" : "TIME REMAINING"}
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: 10,
            borderRadius: 999,
            backgroundColor: "#0e1218",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Badges */}
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
              color: "#e6faf0",
              backgroundColor: "#1d6f4b",
              padding: "6px 15px",
              borderRadius: 999,
            }}
          >
            {jlptLevel}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#a5c9ba",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              padding: "6px 15px",
              borderRadius: 999,
            }}
          >
            {episodeNumber}
          </span>
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.09em",
            color: isDialogue ? "#fbbf24" : "#8ab8a6",
          }}
        >
          {isDialogue ? "CAFE DIALOGUE PRACTICE" : "TODAY'S LESSON"}
        </span>
      </div>

      {/* Main Title or Dialogue Spotlight */}
      {isDialogue && activeCue ? (
        <div
          style={{
            backgroundColor: "#11161b",
            border: "1px solid rgba(251, 191, 36, 0.25)",
            borderRadius: 16,
            padding: "22px 24px",
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
                  : "#1e8e5a",
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
              fontSize: 34,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.3,
            }}
          >
            {activeCue.japanese}
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#fde68a" }}>
            {activeCue.romaji}
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#cbd5e1" }}>
            {activeCue.english}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            {episodeTitle}
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#b6c5d4" }}>
            Learn practical everyday Japanese phrases you can use right away.
          </div>
        </div>
      )}

      {/* Optional Custom Lesson Image or Featured Keyword Preview */}
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
            style={{ width: "100%", height: 150, objectFit: "cover" }}
          />
        </div>
      ) : featuredVocab ? (
        <div
          style={{
            backgroundColor: "#11161b",
            border: "1px solid rgba(92, 224, 172, 0.22)",
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
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#7ddbb4",
                marginBottom: 4,
              }}
            >
              KEY WORD IN THIS EPISODE
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, color: "#ffffff" }}>
              {featuredVocab.word}{" "}
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.55)",
                }}
              >
                ({featuredVocab.reading})
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#6ff7c6" }}>
              {featuredVocab.romaji}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f8efe2" }}>
              {featuredVocab.meaning}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Straight, flat, front-facing 2D matte-black presentation blackboard
 * mounted on the right side of the 16:9 widescreen studio frame.
 * Zero 3D tilt, zero skew, zero background glare.
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

  // Smooth deterministic entrance fade at each section transition
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
      {/* Flat, Front-Facing Matte-Black Monitor Frame on Right Side */}
      <div
        style={{
          position: "absolute",
          top: 154,
          right: 238,
          width: 656,
          minHeight: 422,
          backgroundColor: "#171c22",
          borderRadius: 12,
          border: "2px solid rgba(140, 165, 180, 0.28)",
          boxShadow: "0 0 0 8px #232a32, 0 24px 56px rgba(0, 0, 0, 0.58)",
          padding: "26px 30px",
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
