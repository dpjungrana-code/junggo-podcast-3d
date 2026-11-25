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
  isGuestSpeaker,
} from "../data/demoEpisode";

type SubtitlesProps = {
  readonly episodeNumber: string;
  readonly episodeTitle: string;
  readonly jlptLevel: string;
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
};

const SpeakerAudioIcon: React.FC<{ readonly strokeColor: string }> = ({
  strokeColor,
}) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 9.5V14.5H7.8L12.5 18.5V5.5L7.8 9.5H4Z"
      fill={strokeColor}
    />
    <path
      d="M15.8 8.8C16.8 9.8 17.3 10.9 17.3 12C17.3 13.1 16.8 14.2 15.8 15.2"
      stroke={strokeColor}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M18.3 6.5C19.9 8.1 20.7 10 20.7 12C20.7 14 19.9 15.9 18.3 17.5"
      stroke={strokeColor}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Sleek bottom subtitle bar matching `public/images/studio-reference.jpg` with
 * circular speaker badge, crisp Japanese + luminous mint Romaji + English translation.
 * Strictly mounts only ONE active cue per integer frame range.
 */
export const Subtitles: React.FC<SubtitlesProps> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
        [8, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        },
      )
    : 0;

  if (activeCue === null) {
    return null;
  }

  const guest = isGuestSpeaker(activeCue.speaker);

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
          left: 0,
          right: 0,
          bottom: 32,
          display: "flex",
          justifyContent: "center",
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        <div
          key={activeCue.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            maxWidth: 1320,
            minWidth: 740,
            padding: "16px 32px 18px 26px",
            borderRadius: 18,
            backgroundColor: "rgba(11, 15, 21, 0.92)",
            border: `1.5px solid ${
              guest ? "rgba(251, 191, 36, 0.55)" : "rgba(56, 235, 172, 0.48)"
            }`,
            boxShadow: "0 14px 36px rgba(0, 0, 0, 0.56)",
            opacity: subtitleOpacity,
            translate: `0px ${subtitleLiftY}px`,
          }}
        >
          {/* Circular Speaker Audio Badge */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                backgroundColor: guest ? "#f59e0b" : "#148c53",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: guest
                  ? "0 0 14px rgba(245, 158, 11, 0.4)"
                  : "0 0 14px rgba(20, 140, 83, 0.45)",
              }}
            >
              <SpeakerAudioIcon strokeColor={guest ? "#1f1402" : "#ffffff"} />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: guest ? "#fde68a" : "#6ff7c6",
              }}
            >
              {activeCue.speaker}
            </span>
          </div>

          {/* Subtitle Text Stack */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                fontSize: activeCue.japanese.length > 30 ? 27 : 31,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.02em",
                lineHeight: 1.25,
                marginBottom: 4,
              }}
            >
              {activeCue.japanese}
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 600,
                color: guest ? "#fde68a" : "#36f2ae",
                letterSpacing: "0.015em",
                marginBottom: 3,
              }}
            >
              {activeCue.romaji}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: "#e2e8f0",
                lineHeight: 1.3,
              }}
            >
              {activeCue.english}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
