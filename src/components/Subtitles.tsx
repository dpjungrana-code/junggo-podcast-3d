import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EpisodeSection,
  SubtitleCue,
  getActiveSection,
  isGuestSpeaker,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";

type SubtitlesProps = {
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
};

const SECTION_ACCENTS: Record<EpisodeSection["type"], string> = {
  intro: "#38f6b5",
  story: "#60a5fa",
  vocabulary: "#34d399",
  grammar: "#38bdf8",
  dialogue: "#fbbf24",
  quiz: "#a78bfa",
};

/**
 * Clean non-overlapping bottom subtitle bar (Japanese + Romaji + English),
 * reactive mint audio waveform strip, and subtle broadcast section pill.
 * Uses strict frame intervals so previous subtitles always unmount cleanly.
 */
export const Subtitles: React.FC<SubtitlesProps> = ({
  episodeNumber,
  episodeTitle,
  jlptLevel,
  sections,
  subtitles,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();

  const activeSection = getActiveSection(sections, timeSec);
  const accentColor = SECTION_ACCENTS[activeSection.type];

  // Strict integer frame interval matching so cues NEVER overlap
  let activeCue: SubtitleCue | null = null;
  let cueStartFrame = 0;
  let cueEndFrame = 0;

  for (const cue of subtitles) {
    const startFrame = Math.round(cue.startSec * fps);
    const endFrame = Math.round(cue.endSec * fps);
    if (frame >= startFrame && frame < endFrame) {
      activeCue = cue;
      cueStartFrame = startFrame;
      cueEndFrame = endFrame;
      break;
    }
  }

  const fadeFrames = Math.max(4, Math.round(0.18 * fps));
  const subtitleOpacity = activeCue
    ? Math.min(
        interpolate(frame, [cueStartFrame, cueStartFrame + fadeFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
        interpolate(frame, [cueEndFrame - fadeFrames, cueEndFrame], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.in(Easing.cubic),
        }),
      )
    : 0;

  const subtitleLiftY = activeCue
    ? interpolate(
        frame,
        [cueStartFrame, cueStartFrame + fadeFrames],
        [10, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        },
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        fontFamily:
          '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
      }}
    >
      {/* Top-Left Studio Broadcast Header Pill */}
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 42,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          borderRadius: 999,
          backgroundColor: "rgba(10, 16, 26, 0.72)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: accentColor,
            boxShadow: `0 0 12px ${accentColor}`,
          }}
        />
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: accentColor,
          }}
        >
          {activeSection.label}
        </span>
        <span style={{ color: "rgba(255, 255, 255, 0.28)", fontSize: 16 }}>
          |
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#f1f5f9",
          }}
        >
          {episodeNumber} · {episodeTitle}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#092117",
            backgroundColor: "#38f6b5",
            padding: "3px 10px",
            borderRadius: 999,
          }}
        >
          {jlptLevel}
        </span>
      </div>

      {/* Bottom Audio Waveform + Strict Single-Cue Subtitle Container */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 34,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        {/* Subtle Centered Audio Waveform Strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            height: 36,
          }}
        >
          {audio.spectrum.map((val, idx) => {
            const centerFactor = 1 - Math.abs(idx - 11.5) / 14;
            const barHeight = Math.max(
              4,
              Math.round((6 + val * 30) * (0.4 + centerFactor * 0.65)),
            );
            const barColor =
              activeSection.type === "quiz" ? "#c084fc" : "#5be8be";
            return (
              <div
                key={idx}
                style={{
                  width: 4,
                  height: barHeight,
                  borderRadius: 999,
                  backgroundColor: barColor,
                  opacity: 0.4 + val * 0.55,
                  boxShadow: `0 0 8px ${barColor}`,
                }}
              />
            );
          })}
        </div>

        {/* Strict Single-Active Subtitle Overlay (Unmounts cleanly between cues) */}
        {activeCue !== null && (
          <div
            key={activeCue.id}
            style={{
              maxWidth: 1260,
              minWidth: 740,
              padding: "16px 32px 18px 32px",
              borderRadius: 18,
              backgroundColor: "rgba(12, 16, 22, 0.90)",
              border: `1px solid ${
                isGuestSpeaker(activeCue.speaker)
                  ? "rgba(251, 191, 36, 0.42)"
                  : "rgba(72, 224, 170, 0.34)"
              }`,
              boxShadow: "0 14px 36px rgba(0, 0, 0, 0.52)",
              textAlign: "center",
              opacity: subtitleOpacity,
              translate: `0px ${subtitleLiftY}px`,
            }}
          >
            {/* Speaker Badge + Japanese Line */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: "0.03em",
                  color: isGuestSpeaker(activeCue.speaker)
                    ? "#261804"
                    : "#ffffff",
                  backgroundColor: isGuestSpeaker(activeCue.speaker)
                    ? "#fbbf24"
                    : "#1e8e5a",
                  padding: "4px 12px",
                  borderRadius: 7,
                }}
              >
                {activeCue.speaker}
              </span>
              <span
                style={{
                  fontSize: 31,
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "0.02em",
                  lineHeight: 1.25,
                }}
              >
                {activeCue.japanese}
              </span>
            </div>

            {/* Romaji Pronunciation Line */}
            <div
              style={{
                fontSize: 19,
                fontWeight: 600,
                color: isGuestSpeaker(activeCue.speaker)
                  ? "#fde68a"
                  : "#70e6be",
                letterSpacing: "0.015em",
                marginBottom: 3,
              }}
            >
              {activeCue.romaji}
            </div>

            {/* English Translation Line */}
            <div
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: "#d4dde7",
                lineHeight: 1.3,
              }}
            >
              {activeCue.english}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
