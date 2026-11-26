import { Easing, interpolate, random } from "remotion";
import {
  EpisodeSection,
  HostGazeWeights,
  SubtitleCue,
  computeHostGazeWeights,
  getActiveSection,
  isGuestSpeaker,
  resolveCueGaze,
} from "../data/demoEpisode";

/**
 * Layered Pixar-style gaze & listening behaviour shared by Sensei and Maria.
 *
 * Everything here is a pure function of time (plus memoised schedules built from
 * the episode data), so every rendered frame is deterministic.
 */

/** Eyes arrive ~150ms before the head turns. */
export const EYE_LEAD_SEC = 0.15;
/** The upper torso settles ~120ms after the head (overlapping action). */
export const TORSO_LAG_SEC = 0.12;

/** Audience check-ins while talking to the co-host. */
const CHECK_IN_MIN_INTERVAL_SEC = 3.5;
const CHECK_IN_MAX_INTERVAL_SEC = 5.0;
const CHECK_IN_DURATION_SEC = 0.8;
const CHECK_IN_RAMP_SEC = 0.22;
/** No check-in may finish within this window before the speaker's line ends. */
const CHECK_IN_END_GUARD_SEC = 0.7;

/**
 * How much of a check-in each layer follows: a glance is eye-dominant (eyes land
 * on the lens) while the head only partly opens toward the viewer and the torso
 * barely moves, like a real host glancing at camera mid-conversation.
 */
const CHECK_IN_EYE_SHARE = 1.0;
const CHECK_IN_HEAD_SHARE = 0.4;
const CHECK_IN_TORSO_SHARE = 0.1;

/** Natural blink spacing (seconds between blinks). */
const BLINK_MIN_INTERVAL_SEC = 3.0;
const BLINK_MAX_INTERVAL_SEC = 5.0;
const BLINK_DOUBLE_CHANCE = 0.18;

/** Iris travel per radian of eye-in-head rotation, and the sclera-safe clamp. */
const PUPIL_TRAVEL_PER_RAD = 0.05;
const PUPIL_MAX_OFFSET = 0.0145;

const EASE = Easing.inOut(Easing.cubic);
const GLANCE_EASE = Easing.inOut(Easing.sin);
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export type GazeTargets = {
  readonly camera: number;
  readonly partner: number;
  readonly board: number;
};

export type LayeredGaze = {
  /** Gaze weights for the eyes (sampled `EYE_LEAD_SEC` ahead). */
  readonly eyes: HostGazeWeights;
  /** Gaze weights for the head. */
  readonly head: HostGazeWeights;
  /** Gaze weights for the upper torso (sampled `TORSO_LAG_SEC` behind). */
  readonly torso: HostGazeWeights;
  /** 0..1 audience check-in envelope at the head layer. */
  readonly checkIn: number;
};

/** Weighted blend of per-target world-space angles. */
export const blendGazeTargets = (
  weights: HostGazeWeights,
  targets: GazeTargets,
): number =>
  weights.camera * targets.camera +
  weights.partner * targets.partner +
  weights.board * targets.board;

/** Smooth 0..1 envelope while the given host (`forGuest`) has an active line. */
export const computeSpeakingEnvelope = (
  subtitles: readonly SubtitleCue[] | undefined,
  forGuest: boolean,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }
  let maxWeight = 0;
  for (const cue of subtitles) {
    if (isGuestSpeaker(cue.speaker) !== forGuest) {
      continue;
    }
    if (timeSec < cue.startSec - 0.22 || timeSec > cue.endSec + 0.34) {
      continue;
    }
    const enter = interpolate(
      timeSec,
      [cue.startSec - 0.22, cue.startSec + 0.22],
      [0, 1],
      { ...CLAMP, easing: EASE },
    );
    const exit = interpolate(
      timeSec,
      [cue.endSec - 0.16, cue.endSec + 0.34],
      [1, 0],
      { ...CLAMP, easing: EASE },
    );
    maxWeight = Math.max(maxWeight, Math.min(enter, exit));
  }
  return clamp(maxWeight, 0, 1);
};

/**
 * Deterministic start times of brief (~0.8s) audience check-ins: while a host
 * talks to their co-host, every 3.5–5.0s they glance back to the viewer, just
 * like professional TV / YouTube hosts.
 */
export const buildAudienceCheckIns = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  forGuest: boolean,
): readonly number[] => {
  const starts: number[] = [];
  if (!subtitles || subtitles.length === 0 || sections.length === 0) {
    return starts;
  }
  for (let i = 0; i < subtitles.length; i++) {
    const cue = subtitles[i];
    if (isGuestSpeaker(cue.speaker) !== forGuest) {
      continue;
    }
    const section = getActiveSection(sections, (cue.startSec + cue.endSec) * 0.5);
    if (resolveCueGaze(cue, section, subtitles[i + 1]) !== "partner") {
      continue;
    }
    const interval = (k: number): number =>
      interpolate(
        random(`check-in-${cue.id}-${k}`),
        [0, 1],
        [CHECK_IN_MIN_INTERVAL_SEC, CHECK_IN_MAX_INTERVAL_SEC],
      );
    let k = 0;
    let t = cue.startSec + interval(k);
    while (t + CHECK_IN_DURATION_SEC <= cue.endSec - CHECK_IN_END_GUARD_SEC) {
      starts.push(t);
      k++;
      t += interval(k);
    }
  }
  return starts;
};

/** 0..1 envelope of the audience check-in active at `timeSec`. */
export const computeAudienceCheckIn = (
  checkIns: readonly number[],
  timeSec: number,
): number => {
  let weight = 0;
  for (const start of checkIns) {
    if (start > timeSec) {
      break;
    }
    if (timeSec > start + CHECK_IN_DURATION_SEC) {
      continue;
    }
    weight = Math.max(
      weight,
      interpolate(
        timeSec,
        [
          start,
          start + CHECK_IN_RAMP_SEC,
          start + CHECK_IN_DURATION_SEC - CHECK_IN_RAMP_SEC,
          start + CHECK_IN_DURATION_SEC,
        ],
        [0, 1, 1, 0],
        { ...CLAMP, easing: GLANCE_EASE },
      ),
    );
  }
  return weight;
};

const applyCheckIn = (
  weights: HostGazeWeights,
  checkIn: number,
): HostGazeWeights => {
  const moved = weights.partner * checkIn;
  return {
    camera: weights.camera + moved,
    partner: weights.partner - moved,
    board: weights.board,
  };
};

/**
 * Layered gaze: eyes lead by 150ms, the head follows, the torso settles last.
 * Audience check-ins pull the eyes fully to the lens, the head partway, and
 * the torso only slightly, so the glance reads as natural rather than robotic.
 */
export const computeLayeredGaze = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  timeSec: number,
  checkIns: readonly number[],
): LayeredGaze => {
  const eyeT = timeSec + EYE_LEAD_SEC;
  const torsoT = timeSec - TORSO_LAG_SEC;
  const headCheckIn = computeAudienceCheckIn(checkIns, timeSec);
  return {
    eyes: applyCheckIn(
      computeHostGazeWeights(sections, subtitles, eyeT),
      computeAudienceCheckIn(checkIns, eyeT) * CHECK_IN_EYE_SHARE,
    ),
    head: applyCheckIn(
      computeHostGazeWeights(sections, subtitles, timeSec),
      headCheckIn * CHECK_IN_HEAD_SHARE,
    ),
    torso: applyCheckIn(
      computeHostGazeWeights(sections, subtitles, torsoT),
      computeAudienceCheckIn(checkIns, torsoT) * CHECK_IN_TORSO_SHARE,
    ),
    checkIn: headCheckIn,
  };
};

export type ListenerNod = {
  readonly timeSec: number;
  readonly amplitude: number;
};

/**
 * Deterministic listening nods for the host who is NOT speaking. Nods land on
 * the speaker's acoustic phrase boundaries (pauses in Whisper word timings) and
 * at the end of each turn, with soft fills during long phrases and occasional
 * small double-nods — organic "mm-hm" acknowledgements instead of a metronome.
 */
export const buildListenerNods = (
  subtitles: readonly SubtitleCue[] | undefined,
  listenerIsGuest: boolean,
): readonly ListenerNod[] => {
  const nods: ListenerNod[] = [];
  if (!subtitles || subtitles.length === 0) {
    return nods;
  }
  let lastNodSec = Number.NEGATIVE_INFINITY;
  for (const cue of subtitles) {
    if (isGuestSpeaker(cue.speaker) === listenerIsGuest) {
      continue;
    }
    const candidates: number[] = [];
    const words = cue.wordTimings ?? [];
    for (let i = 0; i + 1 < words.length; i++) {
      if (words[i + 1].startSec - words[i].endSec >= 0.22) {
        candidates.push(words[i].endSec + 0.06);
      }
    }
    candidates.push(cue.endSec + 0.05);

    const withFills: number[] = [];
    let prev = cue.startSec + 0.8;
    for (const c of candidates) {
      while (c - prev > 4.0) {
        prev += 2.4 + random(`nod-fill-${cue.id}-${withFills.length}`) * 1.0;
        withFills.push(prev);
      }
      withFills.push(c);
      prev = c;
    }

    for (const t of withFills) {
      if (t < cue.startSec + 0.8 || t - lastNodSec < 1.3) {
        continue;
      }
      const r = random(`nod-${cue.id}-${t.toFixed(2)}`);
      const amplitude = 0.045 + 0.03 * r;
      nods.push({ timeSec: t, amplitude });
      lastNodSec = t;
      if (r > 0.72) {
        nods.push({ timeSec: t + 0.42, amplitude: amplitude * 0.55 });
        lastNodSec = t + 0.42;
      }
    }
  }
  return nods;
};

/** Head pitch offset (radians, + = down) produced by listening nods at `timeSec`. */
export const computeListenerNodPitch = (
  nods: readonly ListenerNod[],
  timeSec: number,
): number => {
  let pitch = 0;
  for (const nod of nods) {
    if (nod.timeSec > timeSec) {
      break;
    }
    if (timeSec > nod.timeSec + 0.5) {
      continue;
    }
    pitch += nod.amplitude *
      interpolate(
        timeSec,
        [nod.timeSec, nod.timeSec + 0.16, nod.timeSec + 0.5],
        [0, 1, 0],
        { ...CLAMP, easing: EASE },
      );
  }
  return pitch;
};

/** Deterministic irregular blink start times, 3–5s apart, with rare double-blinks. */
export const buildBlinkSchedule = (
  seed: string,
  durationSec: number,
  firstBlinkSec: number,
): readonly number[] => {
  const times: number[] = [];
  let t = firstBlinkSec;
  let i = 0;
  while (t < durationSec + BLINK_MAX_INTERVAL_SEC) {
    times.push(t);
    if (random(`${seed}-blink-double-${i}`) < BLINK_DOUBLE_CHANCE) {
      times.push(t + 0.32);
    }
    t += interpolate(
      random(`${seed}-blink-gap-${i}`),
      [0, 1],
      [BLINK_MIN_INTERVAL_SEC, BLINK_MAX_INTERVAL_SEC],
    );
    i++;
  }
  return times;
};

/** 0 (open) .. 1 (closed) eyelid amount at `timeSec` (~80ms close, ~130ms open). */
export const computeBlinkAmount = (
  schedule: readonly number[],
  timeSec: number,
): number => {
  let amount = 0;
  for (const start of schedule) {
    if (start > timeSec) {
      break;
    }
    if (timeSec > start + 0.26) {
      continue;
    }
    amount = Math.max(
      amount,
      interpolate(
        timeSec,
        [start, start + 0.08, start + 0.12, start + 0.26],
        [0, 1, 1, 0],
        { ...CLAMP, easing: EASE },
      ),
    );
  }
  return amount;
};

/** World-space yaw/pitch from a host's eye line to the camera lens. */
export const computeLensDirection = (
  cameraPos: readonly [number, number, number],
  eyeAnchor: readonly [number, number, number],
): { readonly yaw: number; readonly pitch: number } => {
  const dx = cameraPos[0] - eyeAnchor[0];
  const dy = cameraPos[1] - eyeAnchor[1];
  const dz = cameraPos[2] - eyeAnchor[2];
  return {
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
};

/** Converts an eye-in-head rotation (radians) into a sclera-safe iris offset. */
export const gazeAngleToPupilOffset = (angleRad: number): number =>
  clamp(
    Math.sin(clamp(angleRad, -1.2, 1.2)) * PUPIL_TRAVEL_PER_RAD,
    -PUPIL_MAX_OFFSET,
    PUPIL_MAX_OFFSET,
  );
