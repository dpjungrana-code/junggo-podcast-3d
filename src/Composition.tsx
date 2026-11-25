import React from "react";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Audio,
  spring,
  staticFile,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { CameraRig } from "./components/CameraRig";
import { PresentationBoard } from "./components/PresentationBoard";
import { Studio3D } from "./components/Studio3D";
import { Subtitles } from "./components/Subtitles";
import currentEpisodeJson from "./data/currentEpisode.json";
import {
  EpisodeData,
  EpisodeSection,
  LayoutMode,
  StudioMode,
  getActiveSection,
} from "./data/demoEpisode";
import { PodcastAudioProvider } from "./utils/audio";

const ACTIVE_EPISODE = currentEpisodeJson as EpisodeData;

export type JungGoPodcastProps = {
  readonly episodeTitle: string;
  /**
   * Optional path inside `public/` (e.g. "audio/current_episode.mp3") or full URL.
   * When empty, uses the deterministic speech-cadence fallback safely.
   */
  readonly audioSrc: string;
  /** Optional runtime override for solo vs dual studio preview/render checks */
  readonly studioModeOverride?: StudioMode;
  /** Optional layout mode override ("auto" | "studio_wide" | "board_focus") */
  readonly layoutModeOverride?: LayoutMode;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const resolveAudioUrl = (audioSrc: string): string | undefined => {
  const trimmed = audioSrc.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return staticFile(trimmed);
};

const computeBoardFocusProgress = (
  frame: number,
  fps: number,
  sections: readonly EpisodeSection[],
  durationSec: number,
  layoutMode: LayoutMode,
): number => {
  if (layoutMode === "studio_wide") {
    return 0;
  }
  if (layoutMode === "board_focus") {
    return 1;
  }

  const firstTeachSection = sections.find((s) => s.type !== "intro");
  if (!firstTeachSection) {
    return 0;
  }

  const enterFrame = Math.round(firstTeachSection.startSec * fps);
  const outroStartSec = Math.max(
    firstTeachSection.startSec + 1,
    durationSec - 4.2,
  );
  const exitFrame = Math.round(outroStartSec * fps);

  if (frame < enterFrame) {
    return 0;
  }

  const enterProgress = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 18, stiffness: 105, mass: 0.9 },
  });

  const exitProgress =
    frame >= exitFrame
      ? 1 -
        spring({
          frame: frame - exitFrame,
          fps,
          config: { damping: 18, stiffness: 105, mass: 0.9 },
        })
      : 1;

  return Math.max(0, Math.min(1, Math.min(enterProgress, exitProgress)));
};

const FujiBrandEmblem: React.FC = () => (
  <svg width="56" height="44" viewBox="0 0 64 50" fill="none">
    <circle cx="32" cy="21" r="17" fill="#ef4444" />
    <path d="M6 46 L26 17 L32 23 L38 17 L58 46 Z" fill="#148c53" />
    <path
      d="M23.5 20.5 L26 17 L32 23 L38 17 L40.5 20.5 L35.5 24.5 L32 22 L28.5 24.5 Z"
      fill="#ffffff"
    />
  </svg>
);

export const JungGoPodcastStudio: React.FC<JungGoPodcastProps> = ({
  episodeTitle,
  audioSrc,
  studioModeOverride,
  layoutModeOverride,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const resolvedAudio = resolveAudioUrl(audioSrc);
  const studioMode = studioModeOverride ?? ACTIVE_EPISODE.studioMode ?? "solo";
  const layoutMode: LayoutMode =
    layoutModeOverride ?? ACTIVE_EPISODE.layoutMode ?? "auto";

  const boardFocusProgress = computeBoardFocusProgress(
    frame,
    fps,
    ACTIVE_EPISODE.sections,
    ACTIVE_EPISODE.durationSec,
    layoutMode,
  );

  const timeSec = frame / fps;
  const activeSection = getActiveSection(ACTIVE_EPISODE.sections, timeSec);

  const circleSize = 504;
  const circleLeft = lerp(0, 36, boardFocusProgress);
  const circleTop = lerp(0, 352, boardFocusProgress);
  const circleW = lerp(width, circleSize, boardFocusProgress);
  const circleH = lerp(height, circleSize, boardFocusProgress);
  const circleRadius = lerp(0, circleSize / 2, boardFocusProgress);
  const canvasScale = lerp(1, 0.5, boardFocusProgress);

  return (
    <PodcastAudioProvider
      audioSrc={resolvedAudio}
      subtitles={ACTIVE_EPISODE.subtitles}
    >
      <AbsoluteFill
        style={{
          backgroundColor: "#0a0e1b",
          fontFamily:
            '"Hiragino Sans", "Noto Sans JP", "Avenir Next", "Helvetica Neue", sans-serif',
        }}
      >
        {resolvedAudio ? <Audio src={resolvedAudio} /> : null}

        {/* LAYER 0: Studio Blackboard Backdrop + Clean Top-Left JungGo Brand Header */}
        {boardFocusProgress > 0.005 ? (
          <AbsoluteFill
            style={{
              zIndex: 0,
              opacity: boardFocusProgress,
              background:
                "radial-gradient(ellipse at 18% 58%, #1a2733 0%, #0d151d 52%, #080d13 100%)",
            }}
          >
            {/* Subtle top-left JungGo studio identity badge above Circular Character Cam */}
            <div
              style={{
                position: "absolute",
                left: 36,
                top: 42,
                width: 504,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <FujiBrandEmblem />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    <span style={{ color: "#ffffff" }}>Jung</span>
                    <span style={{ color: "#34d399" }}>Go</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: "0.22em",
                      color: "#98c8b6",
                      marginTop: 4,
                    }}
                  >
                    PODCAST STUDIO
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#ffffff",
                    backgroundColor: "#148c53",
                    padding: "5px 14px",
                    borderRadius: 999,
                  }}
                >
                  {ACTIVE_EPISODE.jlptLevel}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#cbd5e1",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    padding: "5px 13px",
                    borderRadius: 999,
                  }}
                >
                  {ACTIVE_EPISODE.episodeNumber}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#34d399",
                    backgroundColor: "rgba(52, 211, 153, 0.14)",
                    border: "1px solid rgba(52, 211, 153, 0.35)",
                    padding: "4px 13px",
                    borderRadius: 999,
                  }}
                >
                  {activeSection.label}
                </span>
              </div>

              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#e2e8f0",
                  textAlign: "center",
                  maxWidth: 460,
                  lineHeight: 1.25,
                }}
              >
                {episodeTitle || ACTIVE_EPISODE.title}
              </div>
            </div>
          </AbsoluteFill>
        ) : null}

        {/* LAYER 1: Giant Ultra-Crisp Content Blackboard (Upper-Right & Center) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <PresentationBoard
            episodeNumber={ACTIVE_EPISODE.episodeNumber}
            episodeTitle={episodeTitle || ACTIVE_EPISODE.title}
            jlptLevel={ACTIVE_EPISODE.jlptLevel}
            studioMode={studioMode}
            boardFocusProgress={boardFocusProgress}
            sections={ACTIVE_EPISODE.sections}
            subtitles={ACTIVE_EPISODE.subtitles}
          />
        </div>

        {/* LAYER 2: Circular Character Cam (Bottom-Left) / Full-Screen Intro Studio */}
        <div
          style={{
            position: "absolute",
            left: circleLeft,
            top: circleTop,
            width: circleW,
            height: circleH,
            borderRadius: circleRadius,
            clipPath:
              boardFocusProgress > 0.01
                ? `inset(0 round ${circleRadius.toFixed(1)}px)`
                : undefined,
            overflow: "hidden",
            isolation: "isolate",
            zIndex: 20,
            backgroundColor: "#0a0e1b",
            border:
              boardFocusProgress > 0.02
                ? `4px solid rgba(52, 211, 153, ${(0.95 * boardFocusProgress).toFixed(3)})`
                : "none",
            boxSizing: "border-box",
            boxShadow:
              boardFocusProgress > 0.02
                ? `0 0 ${Math.round(32 * boardFocusProgress)}px rgba(52, 211, 153, ${(0.34 * boardFocusProgress).toFixed(3)}), 0 18px 44px rgba(0, 0, 0, ${(0.72 * boardFocusProgress).toFixed(3)})`
                : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width,
              height,
              translate: "-50% -50%",
              scale: canvasScale,
              transformOrigin: "center center",
            }}
          >
            <ThreeCanvas
              width={width}
              height={height}
              shadows={isRendering}
              dpr={isRendering ? 1.25 : 1}
              gl={{
                antialias: true,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
              }}
              onCreated={({ gl }) => {
                gl.toneMappingExposure = 1.12;
              }}
              camera={{ position: [0.18, 1.58, 3.55], fov: 42, near: 0.1, far: 45 }}
            >
              <color attach="background" args={["#0b1022"]} />
              <fog attach="fog" args={["#10152b", 10.5, 22]} />

              <CameraRig
                sections={ACTIVE_EPISODE.sections}
                subtitles={ACTIVE_EPISODE.subtitles}
                studioMode={studioMode}
                boardFocusProgress={boardFocusProgress}
              />
              <Studio3D
                sections={ACTIVE_EPISODE.sections}
                subtitles={ACTIVE_EPISODE.subtitles}
                studioMode={studioMode}
              />
            </ThreeCanvas>
          </div>
        </div>

        {/* LAYER 3: Full-Width Bottom Karaoke Subtitle Bar */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <Subtitles
            episodeNumber={ACTIVE_EPISODE.episodeNumber}
            episodeTitle={episodeTitle || ACTIVE_EPISODE.title}
            jlptLevel={ACTIVE_EPISODE.jlptLevel}
            sections={ACTIVE_EPISODE.sections}
            subtitles={ACTIVE_EPISODE.subtitles}
          />
        </div>
      </AbsoluteFill>
    </PodcastAudioProvider>
  );
};
