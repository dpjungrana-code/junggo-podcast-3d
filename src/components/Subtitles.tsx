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
  WordTiming,
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

type HighlightState = "active" | "passed" | "upcoming";

const getTokenState = (token: WordTiming, timeSec: number): HighlightState => {
  if (timeSec >= token.startSec && timeSec <= token.endSec) {
    return "active";
  }
  if (timeSec > token.endSec) {
    return "passed";
  }
  return "upcoming";
};

const KARAOKE_GREEN = "#34d399";

const renderKaraokeJapanese = (
  japanese: string,
  wordTimings: readonly WordTiming[] | undefined,
  timeSec: number,
): React.ReactNode => {
  if (!wordTimings || wordTimings.length === 0) {
    return japanese;
  }

  const ordered = wordTimings
    .filter(
      (w): w is WordTiming & { charStart: number; charEnd: number } =>
        typeof w.charStart === "number" &&
        typeof w.charEnd === "number" &&
        w.charEnd > w.charStart,
    )
    .slice()
    .sort((a, b) => a.charStart - b.charStart);

  if (ordered.length === 0) {
    return japanese;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ordered.forEach((token, idx) => {
    const cStart = Math.max(cursor, token.charStart);
    const cEnd = Math.min(japanese.length, token.charEnd);

    if (cStart > cursor) {
      const gapText = japanese.slice(cursor, cStart);
      const prevPassed = idx > 0 && timeSec >= ordered[idx - 1].endSec;
      const gapLit = prevPassed || timeSec >= token.startSec;
      parts.push(
        <span
          key={`jp-gap-${idx}`}
          style={{ color: gapLit ? KARAOKE_GREEN : "#ffffff" }}
        >
          {gapText}
        </span>,
      );
    }

    if (cEnd > cStart) {
      const tokenText = japanese.slice(cStart, cEnd);
      const state = getTokenState(token, timeSec);
      parts.push(
        <span
          key={`jp-tok-${idx}`}
          style={
            state === "active"
              ? {
                  color: KARAOKE_GREEN,
                  textShadow: "0 0 14px rgba(52, 211, 153, 0.65)",
                  backgroundColor: "rgba(52, 211, 153, 0.16)",
                  borderBottom: `2.5px solid ${KARAOKE_GREEN}`,
                  borderRadius: 5,
                  padding: "0 2px",
                }
              : state === "passed"
                ? { color: KARAOKE_GREEN }
                : { color: "#ffffff" }
          }
        >
          {tokenText}
        </span>,
      );
      cursor = cEnd;
    }
  });

  if (cursor < japanese.length) {
    const last = ordered[ordered.length - 1];
    parts.push(
      <span
        key="jp-tail"
        style={{
          color: timeSec > last.endSec ? KARAOKE_GREEN : "#ffffff",
        }}
      >
        {japanese.slice(cursor)}
      </span>,
    );
  }

  return parts;
};

const renderKaraokeRomaji = (
  romaji: string,
  wordTimings: readonly WordTiming[] | undefined,
  timeSec: number,
  guest: boolean,
): React.ReactNode => {
  const upcomingColor = guest
    ? "rgba(253, 230, 138, 0.56)"
    : "rgba(203, 213, 225, 0.58)";

  if (!wordTimings || wordTimings.length === 0) {
    return <span style={{ color: guest ? "#fde68a" : "#36f2ae" }}>{romaji}</span>;
  }

  const ordered = wordTimings
    .filter(
      (w): w is WordTiming & { romajiStart: number; romajiEnd: number } =>
        typeof w.romajiStart === "number" &&
        typeof w.romajiEnd === "number" &&
        w.romajiEnd > w.romajiStart,
    )
    .slice()
    .sort((a, b) => a.romajiStart - b.romajiStart);

  if (ordered.length === 0) {
    return <span style={{ color: guest ? "#fde68a" : "#36f2ae" }}>{romaji}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ordered.forEach((token, idx) => {
    const rStart = Math.max(cursor, token.romajiStart);
    const rEnd = Math.min(romaji.length, token.romajiEnd);

    if (rStart > cursor) {
      const gapText = romaji.slice(cursor, rStart);
      const prevPassed = idx > 0 && timeSec >= ordered[idx - 1].endSec;
      const gapLit = prevPassed || timeSec >= token.startSec;
      parts.push(
        <span
          key={`rom-gap-${idx}`}
          style={{
            color: gapLit ? KARAOKE_GREEN : upcomingColor,
            fontWeight: gapLit ? 700 : 600,
          }}
        >
          {gapText}
        </span>,
      );
    }

    if (rEnd > rStart) {
      const wordText = romaji.slice(rStart, rEnd);
      const state = getTokenState(token, timeSec);
      parts.push(
        <span
          key={`rom-tok-${idx}`}
          style={
            state === "active"
              ? {
                  color: KARAOKE_GREEN,
                  fontWeight: 800,
                  textShadow: "0 0 10px rgba(52, 211, 153, 0.5)",
                }
              : state === "passed"
                ? {
                    color: KARAOKE_GREEN,
                    fontWeight: 700,
                  }
                : {
                    color: upcomingColor,
                    fontWeight: 600,
                  }
          }
        >
          {wordText}
        </span>,
      );
      cursor = rEnd;
    }
  });

  if (cursor < romaji.length) {
    const last = ordered[ordered.length - 1];
    parts.push(
      <span
        key="rom-tail"
        style={{
          color: timeSec > last.endSec ? KARAOKE_GREEN : upcomingColor,
          fontWeight: timeSec > last.endSec ? 700 : 600,
        }}
      >
        {romaji.slice(cursor)}
      </span>,
    );
  }

  return parts;
};

/**
 * Sleek bottom subtitle bar with real-time Whisper-synced Karaoke Japanese
 * and Romaji highlighting (#34d399) + crisp English translation below.
 */
export const Subtitles: React.FC<SubtitlesProps> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

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
              guest ? "rgba(251, 191, 36, 0.55)" : "rgba(52, 211, 153, 0.52)"
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

          {/* Subtitle Text Stack with Progressive Karaoke Highlighting */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                fontSize: activeCue.japanese.length > 34 ? 26 : 30,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.02em",
                lineHeight: 1.28,
                marginBottom: 4,
              }}
            >
              {renderKaraokeJapanese(
                activeCue.japanese,
                activeCue.wordTimings,
                timeSec,
              )}
            </div>
            <div
              style={{
                fontSize: activeCue.romaji.length > 70 ? 17.5 : 19,
                letterSpacing: "0.015em",
                marginBottom: 3,
              }}
            >
              {renderKaraokeRomaji(
                activeCue.romaji,
                activeCue.wordTimings,
                timeSec,
                guest,
              )}
            </div>
            <div
              style={{
                fontSize: 19.5,
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
