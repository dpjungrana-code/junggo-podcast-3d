import React from "react";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { CameraRig } from "./components/CameraRig";
import { PresentationBoard } from "./components/PresentationBoard";
import { Studio3D } from "./components/Studio3D";
import { Subtitles } from "./components/Subtitles";
import currentEpisodeJson from "./data/currentEpisode.json";
import type { EpisodeData } from "./data/demoEpisode";
import { PodcastAudioProvider } from "./utils/audio";

const ACTIVE_EPISODE = currentEpisodeJson as EpisodeData;

export type JungGoPodcastProps = {
  readonly episodeTitle: string;
  /**
   * Optional path inside `public/` (e.g. "audio/current_episode.mp3") or full URL.
   * When empty, uses the deterministic speech-cadence fallback safely.
   */
  readonly audioSrc: string;
};

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

export const JungGoPodcastStudio: React.FC<JungGoPodcastProps> = ({
  episodeTitle,
  audioSrc,
}) => {
  const { width, height } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const resolvedAudio = resolveAudioUrl(audioSrc);

  return (
    <PodcastAudioProvider
      audioSrc={resolvedAudio}
      subtitles={ACTIVE_EPISODE.subtitles}
    >
      <AbsoluteFill style={{ backgroundColor: "#0a0e1b" }}>
        {resolvedAudio ? <Audio src={resolvedAudio} /> : null}

        <ThreeCanvas
          width={width}
          height={height}
          shadows={isRendering}
          dpr={isRendering ? 1.25 : 1}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ position: [0.18, 1.58, 3.55], fov: 42, near: 0.1, far: 45 }}
        >
          <color attach="background" args={["#0b1022"]} />
          <fog attach="fog" args={["#10152b", 10.5, 22]} />

          <CameraRig
            sections={ACTIVE_EPISODE.sections}
            subtitles={ACTIVE_EPISODE.subtitles}
          />
          <Studio3D
            sections={ACTIVE_EPISODE.sections}
            subtitles={ACTIVE_EPISODE.subtitles}
          />
        </ThreeCanvas>

        <PresentationBoard
          episodeNumber={ACTIVE_EPISODE.episodeNumber}
          episodeTitle={episodeTitle || ACTIVE_EPISODE.title}
          jlptLevel={ACTIVE_EPISODE.jlptLevel}
          sections={ACTIVE_EPISODE.sections}
          subtitles={ACTIVE_EPISODE.subtitles}
        />

        <Subtitles
          episodeNumber={ACTIVE_EPISODE.episodeNumber}
          episodeTitle={episodeTitle || ACTIVE_EPISODE.title}
          jlptLevel={ACTIVE_EPISODE.jlptLevel}
          sections={ACTIVE_EPISODE.sections}
          subtitles={ACTIVE_EPISODE.subtitles}
        />
      </AbsoluteFill>
    </PodcastAudioProvider>
  );
};
