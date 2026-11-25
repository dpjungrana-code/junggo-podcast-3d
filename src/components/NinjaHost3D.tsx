import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  HostGestureType,
  PodcastSectionType,
  SubtitleCue,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";
import { createHoodieLogoTexture } from "../utils/textures";

export type NinjaHost3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const computeSectionWeight = (
  sections: readonly EpisodeSection[],
  types: readonly PodcastSectionType[],
  timeSec: number,
  fadeSec = 0.6,
): number => {
  let maxWeight = 0;
  for (const section of sections) {
    if (!types.includes(section.type)) {
      continue;
    }
    const enter = interpolate(
      timeSec,
      [section.startSec - fadeSec * 0.25, section.startSec + fadeSec * 0.75],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [section.endSec - fadeSec * 0.65, section.endSec + fadeSec * 0.25],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    maxWeight = Math.max(maxWeight, Math.min(enter, exit));
  }
  return clamp01(maxWeight);
};

const computeDialogueGuestWeight = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }
  const dialogueWeight = computeSectionWeight(sections, ["dialogue"], timeSec);
  if (dialogueWeight <= 0.005) {
    return 0;
  }

  let guestWeight = 0;
  for (const cue of subtitles) {
    if (!isGuestSpeaker(cue.speaker)) {
      continue;
    }
    const enter = interpolate(
      timeSec,
      [cue.startSec - 0.3, cue.startSec + 0.25],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [cue.endSec - 0.25, cue.endSec + 0.35],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    guestWeight = Math.max(guestWeight, Math.min(enter, exit));
  }

  return clamp01(dialogueWeight * guestWeight);
};

const computeQuizRevealWeight = (
  sections: readonly EpisodeSection[],
  timeSec: number,
): number => {
  let maxReveal = 0;
  for (const section of sections) {
    if (section.type !== "quiz" || !section.quiz) {
      continue;
    }
    const reveal = interpolate(
      timeSec,
      [section.quiz.revealSec - 0.1, section.quiz.revealSec + 0.35],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [section.endSec - 0.4, section.endSec + 0.15],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      },
    );
    maxReveal = Math.max(maxReveal, Math.min(reveal, exit));
  }
  return clamp01(maxReveal);
};

const findSectionAt = (
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

/**
 * Computes a smooth 0..1 envelope for an explicit or keyword-inferred teaching gesture
 * across all subtitle cues so transitions ramp cleanly without frame pops.
 */
const computeGestureWeight = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  targetGesture: HostGestureType,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }

  let maxWeight = 0;
  for (const cue of subtitles) {
    const midSec = (cue.startSec + cue.endSec) * 0.5;
    const sectionForCue = findSectionAt(sections, midSec);
    if (resolveCueGesture(cue, sectionForCue) !== targetGesture) {
      continue;
    }

    const enter = interpolate(
      timeSec,
      [cue.startSec - 0.16, cue.startSec + 0.22],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [cue.endSec - 0.12, cue.endSec + 0.33],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    maxWeight = Math.max(maxWeight, Math.min(enter, exit));
  }

  return clamp01(maxWeight);
};

type StylizedEyeProps = {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly blinkAmount: number;
  readonly pupilOffsetX: number;
  readonly pupilOffsetY: number;
  readonly browRaise: number;
  readonly browTilt: number;
};

/**
 * Multi-layered 3D anime-style Pixar eye matching the warm reference character,
 * with smooth 3D upper & lower eyelids for 96-frame blinking and subtle gaze shifts.
 */
const StylizedEye3D: React.FC<StylizedEyeProps> = ({
  name,
  position,
  rotation,
  blinkAmount,
  pupilOffsetX,
  pupilOffsetY,
  browRaise,
  browTilt,
}) => {
  const upperLidScaleY = lerp(0.01, 1.0, blinkAmount);
  const lowerLidLift = blinkAmount * 0.015;
  const closedLineVisible = blinkAmount > 0.45;

  return (
    <group
      name={name}
      position={[position[0], position[1], position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
      {/* Expressive dark-brown eyebrow cleanly above the eye */}
      <mesh
        position={[0, 0.068 + browRaise, 0.018]}
        rotation={[0, 0, Math.PI / 2 + browTilt]}
        castShadow
      >
        <capsuleGeometry args={[0.007, 0.056, 4, 8]} />
        <meshStandardMaterial color="#1f1512" roughness={0.58} />
      </mesh>

      {/* Glossy white sclera */}
      <mesh scale={[1.0, 1.06, 0.34]}>
        <sphereGeometry args={[0.052, 18, 14]} />
        <meshStandardMaterial color="#fcfdff" roughness={0.2} />
      </mesh>

      {/* Bold upper lash arch */}
      <mesh
        position={[0, 0.004, 0.011]}
        rotation={[0, 0, 0.14]}
        scale={[1.02, 1.06, 0.7]}
      >
        <torusGeometry args={[0.052, 0.006, 6, 16, Math.PI * 0.84]} />
        <meshStandardMaterial color="#161113" roughness={0.38} />
      </mesh>

      {/* Movable Iris, Pupil, and Catchlights */}
      <group position={[pupilOffsetX, pupilOffsetY, 0.0185]}>
        <mesh>
          <circleGeometry args={[0.0365, 20]} />
          <meshStandardMaterial color="#241008" roughness={0.26} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.033, 20]} />
          <meshStandardMaterial color="#613118" roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.009, 0.002]} scale={[0.92, 0.72, 1]}>
          <circleGeometry args={[0.022, 16]} />
          <meshStandardMaterial
            color="#ad642d"
            emissive="#54270a"
            emissiveIntensity={0.35}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 0.001, 0.003]}>
          <circleGeometry args={[0.0165, 16]} />
          <meshStandardMaterial color="#090605" roughness={0.12} />
        </mesh>
        <mesh position={[-0.0115, 0.0125, 0.0042]}>
          <circleGeometry args={[0.0092, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.6}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0.0125, -0.0115, 0.0042]}>
          <circleGeometry args={[0.0045, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.48}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* 3D Upper Eyelid Pivot */}
      {blinkAmount > 0.02 && (
        <group position={[0, 0.058, 0.011]} scale={[1, upperLidScaleY, 1]}>
          <mesh position={[0, -0.056, 0]} scale={[1.06, 1.06, 0.36]}>
            <sphereGeometry args={[0.054, 14, 10]} />
            <meshStandardMaterial color="#ffd4b5" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Friendly curved dark closed-eye lash line */}
      {closedLineVisible && (
        <mesh
          position={[0, -0.015, 0.03]}
          rotation={[0, 0, Math.PI * 1.15]}
          scale={[1.05, 0.42, 0.6]}
        >
          <torusGeometry args={[0.045, 0.0056, 6, 14, Math.PI * 0.7]} />
          <meshStandardMaterial color="#161113" roughness={0.4} />
        </mesh>
      )}

      {/* Subtle Lower Eyelid Cushion */}
      {blinkAmount > 0.02 && (
        <mesh
          position={[0, -0.052 + lowerLidLift, 0.013]}
          scale={[1.05, 0.25, 0.38]}
        >
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshStandardMaterial color="#fcccb0" roughness={0.52} />
        </mesh>
      )}
    </group>
  );
};

type ArticulatedArmProps = {
  readonly name: string;
  readonly side: "left" | "right";
  readonly shoulderPosition: readonly [number, number, number];
  readonly shoulderRotation: readonly [number, number, number];
  readonly elbowRotation: readonly [number, number, number];
  readonly wristRotation: readonly [number, number, number];
  readonly indexCurl: number;
  readonly otherFingersCurl: number;
};

/**
 * Smooth articulated emerald hoodie sleeve, black ninja wrist wrap, and sculpted warm peach hand
 * with shoulder, elbow, wrist, and finger pivots.
 */
const ArticulatedArm3D: React.FC<ArticulatedArmProps> = ({
  name,
  side,
  shoulderPosition,
  shoulderRotation,
  elbowRotation,
  wristRotation,
  indexCurl,
  otherFingersCurl,
}) => {
  const thumbSign = side === "left" ? -1 : 1;

  return (
    <group
      name={name}
      position={[shoulderPosition[0], shoulderPosition[1], shoulderPosition[2]]}
      rotation={[shoulderRotation[0], shoulderRotation[1], shoulderRotation[2]]}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.086, 14, 10]} />
        <meshStandardMaterial color="#11834b" roughness={0.74} />
      </mesh>

      <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.071, 0.14, 6, 12]} />
        <meshStandardMaterial color="#11834b" roughness={0.74} />
      </mesh>

      <group
        position={[0, -0.2, 0]}
        rotation={[elbowRotation[0], elbowRotation[1], elbowRotation[2]]}
      >
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial color="#0f7845" roughness={0.76} />
        </mesh>

        <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.066, 0.125, 6, 12]} />
          <meshStandardMaterial color="#11834b" roughness={0.74} />
        </mesh>

        {/* Ribbed emerald wrist cuff */}
        <mesh position={[0, -0.165, 0]} castShadow>
          <cylinderGeometry args={[0.059, 0.052, 0.036, 14]} />
          <meshStandardMaterial color="#0c5e36" roughness={0.82} />
        </mesh>

        {/* Matte-black ninja wrist wrap */}
        <mesh position={[0, -0.194, 0]} castShadow>
          <cylinderGeometry args={[0.044, 0.04, 0.034, 14]} />
          <meshStandardMaterial color="#171b22" roughness={0.72} />
        </mesh>

        {/* Wrist & Expressive Peach Pixar Hand */}
        <group
          position={[0, -0.214, 0]}
          rotation={[wristRotation[0], wristRotation[1], wristRotation[2]]}
        >
          <mesh position={[0, -0.022, 0]} scale={[1.05, 0.92, 0.72]} castShadow>
            <sphereGeometry args={[0.052, 12, 10]} />
            <meshStandardMaterial color="#ffd0ae" roughness={0.5} />
          </mesh>

          <group
            position={[thumbSign * 0.04, -0.015, 0.018]}
            rotation={[0.25, thumbSign * 0.35, thumbSign * 0.65]}
          >
            <mesh position={[0, -0.02, 0]} castShadow>
              <capsuleGeometry args={[0.014, 0.026, 4, 8]} />
              <meshStandardMaterial color="#ffd0ae" roughness={0.5} />
            </mesh>
          </group>

          <group
            position={[thumbSign * 0.022, -0.052, 0.008]}
            rotation={[indexCurl, 0, thumbSign * 0.06]}
          >
            <mesh position={[0, -0.024, 0]} castShadow>
              <capsuleGeometry args={[0.013, 0.034, 4, 8]} />
              <meshStandardMaterial color="#ffd3b2" roughness={0.5} />
            </mesh>
          </group>

          <group
            position={[-thumbSign * 0.015, -0.052, 0.004]}
            rotation={[otherFingersCurl, 0, -thumbSign * 0.05]}
          >
            <mesh position={[thumbSign * 0.013, -0.023, 0.003]} castShadow>
              <capsuleGeometry args={[0.0125, 0.032, 4, 8]} />
              <meshStandardMaterial color="#ffd0ae" roughness={0.5} />
            </mesh>
            <mesh position={[-thumbSign * 0.01, -0.021, 0]} castShadow>
              <capsuleGeometry args={[0.012, 0.028, 4, 8]} />
              <meshStandardMaterial color="#ffd0ae" roughness={0.5} />
            </mesh>
            <mesh position={[-thumbSign * 0.03, -0.017, -0.004]} castShadow>
              <capsuleGeometry args={[0.0105, 0.022, 4, 8]} />
              <meshStandardMaterial color="#fcc8a4" roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};

/**
 * Pixar-Chibi 3D JungGo Ninja Host Character matched A-to-Z to `public/images/studio-reference.jpg`.
 * Vibrant emerald hoodie, warm peach chibi face with rosy cheeks & D-shaped lip-sync mouth,
 * gold-trimmed matte-black studio headphones, green headband with flowing tails, 96-frame
 * natural blinking, and expressive teacher-like hand/finger gestures.
 */
export const NinjaHost3D: React.FC<NinjaHost3DProps> = ({
  sections,
  subtitles,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();

  const activeSection = getActiveSection(sections, timeSec);
  const activeCue = subtitles ? getActiveSubtitle(subtitles, timeSec) : null;

  const isHostCueActive =
    activeCue !== null ? !isGuestSpeaker(activeCue.speaker) : audio.isSpeaking;
  const isHostSpeaking = audio.isSpeaking && isHostCueActive;

  const quietFallback = 0.05 + 0.035 * Math.sin(timeSec * 1.9);
  const voiceEnergy = isHostSpeaking
    ? Math.max(0.15, audio.volume)
    : quietFallback * 0.65;

  // Expressive syllable-synced lip-sync aperture & rounding
  const syllableWave =
    0.55 +
    0.28 * Math.sin(timeSec * 16.5) +
    0.17 * Math.cos(timeSec * 23.4 + 0.8);
  const mouthOpen = isHostSpeaking
    ? clamp01(voiceEnergy * (0.48 + 0.72 * syllableWave))
    : 0;
  const mouthWidth = isHostSpeaking
    ? lerp(0.88, 1.18, 0.5 + 0.5 * Math.cos(timeSec * 11.4))
    : 0.92;

  const vocabWeight = computeSectionWeight(
    sections,
    ["vocabulary", "grammar", "kanji_lesson"],
    timeSec,
  );
  const quizWeight = computeSectionWeight(sections, ["quiz"], timeSec);
  const dialogueGuestWeight = computeDialogueGuestWeight(
    sections,
    subtitles,
    timeSec,
  );
  const quizRevealWeight = computeQuizRevealWeight(sections, timeSec);

  const pointBoardWeight = computeGestureWeight(
    sections,
    subtitles,
    "point_board",
    timeSec,
  );
  const nodEncourageWeight = clamp01(
    Math.max(
      computeGestureWeight(sections, subtitles, "nod_encourage", timeSec),
      quizRevealWeight * 0.9,
    ),
  );
  const thinkingWeight = clamp01(
    Math.max(
      computeGestureWeight(sections, subtitles, "thinking", timeSec),
      quizWeight * (1 - quizRevealWeight) * 0.85,
    ),
  );

  const logoTexture = useMemo(() => createHoodieLogoTexture(), []);

  const torsoGeometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(0.0, -0.05),
      new THREE.Vector2(0.268, -0.05),
      new THREE.Vector2(0.284, 0.05),
      new THREE.Vector2(0.28, 0.16),
      new THREE.Vector2(0.266, 0.27),
      new THREE.Vector2(0.244, 0.36),
      new THREE.Vector2(0.204, 0.425),
      new THREE.Vector2(0.145, 0.47),
      new THREE.Vector2(0.112, 0.495),
      new THREE.Vector2(0.0, 0.495),
    ];
    return new THREE.LatheGeometry(profile, 28);
  }, []);

  const { upperTailGeometry, lowerTailGeometry } = useMemo(() => {
    const upperShape = new THREE.Shape();
    upperShape.moveTo(0, 0.015);
    upperShape.quadraticCurveTo(-0.12, 0.062, -0.285, 0.048);
    upperShape.quadraticCurveTo(-0.23, 0.008, -0.26, -0.022);
    upperShape.quadraticCurveTo(-0.12, -0.026, 0, -0.016);
    upperShape.closePath();

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(0, 0.012);
    lowerShape.quadraticCurveTo(-0.11, -0.005, -0.255, -0.055);
    lowerShape.quadraticCurveTo(-0.205, -0.075, -0.228, -0.112);
    lowerShape.quadraticCurveTo(-0.1, -0.078, 0, -0.018);
    lowerShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.0045,
      bevelSize: 0.0045,
      bevelSegments: 2,
      curveSegments: 8,
    };

    return {
      upperTailGeometry: new THREE.ExtrudeGeometry(upperShape, extrudeSettings),
      lowerTailGeometry: new THREE.ExtrudeGeometry(lowerShape, extrudeSettings),
    };
  }, []);

  useEffect(() => {
    return () => {
      logoTexture.dispose();
      torsoGeometry.dispose();
      upperTailGeometry.dispose();
      lowerTailGeometry.dispose();
    };
  }, [logoTexture, torsoGeometry, upperTailGeometry, lowerTailGeometry]);

  // Natural Eye Blinking (~3.2s = frame % 96) + occasional double-blinks
  const cycleFrame = frame % 96;
  const cycleIndex = Math.floor(frame / 96);
  const primaryBlink = interpolate(cycleFrame, [86, 89, 90, 93], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const secondaryBlink =
    cycleIndex % 3 === 1
      ? interpolate(cycleFrame, [76, 78.5, 79.5, 82], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        })
      : 0;
  const blinkAmount = Math.max(primaryBlink, secondaryBlink);

  // Subtle gaze tracking between camera and right-side board
  const baseBoardGlance =
    vocabWeight * (0.65 + 0.35 * Math.sin(timeSec * 1.15)) +
    quizWeight * 0.45 * (1 - quizRevealWeight);
  const basePupilX =
    clamp01(baseBoardGlance + dialogueGuestWeight * 0.5) * 0.0105 +
    Math.sin(timeSec * 0.85) * 0.0018;
  const pupilOffsetX = lerp(basePupilX, 0.0155, pointBoardWeight);
  const pupilOffsetY =
    Math.cos(timeSec * 1.35) * 0.0014 +
    quizRevealWeight * 0.002 +
    pointBoardWeight * 0.003 +
    thinkingWeight * 0.0065;

  // Breathing & Torso Motion
  const breathY = Math.sin(timeSec * 2.15) * 0.011;
  const baseTorsoYaw =
    vocabWeight * 0.1 +
    dialogueGuestWeight * 0.06 +
    Math.sin(timeSec * 0.75) * 0.018;
  const torsoYaw = lerp(baseTorsoYaw, 0.16, pointBoardWeight);
  const torsoPitch = voiceEnergy * 0.024 + quizRevealWeight * -0.022;

  // Head Turning, Nodding & Tilting
  const speakBobY = isHostSpeaking ? voiceEnergy * 0.012 : 0;
  const baseHeadTurnTarget =
    vocabWeight * (0.22 + 0.08 * Math.sin(timeSec * 1.1)) +
    dialogueGuestWeight * 0.18 +
    quizWeight * (0.08 * (1 - quizRevealWeight));
  const headTurnTarget = lerp(baseHeadTurnTarget, 0.44, pointBoardWeight);
  const headYaw =
    headTurnTarget +
    Math.sin(timeSec * 1.05) * 0.03 * (1 - pointBoardWeight * 0.5) +
    (isHostSpeaking ? Math.cos(timeSec * 4.8) * voiceEnergy * 0.02 : 0);

  const speechNod = isHostSpeaking
    ? Math.sin(timeSec * 7.2) * voiceEnergy * 0.045 + voiceEnergy * 0.02
    : 0;
  const listeningNod =
    dialogueGuestWeight * (0.04 * Math.max(0, Math.sin(timeSec * 3.8)));
  const revealNod = quizRevealWeight * Math.sin(timeSec * 5.6) * 0.035;
  const encourageNod =
    nodEncourageWeight * (0.055 + 0.125 * Math.sin(timeSec * 6.8));
  const headPitch =
    Math.sin(timeSec * 1.6) * 0.02 +
    speechNod +
    listeningNod +
    revealNod +
    encourageNod -
    pointBoardWeight * 0.045 -
    thinkingWeight * 0.055;

  const headRoll =
    Math.sin(timeSec * 1.25) * 0.022 +
    thinkingWeight * 0.16 -
    vocabWeight * 0.024 +
    nodEncourageWeight * 0.02;

  const browRaise =
    (isHostSpeaking ? voiceEnergy * 0.006 : 0) +
    quizWeight * 0.0045 +
    nodEncourageWeight * 0.008 +
    thinkingWeight * 0.005;
  const browTiltBase =
    0.06 - nodEncourageWeight * 0.045 + thinkingWeight * 0.035;

  const tailSway = Math.sin(timeSec * 2.65) * 0.085 + voiceEnergy * 0.065;

  // Expressive Arm & Hand Gestures
  const gesturePulse = Math.sin(timeSec * 5.2) * voiceEnergy;
  const gestureAlt = Math.cos(timeSec * 3.7) * voiceEnergy;
  const explainMode = clamp01(vocabWeight + quizWeight * 0.55);
  const speakingMode = isHostSpeaking ? clamp01(voiceEnergy * 1.35) : 0;

  // Right Arm (-X, viewer's left): desk rest / emphasis, smoothly raises hand near chin when thinking
  const rightBaseShoulder: [number, number, number] = [
    -0.28 - speakingMode * 0.07 - quizRevealWeight * 0.05 + gestureAlt * 0.035,
    0.06 + speakingMode * 0.04,
    -0.22 - speakingMode * 0.05,
  ];
  const rightThinkShoulder: [number, number, number] = [
    -0.98 + Math.sin(timeSec * 2.1) * 0.02,
    0.26,
    -0.36,
  ];
  const rightShoulderRot: [number, number, number] = [
    lerp(rightBaseShoulder[0], rightThinkShoulder[0], thinkingWeight),
    lerp(rightBaseShoulder[1], rightThinkShoulder[1], thinkingWeight),
    lerp(rightBaseShoulder[2], rightThinkShoulder[2], thinkingWeight),
  ];

  const rightBaseElbow: [number, number, number] = [
    -1.02 - speakingMode * 0.14 - quizRevealWeight * 0.14 + gesturePulse * 0.07,
    0,
    0.26 - speakingMode * 0.08,
  ];
  const rightThinkElbow: [number, number, number] = [
    -1.66 + Math.cos(timeSec * 2.4) * 0.03,
    0.14,
    0.48,
  ];
  const rightElbowRot: [number, number, number] = [
    lerp(rightBaseElbow[0], rightThinkElbow[0], thinkingWeight),
    lerp(rightBaseElbow[1], rightThinkElbow[1], thinkingWeight),
    lerp(rightBaseElbow[2], rightThinkElbow[2], thinkingWeight),
  ];

  const rightBaseWrist: [number, number, number] = [
    0.16 - speakingMode * 0.24,
    0.15,
    -0.1 + speakingMode * 0.2,
  ];
  const rightThinkWrist: [number, number, number] = [0.22, 0.18, -0.15];
  const rightWristRot: [number, number, number] = [
    lerp(rightBaseWrist[0], rightThinkWrist[0], thinkingWeight),
    lerp(rightBaseWrist[1], rightThinkWrist[1], thinkingWeight),
    lerp(rightBaseWrist[2], rightThinkWrist[2], thinkingWeight),
  ];

  const rightBaseFingerCurl = lerp(0.54, 0.22, speakingMode);
  const rightIndexCurl = lerp(rightBaseFingerCurl, 0.42, thinkingWeight);
  const rightOtherCurl = lerp(
    rightBaseFingerCurl + 0.12,
    0.78,
    thinkingWeight,
  );

  // Left Arm (+X, viewer's right): teacher-like open-palm explaining & explicit `point_board` gesture
  const leftIdleShoulder: [number, number, number] = [-0.36, -0.06, 0.28];
  const leftSpeakShoulder: [number, number, number] = [
    -0.9 + gesturePulse * 0.08 - quizRevealWeight * 0.1,
    -0.14,
    0.76 + voiceEnergy * 0.08,
  ];
  const leftExplainShoulder: [number, number, number] = [
    -0.92 + gestureAlt * 0.05,
    -0.2,
    1.04 + Math.sin(timeSec * 2.4) * 0.03,
  ];
  const leftPointShoulder: [number, number, number] = [
    -0.36 + Math.sin(timeSec * 2.8) * 0.025,
    -0.24,
    1.68 + Math.cos(timeSec * 2.4) * 0.03,
  ];

  const leftIdleElbow: [number, number, number] = [-1.08, 0, -0.22];
  const leftSpeakElbow: [number, number, number] = [
    -0.96 + gestureAlt * 0.14 - quizRevealWeight * 0.12,
    0,
    -0.06 + voiceEnergy * 0.08,
  ];
  const leftExplainElbow: [number, number, number] = [
    -0.66 + gesturePulse * 0.05,
    0,
    0.18,
  ];
  const leftPointElbow: [number, number, number] = [
    -0.22 + gesturePulse * 0.03,
    0.1,
    0.28,
  ];

  const leftBaseShoulderX = lerp(
    lerp(leftIdleShoulder[0], leftSpeakShoulder[0], speakingMode),
    leftExplainShoulder[0],
    explainMode,
  );
  const leftBaseShoulderY = lerp(
    lerp(leftIdleShoulder[1], leftSpeakShoulder[1], speakingMode),
    leftExplainShoulder[1],
    explainMode,
  );
  const leftBaseShoulderZ = lerp(
    lerp(leftIdleShoulder[2], leftSpeakShoulder[2], speakingMode),
    leftExplainShoulder[2],
    explainMode,
  );

  const leftShoulderRot: [number, number, number] = [
    lerp(leftBaseShoulderX, leftPointShoulder[0], pointBoardWeight),
    lerp(leftBaseShoulderY, leftPointShoulder[1], pointBoardWeight),
    lerp(leftBaseShoulderZ, leftPointShoulder[2], pointBoardWeight),
  ];

  const leftBaseElbowX = lerp(
    lerp(leftIdleElbow[0], leftSpeakElbow[0], speakingMode),
    leftExplainElbow[0],
    explainMode,
  );
  const leftBaseElbowZ = lerp(
    lerp(leftIdleElbow[2], leftSpeakElbow[2], speakingMode),
    leftExplainElbow[2],
    explainMode,
  );

  const leftElbowRot: [number, number, number] = [
    lerp(leftBaseElbowX, leftPointElbow[0], pointBoardWeight),
    lerp(0, leftPointElbow[1], pointBoardWeight),
    lerp(leftBaseElbowZ, leftPointElbow[2], pointBoardWeight),
  ];

  const leftWristRot: [number, number, number] = [
    lerp(
      lerp(lerp(0.18, -0.36, speakingMode), -0.42, explainMode),
      -0.28,
      pointBoardWeight,
    ),
    lerp(
      lerp(lerp(0.2, -0.36, speakingMode), -0.5, explainMode),
      -0.42,
      pointBoardWeight,
    ),
    lerp(
      lerp(lerp(0.14, 0.3, speakingMode), 0.38, explainMode),
      0.28,
      pointBoardWeight,
    ),
  ];

  const leftIndexCurl = lerp(
    lerp(lerp(0.54, 0.14, speakingMode), 0.12, explainMode),
    0.04,
    pointBoardWeight,
  );
  const leftOtherCurl = lerp(
    lerp(
      lerp(0.66, 0.22, speakingMode),
      lerp(0.24, 0.38, vocabWeight),
      explainMode,
    ),
    0.14,
    pointBoardWeight,
  );

  void activeSection;

  return (
    <group position={[-0.78, 0.78, -0.62]} rotation={[0, 0.24, 0]}>
      {/* Ergonomic Matte-Black Studio Chair */}
      <group position={[0, -0.04, -0.34]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.84, 0.095]} />
          <meshStandardMaterial color="#14171e" roughness={0.76} />
        </mesh>
        <mesh position={[0, 0.84, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.048, 0.048, 0.54, 14]} />
          <meshStandardMaterial color="#1e232c" roughness={0.62} />
        </mesh>
        <mesh position={[-0.3, 0.42, 0.05]} castShadow>
          <boxGeometry args={[0.075, 0.76, 0.13]} />
          <meshStandardMaterial color="#1a1f28" roughness={0.7} />
        </mesh>
        <mesh position={[0.3, 0.42, 0.05]} castShadow>
          <boxGeometry args={[0.075, 0.76, 0.13]} />
          <meshStandardMaterial color="#1a1f28" roughness={0.7} />
        </mesh>
      </group>

      {/* ==================== TORSO GROUP ==================== */}
      <group
        name="torsoGroup"
        position={[0, breathY, 0]}
        rotation={[torsoPitch, torsoYaw, 0]}
      >
        {/* Vibrant Emerald-Green JungGo Hoodie */}
        <mesh
          geometry={torsoGeometry}
          scale={[1.08, 1, 0.86]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#11834b" roughness={0.74} />
        </mesh>

        {/* Crisp Curved "JungGo" Chest Wordmark */}
        <mesh
          position={[0, 0.285, 0.004]}
          scale={[1.08, 1, 0.86]}
          receiveShadow
        >
          <cylinderGeometry
            args={[0.252, 0.276, 0.142, 18, 1, true, -0.52, 1.04]}
          />
          <meshStandardMaterial
            map={logoTexture}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            roughness={0.72}
          />
        </mesh>

        {/* Hoodie Collar & Resting Hood Cowl */}
        <mesh
          position={[0, 0.485, 0.015]}
          rotation={[0.2, 0, 0]}
          scale={[1.06, 1, 0.92]}
          castShadow
        >
          <torusGeometry args={[0.165, 0.054, 10, 22]} />
          <meshStandardMaterial color="#0e6b3d" roughness={0.78} />
        </mesh>
        <mesh
          position={[0, 0.46, -0.06]}
          rotation={[0.35, 0, 0]}
          scale={[1.15, 0.75, 0.9]}
          castShadow
        >
          <torusGeometry args={[0.175, 0.048, 10, 20]} />
          <meshStandardMaterial color="#148e52" roughness={0.76} />
        </mesh>

        {/* Emerald Drawstrings with Light Aglets */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.056, 0.39, 0.228]}
            rotation={[0.08, 0, side * -0.05]}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.007, 0.007, 0.15, 8]} />
              <meshStandardMaterial color="#0b4f2d" roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.08, 0]}>
              <cylinderGeometry args={[0.0085, 0.0075, 0.022, 8]} />
              <meshStandardMaterial color="#d8e2dc" roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Neck Pivot Core */}
        <mesh position={[0, 0.54, 0.01]} castShadow>
          <cylinderGeometry args={[0.098, 0.115, 0.15, 14]} />
          <meshStandardMaterial color="#161920" roughness={0.76} />
        </mesh>

        {/* ==================== ARTICULATED ARMS ==================== */}
        <ArticulatedArm3D
          name="rightArmGroup"
          side="right"
          shoulderPosition={[-0.25, 0.37, 0.02]}
          shoulderRotation={rightShoulderRot}
          elbowRotation={rightElbowRot}
          wristRotation={rightWristRot}
          indexCurl={rightIndexCurl}
          otherFingersCurl={rightOtherCurl}
        />

        <ArticulatedArm3D
          name="leftArmGroup"
          side="left"
          shoulderPosition={[0.25, 0.37, 0.02]}
          shoulderRotation={leftShoulderRot}
          elbowRotation={leftElbowRot}
          wristRotation={leftWristRot}
          indexCurl={leftIndexCurl}
          otherFingersCurl={leftOtherCurl}
        />

        {/* ==================== HEAD GROUP ==================== */}
        <group
          name="headGroup"
          position={[0, 0.76 + speakBobY, 0.02]}
          rotation={[headPitch, headYaw, headRoll]}
        >
          {/* Warm Peach Chibi Pixar Head */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[0.292, 28, 22]} />
            <meshStandardMaterial color="#ffd4b5" roughness={0.48} />
          </mesh>

          {/* Warm Rosy Cheek Blush */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.112, -0.038, 0.25]}
              rotation={[0, side * 0.38, 0]}
              scale={[1.45, 0.9, 0.4]}
            >
              <sphereGeometry args={[0.036, 10, 8]} />
              <meshStandardMaterial
                color="#f49682"
                transparent
                opacity={0.42}
                roughness={0.62}
              />
            </mesh>
          ))}

          {/* Cute Sculpted 3D Pixar Nose */}
          <mesh
            position={[0, -0.022, 0.293]}
            rotation={[0.2, 0, 0]}
            scale={[1.05, 0.88, 0.9]}
            castShadow
          >
            <sphereGeometry args={[0.028, 12, 10]} />
            <meshStandardMaterial color="#f4be9a" roughness={0.5} />
          </mesh>

          {/* Matte-Black Ninja Hood Wrapping Crown, Sides & Under-Chin Collar */}
          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[0.302, 28, 12, 0, Math.PI * 2, 0, 1.18]}
            />
            <meshStandardMaterial color="#181b22" roughness={0.72} />
          </mesh>

          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[
                0.302,
                28,
                18,
                Math.PI / 2 + 0.94,
                Math.PI * 2 - 1.88,
                0.85,
                Math.PI - 0.85,
              ]}
            />
            <meshStandardMaterial color="#181b22" roughness={0.72} />
          </mesh>

          <mesh position={[0, -0.062, 0]} castShadow receiveShadow>
            <sphereGeometry
              args={[0.298, 24, 12, 0, Math.PI * 2, 2.24, 0.9]}
            />
            <meshStandardMaterial color="#15181e" roughness={0.76} />
          </mesh>

          <mesh
            position={[0, -0.225, 0.015]}
            rotation={[Math.PI / 2 + 0.12, 0, 0]}
            scale={[1.02, 1.0, 0.85]}
            castShadow
          >
            <torusGeometry args={[0.168, 0.032, 8, 24]} />
            <meshStandardMaterial color="#161920" roughness={0.74} />
          </mesh>

          {/* Expressive 3D Anime Eyes */}
          <StylizedEye3D
            name="rightEyeGroup"
            position={[-0.088, 0.028, 0.278]}
            rotation={[0, -0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={-browTiltBase}
          />
          <StylizedEye3D
            name="leftEyeGroup"
            position={[0.088, 0.028, 0.278]}
            rotation={[0, 0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={browTiltBase}
          />

          {/* ==================== EXPRESSIVE D-SHAPED LIP-SYNC MOUTH ==================== */}
          <group
            name="mouthGroup"
            position={[0, -0.098, 0.276]}
            rotation={[0.3, 0, 0]}
          >
            {mouthOpen > 0.06 ? (
              <group>
                {/* Maroon oral cavity */}
                <mesh
                  position={[0, -mouthOpen * 0.008, 0]}
                  scale={[mouthWidth * 1.02, 0.32 + mouthOpen * 0.65, 0.24]}
                >
                  <sphereGeometry args={[0.046, 14, 10]} />
                  <meshStandardMaterial color="#421118" roughness={0.74} />
                </mesh>

                {/* Ivory upper teeth arch */}
                <mesh
                  position={[0, 0.011 + mouthOpen * 0.004, 0.008]}
                  scale={[mouthWidth * 0.92, 1, 1]}
                >
                  <boxGeometry args={[0.052, 0.011, 0.01]} />
                  <meshStandardMaterial color="#fcfbf7" roughness={0.22} />
                </mesh>

                {/* Bright coral-pink curved tongue */}
                <mesh
                  position={[0, -0.009 - mouthOpen * 0.016, 0.008]}
                  scale={[mouthWidth * 0.88, 0.38, 0.42]}
                >
                  <sphereGeometry args={[0.026, 10, 8]} />
                  <meshStandardMaterial color="#ea6d7c" roughness={0.44} />
                </mesh>

                {/* Soft upper lip rim */}
                <mesh
                  position={[0, 0.016, 0.007]}
                  rotation={[0, 0, 0.2]}
                  scale={[mouthWidth * 1.02, 0.55, 0.6]}
                >
                  <torusGeometry args={[0.042, 0.0042, 6, 14, Math.PI * 0.86]} />
                  <meshStandardMaterial color="#ebb092" roughness={0.48} />
                </mesh>

                {/* Dynamic lower lip rim */}
                <mesh
                  position={[0, -0.012 - mouthOpen * 0.028, 0.006]}
                  rotation={[0, 0, Math.PI * 1.12]}
                  scale={[mouthWidth * 0.96, 0.55 + mouthOpen * 0.38, 0.6]}
                >
                  <torusGeometry args={[0.04, 0.0042, 6, 14, Math.PI * 0.76]} />
                  <meshStandardMaterial color="#e09c82" roughness={0.48} />
                </mesh>
              </group>
            ) : (
              /* Friendly relaxed closed smile */
              <mesh
                position={[0, 0.006, 0.007]}
                rotation={[0, 0, Math.PI * 1.175]}
                scale={[mouthWidth, 0.55, 0.6]}
              >
                <torusGeometry args={[0.038, 0.0045, 6, 14, Math.PI * 0.65]} />
                <meshStandardMaterial color="#91483a" roughness={0.48} />
              </mesh>
            )}
          </group>

          {/* Vibrant Emerald-Green Ninja Headband + Flowing Ribbon Tails */}
          <group position={[0, 0.145, 0]} rotation={[0.08, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.28, 0.299, 0.092, 28, 1, true]} />
              <meshStandardMaterial
                color="#168a50"
                roughness={0.72}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, 0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.277, 0.014, 8, 28]} />
              <meshStandardMaterial color="#1fa360" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.288, 0.011, 8, 28]} />
              <meshStandardMaterial color="#127041" roughness={0.76} />
            </mesh>
            <mesh position={[0, -0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.295, 0.014, 8, 28]} />
              <meshStandardMaterial color="#0f6339" roughness={0.76} />
            </mesh>

            <group position={[-0.296, -0.01, -0.03]}>
              <mesh scale={[0.9, 1.05, 0.9]} castShadow>
                <sphereGeometry args={[0.046, 10, 8]} />
                <meshStandardMaterial color="#15804a" roughness={0.74} />
              </mesh>
              <mesh
                geometry={upperTailGeometry}
                position={[-0.01, 0.008, -0.008]}
                rotation={[0.08, 0.24, 0.12 + tailSway]}
                scale={[1.18, 1.15, 1]}
                castShadow
              >
                <meshStandardMaterial color="#1b9c5b" roughness={0.72} />
              </mesh>
              <mesh
                geometry={lowerTailGeometry}
                position={[-0.01, -0.008, -0.006]}
                rotation={[-0.06, 0.18, 0.18 - tailSway * 0.75]}
                scale={[1.18, 1.15, 1]}
                castShadow
              >
                <meshStandardMaterial color="#127242" roughness={0.76} />
              </mesh>
            </group>
          </group>

          {/* Matte-Black Over-Ear Headphones with Warm Gold Trim Rings */}
          <group position={[0, 0.018, 0.008]}>
            <mesh castShadow>
              <torusGeometry args={[0.318, 0.026, 10, 28, Math.PI]} />
              <meshStandardMaterial color="#191d25" roughness={0.52} />
            </mesh>

            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.314, -0.022, 0]}>
                <mesh position={[side * 0.014, 0.075, 0]} castShadow>
                  <boxGeometry args={[0.018, 0.11, 0.032]} />
                  <meshStandardMaterial
                    color="#454a54"
                    metalness={0.6}
                    roughness={0.34}
                  />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.108, 0.108, 0.06, 18]} />
                  <meshStandardMaterial color="#14171d" roughness={0.76} />
                </mesh>
                <mesh
                  position={[side * 0.029, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.088, 0.102, 0.044, 18]} />
                  <meshStandardMaterial
                    color="#1f232c"
                    metalness={0.42}
                    roughness={0.38}
                  />
                </mesh>
                {/* Brushed gold/brass earcup accent ring matching reference */}
                <mesh
                  position={[side * 0.052, 0, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <torusGeometry args={[0.068, 0.007, 8, 20]} />
                  <meshStandardMaterial
                    color="#c9a25e"
                    metalness={0.75}
                    roughness={0.28}
                  />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
};
