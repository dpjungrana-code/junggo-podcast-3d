import React, { createContext, useContext } from "react";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { SubtitleCue, getActiveSubtitle } from "../data/demoEpisode";

export type AudioMetrics = {
  /** Normalized 0..1 voice/master energy for current frame */
  readonly volume: number;
  /** Normalized 0..1 low-frequency warmth */
  readonly bass: number;
  /** 24 normalized frequency bars (0..1) for waveform/visualizer */
  readonly spectrum: readonly number[];
  /** Whether a speaker is currently talking */
  readonly isSpeaking: boolean;
};

const DEFAULT_SPECTRUM = new Array<number>(24).fill(0.08);

const AudioMetricsContext = createContext<AudioMetrics>({
  volume: 0.1,
  bass: 0.1,
  spectrum: DEFAULT_SPECTRUM,
  isSpeaking: false,
});

export const usePodcastAudioMetrics = (): AudioMetrics => {
  return useContext(AudioMetricsContext);
};

/**
 * Deterministic speech-cadence audio envelope used as a safe fallback
 * when no audio file is connected yet. Driven strictly by useCurrentFrame().
 */
const computeProceduralAudio = (
  frame: number,
  fps: number,
  subtitles: readonly SubtitleCue[],
): AudioMetrics => {
  const timeSec = frame / fps;
  const activeCue = getActiveSubtitle(subtitles, timeSec);
  const isSpeaking = activeCue !== null;

  if (!isSpeaking || !activeCue) {
    // Gentle room-tone idle hum
    const idle = 0.05 + 0.025 * Math.sin(timeSec * 2.4);
    const spectrum = Array.from({ length: 24 }, (_, i) => {
      const centerWeight = 1 - Math.abs(i - 11.5) / 14;
      return Math.max(
        0.04,
        idle * centerWeight * (0.8 + 0.2 * Math.sin(timeSec * 3.1 + i * 0.7)),
      );
    });
    return {
      volume: idle,
      bass: idle * 0.8,
      spectrum,
      isSpeaking: false,
    };
  }

  // Smooth fade in/out within the active subtitle window
  const cueElapsed = timeSec - activeCue.startSec;
  const cueRemaining = activeCue.endSec - timeSec;
  const envIn = Math.min(1, cueElapsed / 0.18);
  const envOut = Math.min(1, cueRemaining / 0.18);
  const cueEnvelope = Math.max(0, Math.min(envIn, envOut));

  // Multi-harmonic Japanese syllable cadence (~4.5 - 7.5 syllables/sec)
  const syllableWave =
    0.48 +
    0.26 * Math.sin(timeSec * 15.7) +
    0.16 * Math.sin(timeSec * 26.3 + 1.2) +
    0.1 * Math.cos(timeSec * 9.4 + 0.5);

  // Brief natural phrase breath dips
  const phraseBreath = 0.72 + 0.28 * Math.sin(timeSec * 4.2 + 0.4);
  const volume = Math.max(
    0.08,
    Math.min(1, syllableWave * phraseBreath * cueEnvelope * 0.92),
  );
  const bass = Math.max(
    0.06,
    Math.min(1, volume * (0.85 + 0.15 * Math.sin(timeSec * 11.2))),
  );

  const spectrum = Array.from({ length: 24 }, (_, i) => {
    const norm = i / 23;
    // Bell-shaped vocal formant distribution peaking around mid-low frequencies
    const formant =
      Math.exp(-Math.pow((norm - 0.35) / 0.24, 2)) * 0.85 +
      Math.exp(-Math.pow((norm - 0.68) / 0.18, 2)) * 0.45;
    const harmonic =
      0.55 +
      0.45 * Math.sin(timeSec * (13 + i * 1.15) + i * 0.9) *
        Math.cos(timeSec * 6.5 - i * 0.4);
    return Math.max(
      0.06,
      Math.min(1, volume * (0.35 + formant * 0.85) * harmonic),
    );
  });

  return {
    volume,
    bass,
    spectrum,
    isSpeaking: true,
  };
};

type RealAudioProviderProps = {
  readonly audioSrc: string;
  readonly subtitles: readonly SubtitleCue[];
  readonly children: React.ReactNode;
};

const RealAudioProvider: React.FC<RealAudioProviderProps> = ({
  audioSrc,
  subtitles,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  let metrics: AudioMetrics;
  if (!audioData) {
    metrics = computeProceduralAudio(frame, fps, subtitles);
  } else {
    const rawFreqs = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples: 64,
      optimizeFor: "speed",
    });

    const usable = rawFreqs.slice(0, 24);
    const scaled = usable.map((val) => {
      const boosted = Math.pow(Math.min(1, val * 2.8), 0.72);
      return Math.max(0.05, Math.min(1, boosted));
    });

    const sum = scaled.reduce((acc, v) => acc + v, 0);
    const volume = Math.min(1, sum / scaled.length);
    const bassSlice = scaled.slice(0, 6);
    const bass =
      bassSlice.reduce((acc, v) => acc + v, 0) / Math.max(1, bassSlice.length);

    metrics = {
      volume,
      bass,
      spectrum: scaled,
      isSpeaking: volume > 0.14,
    };
  }

  return (
    <AudioMetricsContext.Provider value={metrics}>
      {children}
    </AudioMetricsContext.Provider>
  );
};

type ProceduralAudioProviderProps = {
  readonly subtitles: readonly SubtitleCue[];
  readonly children: React.ReactNode;
};

const ProceduralAudioProvider: React.FC<ProceduralAudioProviderProps> = ({
  subtitles,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const metrics = computeProceduralAudio(frame, fps, subtitles);

  return (
    <AudioMetricsContext.Provider value={metrics}>
      {children}
    </AudioMetricsContext.Provider>
  );
};

type PodcastAudioProviderProps = {
  readonly audioSrc?: string;
  readonly subtitles: readonly SubtitleCue[];
  readonly children: React.ReactNode;
};

/**
 * Provides reactive audio volume & spectrum data to both 3D studio lights/mic
 * and 2D overlays. Uses Remotion's useAudioData() when an audioSrc is provided,
 * and falls back safely to deterministic speech-cadence metrics otherwise.
 */
export const PodcastAudioProvider: React.FC<PodcastAudioProviderProps> = ({
  audioSrc,
  subtitles,
  children,
}) => {
  if (audioSrc && audioSrc.trim().length > 0) {
    return (
      <RealAudioProvider audioSrc={audioSrc} subtitles={subtitles}>
        {children}
      </RealAudioProvider>
    );
  }

  return (
    <ProceduralAudioProvider subtitles={subtitles}>
      {children}
    </ProceduralAudioProvider>
  );
};
