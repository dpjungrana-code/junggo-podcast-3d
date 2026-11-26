import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, spring } from "remotion";
import {
  EpisodeSection,
  HostGestureType,
  SubtitleCue,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";

export type PixarHand3DProps = {
  readonly side: "left" | "right";
  readonly skinColor?: string;
  readonly scale?: number;
  /** 0 = fully open straight fingers, 1 = gently curled fist; ~0.50 is relaxed rest */
  readonly fingerCurl: number;
  /** 0 = fingers neatly together (polite Japanese presentation), 1 = gently fanned open palm */
  readonly fingerSpread: number;
  /** 0 = thumb relaxed open, 1 = thumb tucked softly inward */
  readonly thumbCurl: number;
};

type FingerSpec = {
  readonly key: string;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly zOffset: number;
  readonly proxRadius: number;
  readonly proxLen: number;
  readonly distRadius: number;
  readonly distLen: number;
  readonly spreadFactor: number;
  readonly curlOffset: number;
};

const FINGER_SPECS: readonly FingerSpec[] = [
  {
    key: "index",
    xOffset: 0.031,
    yOffset: -0.06,
    zOffset: 0.005,
    proxRadius: 0.0108,
    proxLen: 0.024,
    distRadius: 0.0095,
    distLen: 0.019,
    spreadFactor: 1.0,
    curlOffset: 0.0,
  },
  {
    key: "middle",
    xOffset: 0.01,
    yOffset: -0.064,
    zOffset: 0.006,
    proxRadius: 0.0112,
    proxLen: 0.028,
    distRadius: 0.0098,
    distLen: 0.021,
    spreadFactor: 0.28,
    curlOffset: 0.06,
  },
  {
    key: "ring",
    xOffset: -0.011,
    yOffset: -0.062,
    zOffset: 0.004,
    proxRadius: 0.0104,
    proxLen: 0.025,
    distRadius: 0.0091,
    distLen: 0.019,
    spreadFactor: -0.32,
    curlOffset: 0.12,
  },
  {
    key: "pinky",
    xOffset: -0.03,
    yOffset: -0.056,
    zOffset: 0.001,
    proxRadius: 0.0092,
    proxLen: 0.019,
    distRadius: 0.0082,
    distLen: 0.015,
    spreadFactor: -1.0,
    curlOffset: 0.18,
  },
];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Sculpted Pixar-style 5-finger hand with softly rounded palm, thenar cushion,
 * opposable 2-segment thumb, and 4 graduated 2-segment articulated fingers.
 *
 * Local anatomy (palm faces +Z, fingers extend along -Y):
 * - Left hand (`side="left"`): thumb on +X (upward when presenting open palm right)
 * - Right hand (`side="right"`): thumb on -X (mirror symmetric)
 * - Negative X-rotation curls fingers forward (+Z) into the palm naturally.
 */
export const PixarHand3D: React.FC<PixarHand3DProps> = ({
  side,
  skinColor = "#ffd2b0",
  scale = 1,
  fingerCurl,
  fingerSpread,
  thumbCurl,
}) => {
  const thumbSign = side === "left" ? 1 : -1;
  const curl = clamp01(fingerCurl);
  const spread = clamp01(fingerSpread);
  const tCurl = clamp01(thumbCurl);

  const resources = useMemo(() => {
    const palmGeo = new THREE.SphereGeometry(0.048, 16, 12);
    const thenarGeo = new THREE.SphereGeometry(0.025, 10, 8);
    const thumbProxGeo = new THREE.CapsuleGeometry(0.0128, 0.02, 5, 10);
    const thumbDistGeo = new THREE.CapsuleGeometry(0.0112, 0.017, 5, 10);
    const fingerGeos = FINGER_SPECS.map((spec) => ({
      prox: new THREE.CapsuleGeometry(spec.proxRadius, spec.proxLen, 5, 8),
      dist: new THREE.CapsuleGeometry(spec.distRadius, spec.distLen, 5, 8),
    }));

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.48,
      sheen: 0.18,
      sheenRoughness: 0.78,
      sheenColor: "#ffe8d6",
    });

    return {
      palmGeo,
      thenarGeo,
      thumbProxGeo,
      thumbDistGeo,
      fingerGeos,
      skinMat,
    };
  }, [skinColor]);

  useEffect(() => {
    return () => {
      resources.palmGeo.dispose();
      resources.thenarGeo.dispose();
      resources.thumbProxGeo.dispose();
      resources.thumbDistGeo.dispose();
      for (const fg of resources.fingerGeos) {
        fg.prox.dispose();
        fg.dist.dispose();
      }
      resources.skinMat.dispose();
    };
  }, [resources]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Softly rounded sculpted palm */}
      <mesh
        position={[0, -0.029, 0]}
        scale={[1.08, 0.94, 0.56]}
        geometry={resources.palmGeo}
        material={resources.skinMat}
        castShadow
      />

      {/* Subtle thenar thumb-base muscle cushion */}
      <mesh
        position={[thumbSign * 0.024, -0.026, 0.012]}
        scale={[0.85, 0.94, 0.72]}
        geometry={resources.thenarGeo}
        material={resources.skinMat}
        castShadow
      />

      {/* Opposable 2-segment thumb angled naturally inward */}
      <group
        position={[thumbSign * 0.043, -0.023, 0.013]}
        rotation={[
          -0.22 - tCurl * 0.34,
          -thumbSign * (0.38 + tCurl * 0.24),
          thumbSign * (0.58 - tCurl * 0.22 + spread * 0.12),
        ]}
      >
        <mesh
          position={[0, -0.015, 0]}
          geometry={resources.thumbProxGeo}
          material={resources.skinMat}
          castShadow
        />
        <group
          position={[0, -0.031, 0]}
          rotation={[-0.18 - tCurl * 0.45, 0, -thumbSign * 0.12]}
        >
          <mesh
            position={[0, -0.012, 0]}
            geometry={resources.thumbDistGeo}
            material={resources.skinMat}
            castShadow
          />
        </group>
      </group>

      {/* 4 graduated 2-segment articulated fingers (Index, Middle, Ring, Pinky) */}
      {FINGER_SPECS.map((spec, idx) => {
        const fingerBaseCurl = clamp01(curl + spec.curlOffset * (0.35 + curl * 0.65));
        const proxRotX = -(0.06 + fingerBaseCurl * 0.82);
        const distRotX = -(0.08 + fingerBaseCurl * 0.95);
        const spreadZ =
          thumbSign * spec.spreadFactor * (0.03 + spread * 0.135);
        const proxHalf = spec.proxLen * 0.5 + spec.proxRadius * 0.55;
        const distHalf = spec.distLen * 0.5 + spec.distRadius * 0.5;

        return (
          <group
            key={spec.key}
            position={[thumbSign * spec.xOffset, spec.yOffset, spec.zOffset]}
            rotation={[proxRotX, 0, spreadZ]}
          >
            <mesh
              position={[0, -proxHalf, 0]}
              geometry={resources.fingerGeos[idx].prox}
              material={resources.skinMat}
              castShadow
            />
            <group
              position={[0, -(spec.proxLen + spec.proxRadius * 1.05), 0]}
              rotation={[distRotX, 0, 0]}
            >
              <mesh
                position={[0, -distHalf, 0]}
                geometry={resources.fingerGeos[idx].dist}
                material={resources.skinMat}
                castShadow
              />
            </group>
          </group>
        );
      })}
    </group>
  );
};

export type CalmGestureEnvelopes = {
  /** Slow heavily damped spring 0..1 envelope for polite `point_board` presentation */
  readonly pointBoardWeight: number;
  /** Slow smooth 0..1 envelope for `thinking` pose */
  readonly thinkingWeight: number;
  /** Smooth 0..1 envelope for warm `nod_encourage` praise */
  readonly nodEncourageWeight: number;
  /** Phrase-level calm open-palm emphasis (active ~30-35% of speaking cues; 0 when listening) */
  readonly calmEmphasisWeight: number;
};

const findSectionAtTime = (
  sections: readonly EpisodeSection[],
  timeSec: number,
): EpisodeSection | undefined => {
  for (const section of sections) {
    if (timeSec >= section.startSec && timeSec < section.endSec) {
      return section;
    }
  }
  return sections[sections.length - 1];
};

const computeDampedSpringGestureWeight = (
  frame: number,
  fps: number,
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  targetGesture: HostGestureType,
  forGuest: boolean,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }

  const rawWindows: [number, number][] = [];
  for (const cue of subtitles) {
    const midSec = (cue.startSec + cue.endSec) * 0.5;
    const sectionForCue = findSectionAtTime(sections, midSec);
    if (resolveCueGesture(cue, sectionForCue, forGuest) === targetGesture) {
      rawWindows.push([cue.startSec, cue.endSec]);
    }
  }

  if (rawWindows.length === 0) {
    return 0;
  }

  // Merge closely consecutive cues of the same gesture so the arm never dips & bounces
  const merged: [number, number][] = [];
  for (const [start, end] of rawWindows) {
    const prev = merged[merged.length - 1];
    if (prev && start - prev[1] <= 0.75) {
      prev[1] = Math.max(prev[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  let maxWeight = 0;
  for (const [startSec, endSec] of merged) {
    const startFrame = Math.round((startSec - 0.1) * fps);
    const endFrame = Math.round((endSec - 0.08) * fps);
    if (frame < startFrame || frame > endFrame + Math.round(fps * 1.4)) {
      continue;
    }
    const enter = spring({
      frame: Math.max(0, frame - startFrame),
      fps,
      config: { damping: 24, stiffness: 52, mass: 1.25 },
    });
    const exit =
      frame >= endFrame
        ? 1 -
          spring({
            frame: frame - endFrame,
            fps,
            config: { damping: 26, stiffness: 46, mass: 1.3 },
          })
        : 1;
    maxWeight = Math.max(maxWeight, Math.min(enter, exit));
  }

  return clamp01(maxWeight);
};

/**
 * Computes calm, phrase-level upper-body gesture envelopes ("less-is-more"):
 * - Hands rest calmly ~65-70% of the time during speaking and 100% during listening.
 * - Emphasis gestures appear only briefly on selected key phrases with slow,
 *   heavily damped transitions (zero per-syllable audio jitter).
 */
export const computeCalmGestureEnvelopes = (
  frame: number,
  fps: number,
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  forGuest: boolean,
): CalmGestureEnvelopes => {
  const timeSec = frame / fps;
  const pointBoardWeight = computeDampedSpringGestureWeight(
    frame,
    fps,
    sections,
    subtitles,
    "point_board",
    forGuest,
  );
  const thinkingWeight = computeDampedSpringGestureWeight(
    frame,
    fps,
    sections,
    subtitles,
    "thinking",
    forGuest,
  );
  const nodEncourageWeight = computeDampedSpringGestureWeight(
    frame,
    fps,
    sections,
    subtitles,
    "nod_encourage",
    forGuest,
  );

  let calmEmphasisWeight = 0;
  if (subtitles && subtitles.length > 0) {
    let speakerCueIndex = 0;
    for (const cue of subtitles) {
      if (isGuestSpeaker(cue.speaker) !== forGuest) {
        continue;
      }
      const idxForSpeaker = speakerCueIndex++;
      const midSec = (cue.startSec + cue.endSec) * 0.5;
      const sectionForCue = findSectionAtTime(sections, midSec);
      const gesture = resolveCueGesture(cue, sectionForCue, forGuest);

      // Skip when another explicit gesture owns the cue, or on alternating calm-rest cues
      if (gesture === "point_board" || gesture === "thinking") {
        continue;
      }
      const isKeyEmphasisCue =
        gesture === "nod_encourage" || idxForSpeaker % 2 === 0;
      if (!isKeyEmphasisCue) {
        continue;
      }

      const cueDur = cue.endSec - cue.startSec;
      if (cueDur < 1.6) {
        continue;
      }

      // Brief, unhurried mid-phrase gesture window (~35% of speaking duration)
      const gStart = cue.startSec + Math.min(1.1, cueDur * 0.16);
      const gEnd = Math.min(cue.endSec - 0.55, gStart + Math.min(3.2, cueDur * 0.42));
      if (gEnd <= gStart + 0.5) {
        continue;
      }

      const enter = interpolate(timeSec, [gStart, gStart + 0.65], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      });
      const exit = interpolate(timeSec, [gEnd - 0.65, gEnd], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      });
      calmEmphasisWeight = Math.max(calmEmphasisWeight, Math.min(enter, exit));
    }
  }

  return {
    pointBoardWeight,
    thinkingWeight,
    nodEncourageWeight,
    calmEmphasisWeight: clamp01(calmEmphasisWeight * (1 - pointBoardWeight)),
  };
};
