import React, { createContext, useContext } from "react";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { SubtitleCue, getActiveSubtitle } from "../data/demoEpisode";

export const SPEECH_RMS_THRESHOLD = 0.035;

export type AudioMetrics = {
  /** Normalized 0..1 FFT spectrum energy */
  readonly volume: number;
  /** True time-domain RMS of the current video frame waveform */
  readonly rms: number;
  /** Deterministic 0..1 release gate strictly requiring recent RMS >= 0.035 */
  readonly rmsGate: number;
  /** Gated active RMS amplitude (exact 0 whenever rmsGate === 0) */
  readonly rmsEnergy: number;
  /** Normalized 0..1 low-frequency warmth */
  readonly bass: number;
  /** 24 normalized frequency bars (0..1) for waveform/visualizer */
  readonly spectrum: readonly number[];
  /** Whether real speech RMS is currently active */
  readonly isSpeaking: boolean;
};

const DEFAULT_SPECTRUM = new Array<number>(24).fill(0.05);

const AudioMetricsContext = createContext<AudioMetrics>({
  volume: 0.05,
  rms: 0,
  rmsGate: 0,
  rmsEnergy: 0,
  bass: 0.05,
  spectrum: DEFAULT_SPECTRUM,
  isSpeaking: false,
});

export const usePodcastAudioMetrics = (): AudioMetrics => {
  return useContext(AudioMetricsContext);
};

export type DualLockMouthMetrics = {
  readonly isCueActive: boolean;
  readonly isSpeakingNow: boolean;
  readonly jawOpen: number;
  readonly mouthWidth: number;
  readonly voiceEnergy: number;
  readonly speechPeak: number;
  readonly windowGate: number;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const getVowelShapeFromRomaji = (
  romajiWord: string,
  progress01: number,
  spectrumContrast: number,
): { readonly openMult: number; readonly widthTarget: number } => {
  const vowels = romajiWord.toLowerCase().match(/[aiueo]/g);
  if (vowels && vowels.length > 0) {
    const idx = Math.min(
      vowels.length - 1,
      Math.max(0, Math.floor(progress01 * vowels.length)),
    );
    switch (vowels[idx]) {
      case "a":
        return { openMult: 1.12, widthTarget: 1.12 };
      case "o":
        return { openMult: 0.96, widthTarget: 0.8 };
      case "e":
        return { openMult: 0.82, widthTarget: 1.24 };
      case "i":
        return { openMult: 0.62, widthTarget: 1.32 };
      case "u":
        return { openMult: 0.66, widthTarget: 0.74 };
      default:
        break;
    }
  }
  return {
    openMult: lerp(0.75, 1.05, spectrumContrast),
    widthTarget: lerp(0.84, 1.24, spectrumContrast),
  };
};

/**
 * Dual-Lock Silence-Gated Lip-Sync helper shared by both 3D hosts.
 * Strictly locks jaw opening to BOTH:
 * 1) Active Whisper/script speech window (`wordTimings` when available), AND
 * 2) Real-time acoustic RMS gate (`rms >= SPEECH_RMS_THRESHOLD`), closing smoothly
 *    within 2–3 frames (`jawOpen === 0`) on any silence or inter-word pause.
 */
export const computeDualLockMouthMetrics = (
  subtitles: readonly SubtitleCue[] | undefined,
  forGuest: boolean,
  timeSec: number,
  fps: number,
  audio: AudioMetrics,
  isGuestFn: (speaker: string) => boolean,
): DualLockMouthMetrics => {
  if (!subtitles || subtitles.length === 0) {
    return {
      isCueActive: false,
      isSpeakingNow: false,
      jawOpen: 0,
      mouthWidth: 1.06,
      voiceEnergy: 0,
      speechPeak: 0,
      windowGate: 0,
    };
  }

  let activeCue: SubtitleCue | null = null;
  let recentEndedCue: SubtitleCue | null = null;
  const releaseTailSec = 2.5 / Math.max(1, fps);

  for (const cue of subtitles) {
    if (isGuestFn(cue.speaker) !== forGuest) {
      continue;
    }
    if (timeSec >= cue.startSec && timeSec <= cue.endSec) {
      activeCue = cue;
      break;
    }
    if (timeSec > cue.endSec && timeSec - cue.endSec <= releaseTailSec) {
      recentEndedCue = cue;
    }
  }

  let windowGate = 0;
  let activeWordRomaji = "";
  let wordProgress = 0.5;

  const targetCue = activeCue ?? recentEndedCue;
  if (targetCue) {
    const words = targetCue.wordTimings;
    if (words && words.length > 0) {
      const leadPad = 0.018;
      const wordTail = 0.075;
      for (const w of words) {
        if (timeSec >= w.startSec - leadPad && timeSec <= w.endSec + wordTail) {
          let wEnv = 1;
          if (timeSec < w.startSec) {
            wEnv = clamp01((timeSec - (w.startSec - leadPad)) / leadPad);
          } else if (timeSec > w.endSec) {
            wEnv = clamp01(1 - (timeSec - w.endSec) / wordTail);
          }
          if (wEnv > windowGate) {
            windowGate = wEnv;
            activeWordRomaji = w.romaji ?? "";
            wordProgress = clamp01(
              (timeSec - w.startSec) / Math.max(0.04, w.endSec - w.startSec),
            );
          }
        }
      }
    } else if (activeCue) {
      const envIn = clamp01((timeSec - activeCue.startSec) / 0.055);
      const envOut = clamp01((activeCue.endSec - timeSec) / 0.065);
      windowGate = Math.min(envIn, envOut);
    } else if (recentEndedCue) {
      windowGate = clamp01(
        1 - (timeSec - recentEndedCue.endSec) / releaseTailSec,
      );
    }
  }

  const dualLockGate = clamp01(windowGate * audio.rmsGate);
  const lowBand =
    audio.spectrum.slice(0, 4).reduce((acc, v) => acc + v, 0) / 4;
  const midBand =
    audio.spectrum.slice(4, 14).reduce((acc, v) => acc + v, 0) / 10;
  const vowelContrast = clamp01(0.5 + (midBand - lowBand) * 1.8);

  if (dualLockGate <= 0.01) {
    return {
      isCueActive: activeCue !== null,
      isSpeakingNow: false,
      jawOpen: 0,
      mouthWidth: 1.06,
      voiceEnergy: 0,
      speechPeak: 0,
      windowGate,
    };
  }

  const { openMult, widthTarget } = getVowelShapeFromRomaji(
    activeWordRomaji,
    wordProgress,
    vowelContrast,
  );
  const jawOpen = clamp01(
    Math.pow(Math.max(audio.rmsEnergy, 0.26), 0.72) * openMult * dualLockGate,
  );
  const mouthWidth = lerp(1.06, widthTarget, clamp01(dualLockGate * 0.95));
  const voiceEnergy = clamp01(audio.rmsEnergy * 1.15 * dualLockGate);
  const speechPeak = clamp01((voiceEnergy - 0.28) * 1.5);

  return {
    isCueActive: activeCue !== null,
    isSpeakingNow: jawOpen > 0.05,
    jawOpen: jawOpen > 0.05 ? jawOpen : 0,
    mouthWidth,
    voiceEnergy,
    speechPeak,
    windowGate,
  };
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const computeFrameRms = (
  audioData: NonNullable<ReturnType<typeof useAudioData>>,
  targetFrame: number,
  fps: number,
): number => {
  const waveform = audioData.channelWaveforms[0];
  if (!waveform || waveform.length === 0 || targetFrame < 0) {
    return 0;
  }
  const sampleRate = audioData.sampleRate || 44100;
  const startSample = Math.max(
    0,
    Math.floor((targetFrame / fps) * sampleRate),
  );
  const endSample = Math.min(
    waveform.length,
    Math.ceil(((targetFrame + 1) / fps) * sampleRate),
  );
  if (endSample <= startSample) {
    return 0;
  }
  let sumSq = 0;
  for (let i = startSample; i < endSample; i++) {
    const s = waveform[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / (endSample - startSample));
};

/**
 * Deterministic speech-cadence envelope used ONLY as a safe fallback
 * when no audio file is connected. Driven strictly by useCurrentFrame().
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
    const idle = 0.05 + 0.02 * Math.sin(timeSec * 2.4);
    const spectrum = Array.from({ length: 24 }, (_, i) => {
      const centerWeight = 1 - Math.abs(i - 11.5) / 14;
      return Math.max(
        0.04,
        idle * centerWeight * (0.8 + 0.2 * Math.sin(timeSec * 3.1 + i * 0.7)),
      );
    });
    return {
      volume: idle,
      rms: 0,
      rmsGate: 0,
      rmsEnergy: 0,
      bass: idle * 0.8,
      spectrum,
      isSpeaking: false,
    };
  }

  const cueElapsed = timeSec - activeCue.startSec;
  const cueRemaining = activeCue.endSec - timeSec;
  const envIn = Math.min(1, cueElapsed / 0.12);
  const envOut = Math.min(1, cueRemaining / 0.12);
  const cueEnvelope = Math.max(0, Math.min(envIn, envOut));

  const syllableWave =
    0.48 +
    0.26 * Math.sin(timeSec * 15.7) +
    0.16 * Math.sin(timeSec * 26.3 + 1.2) +
    0.1 * Math.cos(timeSec * 9.4 + 0.5);

  const phraseBreath = 0.72 + 0.28 * Math.sin(timeSec * 4.2 + 0.4);
  const volume = clamp01(syllableWave * phraseBreath * cueEnvelope * 0.9);
  const rms = volume * 0.18;
  const rmsGate = rms >= SPEECH_RMS_THRESHOLD ? 1 : 0;
  const rmsEnergy = rmsGate > 0 ? clamp01((rms - 0.025) / 0.16) * rmsGate : 0;
  const bass = Math.max(
    0.05,
    Math.min(1, volume * (0.85 + 0.15 * Math.sin(timeSec * 11.2))),
  );

  const spectrum = Array.from({ length: 24 }, (_, i) => {
    const norm = i / 23;
    const formant =
      Math.exp(-Math.pow((norm - 0.35) / 0.24, 2)) * 0.85 +
      Math.exp(-Math.pow((norm - 0.68) / 0.18, 2)) * 0.45;
    const harmonic =
      0.55 +
      0.45 *
        Math.sin(timeSec * (13 + i * 1.15) + i * 0.9) *
        Math.cos(timeSec * 6.5 - i * 0.4);
    return Math.max(
      0.05,
      Math.min(1, volume * (0.35 + formant * 0.85) * harmonic),
    );
  });

  return {
    volume,
    rms,
    rmsGate,
    rmsEnergy,
    bass,
    spectrum,
    isSpeaking: rmsGate > 0.01,
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

    // Exact time-domain RMS over [frame, frame-1, frame-2] for crisp 2-3 frame closure
    const rms0 = computeFrameRms(audioData, frame, fps);
    const rms1 = computeFrameRms(audioData, frame - 1, fps);
    const rms2 = computeFrameRms(audioData, frame - 2, fps);

    let rmsGate = 0;
    let activeRms = rms0;
    if (rms0 >= SPEECH_RMS_THRESHOLD) {
      rmsGate = 1;
      activeRms = rms0;
    } else if (rms1 >= SPEECH_RMS_THRESHOLD) {
      rmsGate = 0.52;
      activeRms = rms1;
    } else if (rms2 >= SPEECH_RMS_THRESHOLD) {
      rmsGate = 0.2;
      activeRms = rms2;
    }

    const rmsEnergy =
      rmsGate > 0 ? clamp01((activeRms - 0.025) / 0.16) * rmsGate : 0;

    metrics = {
      volume,
      rms: rms0,
      rmsGate,
      rmsEnergy,
      bass,
      spectrum: scaled,
      isSpeaking: rmsGate > 0.01,
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
 * Provides reactive time-domain RMS & FFT spectrum metrics to both 3D studio
 * hosts/lights and 2D overlays via Remotion `useAudioData()`.
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
