import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  PodcastSectionType,
  SubtitleCue,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";
import { createHoodieLogoTexture } from "../utils/textures";

export type NinjaHost3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Computes a smooth 0..1 weight whenever any section matching `types` is active,
 * easing softly across section boundaries with zero abrupt snapping.
 */
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

/**
 * Computes a smooth 0..1 weight when Yuki is speaking during a dialogue section.
 */
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

/**
 * Computes a smooth 0..1 pulse shortly after a quiz answer is revealed.
 */
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
 * Multi-layered 3D anime-style Pixar eye with movable iris/pupil, catchlights,
 * expressive eyebrow, and smooth 3D blinking upper/lower eyelids.
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
        <meshStandardMaterial color="#231814" roughness={0.58} />
      </mesh>

      {/* Glossy white sclera */}
      <mesh scale={[1.0, 1.06, 0.34]}>
        <sphereGeometry args={[0.052, 20, 16]} />
        <meshStandardMaterial color="#fcfdff" roughness={0.22} />
      </mesh>

      {/* Bold upper lash contour */}
      <mesh
        position={[0, 0.004, 0.011]}
        rotation={[0, 0, 0.14]}
        scale={[1.02, 1.06, 0.7]}
      >
        <torusGeometry args={[0.052, 0.0058, 6, 18, Math.PI * 0.84]} />
        <meshStandardMaterial color="#181214" roughness={0.4} />
      </mesh>

      {/* Movable Iris, Pupil, and Catchlights */}
      <group position={[pupilOffsetX, pupilOffsetY, 0.0185]}>
        {/* Outer dark iris rim */}
        <mesh>
          <circleGeometry args={[0.036, 22]} />
          <meshStandardMaterial color="#251109" roughness={0.28} />
        </mesh>
        {/* Rich chestnut-brown iris */}
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.0325, 22]} />
          <meshStandardMaterial color="#5e3017" roughness={0.24} />
        </mesh>
        {/* Warm amber lower iris highlight */}
        <mesh position={[0, -0.009, 0.002]} scale={[0.92, 0.72, 1]}>
          <circleGeometry args={[0.022, 18]} />
          <meshStandardMaterial
            color="#a35f2c"
            emissive="#4f260a"
            emissiveIntensity={0.35}
            roughness={0.22}
          />
        </mesh>
        {/* Deep glossy pupil */}
        <mesh position={[0, 0.001, 0.003]}>
          <circleGeometry args={[0.0165, 18]} />
          <meshStandardMaterial color="#090605" roughness={0.12} />
        </mesh>
        {/* Primary crisp anime catchlight (upper-left) */}
        <mesh position={[-0.0115, 0.0125, 0.0042]}>
          <circleGeometry args={[0.009, 14]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.55}
            roughness={0.1}
          />
        </mesh>
        {/* Secondary catchlight (lower-right) */}
        <mesh position={[0.0125, -0.0115, 0.0042]}>
          <circleGeometry args={[0.0045, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.45}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* 3D Upper Eyelid Pivot (sweeps down smoothly during blinks) */}
      {blinkAmount > 0.02 && (
        <group position={[0, 0.058, 0.011]} scale={[1, upperLidScaleY, 1]}>
          <mesh position={[0, -0.056, 0]} scale={[1.06, 1.06, 0.36]}>
            <sphereGeometry args={[0.054, 16, 12]} />
            <meshStandardMaterial color="#f5c5a1" roughness={0.52} />
          </mesh>
        </group>
      )}

      {/* Friendly curved dark closed-eye lash line visible at peak blink */}
      {closedLineVisible && (
        <mesh
          position={[0, -0.015, 0.03]}
          rotation={[0, 0, Math.PI * 1.15]}
          scale={[1.05, 0.42, 0.6]}
        >
          <torusGeometry args={[0.045, 0.0056, 6, 16, Math.PI * 0.7]} />
          <meshStandardMaterial color="#181214" roughness={0.4} />
        </mesh>
      )}

      {/* Subtle Lower Eyelid Cushion */}
      {blinkAmount > 0.02 && (
        <mesh
          position={[0, -0.052 + lowerLidLift, 0.013]}
          scale={[1.05, 0.25, 0.38]}
        >
          <sphereGeometry args={[0.05, 14, 10]} />
          <meshStandardMaterial color="#f3c19c" roughness={0.54} />
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
 * Smooth articulated green hoodie sleeve, black ninja wrist wrap, and sculpted Pixar hand
 * with shoulder, elbow, and wrist pivots.
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
      {/* Smooth hoodie shoulder cap */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.086, 16, 12]} />
        <meshStandardMaterial color="#196840" roughness={0.78} />
      </mesh>

      {/* Upper arm hoodie sleeve */}
      <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.071, 0.14, 6, 14]} />
        <meshStandardMaterial color="#196840" roughness={0.78} />
      </mesh>

      {/* Elbow Joint & Forearm */}
      <group
        position={[0, -0.2, 0]}
        rotation={[elbowRotation[0], elbowRotation[1], elbowRotation[2]]}
      >
        {/* Rounded elbow joint */}
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.07, 14, 12]} />
          <meshStandardMaterial color="#17613b" roughness={0.8} />
        </mesh>

        {/* Forearm hoodie sleeve */}
        <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.066, 0.125, 6, 14]} />
          <meshStandardMaterial color="#196840" roughness={0.78} />
        </mesh>

        {/* Ribbed dark-green hoodie wrist cuff */}
        <mesh position={[0, -0.165, 0]} castShadow>
          <cylinderGeometry args={[0.059, 0.052, 0.036, 16]} />
          <meshStandardMaterial color="#114d2f" roughness={0.84} />
        </mesh>

        {/* Black Ninja Wrist Wrap */}
        <mesh position={[0, -0.194, 0]} castShadow>
          <cylinderGeometry args={[0.044, 0.04, 0.034, 16]} />
          <meshStandardMaterial color="#181c23" roughness={0.72} />
        </mesh>

        {/* Wrist & Expressive Peach Pixar Hand */}
        <group
          position={[0, -0.214, 0]}
          rotation={[wristRotation[0], wristRotation[1], wristRotation[2]]}
        >
          {/* Rounded palm */}
          <mesh position={[0, -0.022, 0]} scale={[1.05, 0.92, 0.72]} castShadow>
            <sphereGeometry args={[0.052, 14, 12]} />
            <meshStandardMaterial color="#f4c39e" roughness={0.54} />
          </mesh>

          {/* Thumb */}
          <group
            position={[thumbSign * 0.04, -0.015, 0.018]}
            rotation={[0.25, thumbSign * 0.35, thumbSign * 0.65]}
          >
            <mesh position={[0, -0.02, 0]} castShadow>
              <capsuleGeometry args={[0.014, 0.026, 4, 8]} />
              <meshStandardMaterial color="#f4c39e" roughness={0.54} />
            </mesh>
          </group>

          {/* Independent Index Finger */}
          <group
            position={[thumbSign * 0.022, -0.052, 0.008]}
            rotation={[indexCurl, 0, thumbSign * 0.06]}
          >
            <mesh position={[0, -0.024, 0]} castShadow>
              <capsuleGeometry args={[0.013, 0.034, 4, 8]} />
              <meshStandardMaterial color="#f5c6a2" roughness={0.54} />
            </mesh>
          </group>

          {/* Middle, Ring & Pinky Fingers */}
          <group
            position={[-thumbSign * 0.015, -0.052, 0.004]}
            rotation={[otherFingersCurl, 0, -thumbSign * 0.05]}
          >
            <mesh position={[thumbSign * 0.013, -0.023, 0.003]} castShadow>
              <capsuleGeometry args={[0.0125, 0.032, 4, 8]} />
              <meshStandardMaterial color="#f4c39e" roughness={0.54} />
            </mesh>
            <mesh position={[-thumbSign * 0.01, -0.021, 0]} castShadow>
              <capsuleGeometry args={[0.012, 0.028, 4, 8]} />
              <meshStandardMaterial color="#f4c39e" roughness={0.54} />
            </mesh>
            <mesh position={[-thumbSign * 0.03, -0.017, -0.004]} castShadow>
              <capsuleGeometry args={[0.0105, 0.022, 4, 8]} />
              <meshStandardMaterial color="#f2be98" roughness={0.54} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};

/**
 * Expressive 3D Pixar-Inspired JungGo Ninja Host Character.
 * Features an open-mouth ninja cowl cutout with lip-synced lips/teeth/tongue,
 * 96-frame eye blinking with double-blinks, eye gaze shifts, and articulated
 * explaining hand gestures synced strictly to `useCurrentFrame()` and `useAudioData()`.
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

  // Determine whether the host (Sensei / JungGo) is actively speaking vs listening to Maria
  const isHostCueActive =
    activeCue !== null ? !isGuestSpeaker(activeCue.speaker) : audio.isSpeaking;
  const isHostSpeaking = audio.isSpeaking && isHostCueActive;

  // Smooth audio amplitude with a gentle organic fallback curve when quiet
  const quietFallback = 0.05 + 0.035 * Math.sin(timeSec * 1.9);
  const voiceEnergy = isHostSpeaking
    ? Math.max(0.14, audio.volume)
    : quietFallback * 0.65;

  // Lip-sync mouth aperture & width driven smoothly by audio amplitude
  const syllableWave =
    0.52 +
    0.3 * Math.sin(timeSec * 16.5) +
    0.18 * Math.cos(timeSec * 23.4 + 0.8);
  const mouthOpen = isHostSpeaking
    ? clamp01(voiceEnergy * (0.45 + 0.72 * syllableWave))
    : 0;
  const mouthWidth = isHostSpeaking
    ? lerp(0.86, 1.18, 0.5 + 0.5 * Math.cos(timeSec * 11.4))
    : 0.92;

  // Smooth section weights (no snapping)
  const vocabWeight = computeSectionWeight(
    sections,
    ["vocabulary", "grammar"],
    timeSec,
  );
  const quizWeight = computeSectionWeight(sections, ["quiz"], timeSec);
  const dialogueGuestWeight = computeDialogueGuestWeight(
    sections,
    subtitles,
    timeSec,
  );
  const quizRevealWeight = computeQuizRevealWeight(sections, timeSec);

  // Memoized procedural textures & smooth sculpted geometries
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
    return new THREE.LatheGeometry(profile, 32);
  }, []);

  const { upperTailGeometry, lowerTailGeometry } = useMemo(() => {
    const upperShape = new THREE.Shape();
    upperShape.moveTo(0, 0.015);
    upperShape.quadraticCurveTo(-0.12, 0.058, -0.275, 0.045);
    upperShape.quadraticCurveTo(-0.23, 0.008, -0.255, -0.022);
    upperShape.quadraticCurveTo(-0.12, -0.026, 0, -0.016);
    upperShape.closePath();

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(0, 0.012);
    lowerShape.quadraticCurveTo(-0.11, -0.005, -0.245, -0.052);
    lowerShape.quadraticCurveTo(-0.2, -0.072, -0.22, -0.108);
    lowerShape.quadraticCurveTo(-0.1, -0.078, 0, -0.018);
    lowerShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.0045,
      bevelSize: 0.0045,
      bevelSegments: 2,
      curveSegments: 10,
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

  // 1. Natural Eye Blinking (~every 3.2 seconds at 30fps = frame % 96) + double-blinks
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

  // Subtle eye focus shifts between camera and right-side blackboard
  const boardGlance =
    vocabWeight * (0.65 + 0.35 * Math.sin(timeSec * 1.15)) +
    quizWeight * 0.45 * (1 - quizRevealWeight);
  const pupilOffsetX =
    clamp01(boardGlance + dialogueGuestWeight * 0.5) * 0.0105 +
    Math.sin(timeSec * 0.85) * 0.0018;
  const pupilOffsetY =
    Math.cos(timeSec * 1.35) * 0.0014 + quizRevealWeight * 0.002;

  // 2. Torso breathing & subtle sway
  const breathY = Math.sin(timeSec * 2.15) * 0.011;
  const torsoYaw =
    vocabWeight * 0.1 +
    dialogueGuestWeight * 0.06 +
    Math.sin(timeSec * 0.75) * 0.018;
  const torsoPitch = voiceEnergy * 0.025 + quizRevealWeight * -0.022;

  // 3. Head Turning, Nodding & Expressive Tilting
  const speakBobY = isHostSpeaking ? voiceEnergy * 0.013 : 0;
  const headTurnTarget =
    vocabWeight * (0.24 + 0.08 * Math.sin(timeSec * 1.1)) +
    dialogueGuestWeight * 0.2 +
    quizWeight * (0.1 * (1 - quizRevealWeight));
  const headYaw =
    headTurnTarget +
    Math.sin(timeSec * 1.05) * 0.032 +
    (isHostSpeaking ? Math.cos(timeSec * 4.8) * voiceEnergy * 0.022 : 0);

  const speechNod = isHostSpeaking
    ? Math.sin(timeSec * 7.2) * voiceEnergy * 0.048 + voiceEnergy * 0.022
    : 0;
  const listeningNod =
    dialogueGuestWeight * (0.042 * Math.max(0, Math.sin(timeSec * 3.8)));
  const revealNod = quizRevealWeight * Math.sin(timeSec * 5.6) * 0.038;
  const headPitch =
    Math.sin(timeSec * 1.6) * 0.02 + speechNod + listeningNod + revealNod;

  const headRoll =
    Math.sin(timeSec * 1.25) * 0.024 +
    quizWeight * (1 - quizRevealWeight) * 0.055 -
    vocabWeight * 0.03;

  const browRaise =
    (isHostSpeaking ? voiceEnergy * 0.006 : 0) +
    quizWeight * 0.0045 +
    quizRevealWeight * 0.004;
  const browTiltBase = 0.08 - quizRevealWeight * 0.06;

  // Headband ribbon tail sway
  const tailSway = Math.sin(timeSec * 2.65) * 0.085 + voiceEnergy * 0.065;

  // 4. Articulated Arm & Hand Gestures (desk-safe & unobstructed by left-mounted mic)
  const gesturePulse = Math.sin(timeSec * 5.2) * voiceEnergy;
  const gestureAlt = Math.cos(timeSec * 3.7) * voiceEnergy;
  const explainMode = clamp01(vocabWeight + quizWeight * 0.55);
  const speakingMode = isHostSpeaking ? clamp01(voiceEnergy * 1.35) : 0;

  // Right Arm (-X, viewer's left): resting naturally near desk/notes, subtle emphasis on speech
  const rightShoulderRot: [number, number, number] = [
    -0.28 - speakingMode * 0.08 - quizRevealWeight * 0.05 + gestureAlt * 0.04,
    0.06 + speakingMode * 0.04,
    -0.22 - speakingMode * 0.05,
  ];
  const rightElbowRot: [number, number, number] = [
    -1.02 - speakingMode * 0.14 - quizRevealWeight * 0.14 + gesturePulse * 0.08,
    0,
    0.26 - speakingMode * 0.08,
  ];
  const rightWristRot: [number, number, number] = [
    0.16 - speakingMode * 0.25,
    0.15,
    -0.1 + speakingMode * 0.22,
  ];
  const rightFingerCurl = lerp(0.54, 0.2, speakingMode);

  // Left Arm (+X, viewer's right):
  // - Quiet/listening: rests comfortably near laptop/desk
  // - Speaking: raised in open-palm teaching gesture (clearly visible above laptop!)
  // - Explaining: opens/points smoothly toward the right-side blackboard
  const leftIdleShoulder: [number, number, number] = [-0.36, -0.06, 0.28];
  const leftSpeakShoulder: [number, number, number] = [
    -0.88 + gesturePulse * 0.08 - quizRevealWeight * 0.1,
    -0.14,
    0.72 + voiceEnergy * 0.08,
  ];
  const leftExplainShoulder: [number, number, number] = [
    -1.0 + gestureAlt * 0.05,
    -0.2,
    0.88 + Math.sin(timeSec * 2.4) * 0.03,
  ];

  const leftIdleElbow: [number, number, number] = [-1.08, 0, -0.22];
  const leftSpeakElbow: [number, number, number] = [
    -0.96 + gestureAlt * 0.14 - quizRevealWeight * 0.12,
    0,
    -0.05 + voiceEnergy * 0.08,
  ];
  const leftExplainElbow: [number, number, number] = [
    -0.68 + gesturePulse * 0.05,
    0,
    0.18,
  ];

  const leftShoulderRot: [number, number, number] = [
    lerp(
      lerp(leftIdleShoulder[0], leftSpeakShoulder[0], speakingMode),
      leftExplainShoulder[0],
      explainMode,
    ),
    lerp(
      lerp(leftIdleShoulder[1], leftSpeakShoulder[1], speakingMode),
      leftExplainShoulder[1],
      explainMode,
    ),
    lerp(
      lerp(leftIdleShoulder[2], leftSpeakShoulder[2], speakingMode),
      leftExplainShoulder[2],
      explainMode,
    ),
  ];

  const leftElbowRot: [number, number, number] = [
    lerp(
      lerp(leftIdleElbow[0], leftSpeakElbow[0], speakingMode),
      leftExplainElbow[0],
      explainMode,
    ),
    0,
    lerp(
      lerp(leftIdleElbow[2], leftSpeakElbow[2], speakingMode),
      leftExplainElbow[2],
      explainMode,
    ),
  ];

  const leftWristRot: [number, number, number] = [
    lerp(lerp(0.18, -0.35, speakingMode), -0.4, explainMode),
    lerp(lerp(0.2, -0.35, speakingMode), -0.5, explainMode),
    lerp(lerp(0.14, 0.28, speakingMode), 0.36, explainMode),
  ];

  const leftIndexCurl = lerp(lerp(0.54, 0.14, speakingMode), 0.1, explainMode);
  const leftOtherCurl = lerp(
    lerp(0.66, 0.24, speakingMode),
    lerp(0.35, 0.9, vocabWeight),
    explainMode,
  );

  void activeSection;

  return (
    <group position={[-0.74, 0.78, -0.68]} rotation={[0, 0.22, 0]}>
      {/* Ergonomic Matte-Black Studio Chair behind Host */}
      <group position={[0, -0.04, -0.34]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.84, 0.095]} />
          <meshStandardMaterial color="#151820" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.84, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.048, 0.048, 0.54, 14]} />
          <meshStandardMaterial color="#20252f" roughness={0.62} />
        </mesh>
        <mesh position={[-0.3, 0.42, 0.05]} castShadow>
          <boxGeometry args={[0.075, 0.76, 0.13]} />
          <meshStandardMaterial color="#1c212b" roughness={0.7} />
        </mesh>
        <mesh position={[0.3, 0.42, 0.05]} castShadow>
          <boxGeometry args={[0.075, 0.76, 0.13]} />
          <meshStandardMaterial color="#1c212b" roughness={0.7} />
        </mesh>
      </group>

      {/* ==================== TORSO GROUP ==================== */}
      <group
        name="torsoGroup"
        position={[0, breathY, 0]}
        rotation={[torsoPitch, torsoYaw, 0]}
      >
        {/* Sculpted Plush Dark-Green JungGo Hoodie Body */}
        <mesh
          geometry={torsoGeometry}
          scale={[1.08, 1, 0.86]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#196840" roughness={0.78} />
        </mesh>

        {/* Crisp Curved "JungGo" Chest Wordmark */}
        <mesh
          position={[0, 0.285, 0.004]}
          scale={[1.08, 1, 0.86]}
          receiveShadow
        >
          <cylinderGeometry
            args={[0.252, 0.276, 0.142, 20, 1, true, -0.52, 1.04]}
          />
          <meshStandardMaterial
            map={logoTexture}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            roughness={0.74}
          />
        </mesh>

        {/* Bunched Hoodie Collar & Resting Hood Cowl */}
        <mesh
          position={[0, 0.485, 0.015]}
          rotation={[0.2, 0, 0]}
          scale={[1.06, 1, 0.92]}
          castShadow
        >
          <torusGeometry args={[0.165, 0.054, 12, 26]} />
          <meshStandardMaterial color="#155937" roughness={0.82} />
        </mesh>
        <mesh
          position={[0, 0.46, -0.06]}
          rotation={[0.35, 0, 0]}
          scale={[1.15, 0.75, 0.9]}
          castShadow
        >
          <torusGeometry args={[0.175, 0.048, 10, 24]} />
          <meshStandardMaterial color="#1c7348" roughness={0.8} />
        </mesh>

        {/* Hoodie Drawstrings with Aglets */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.056, 0.39, 0.228]}
            rotation={[0.08, 0, side * -0.05]}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.007, 0.007, 0.16, 8]} />
              <meshStandardMaterial color="#0f3e27" roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.085, 0]}>
              <cylinderGeometry args={[0.0085, 0.0075, 0.022, 8]} />
              <meshStandardMaterial color="#1f252c" roughness={0.45} />
            </mesh>
          </group>
        ))}

        {/* Neck Pivot Core */}
        <mesh position={[0, 0.54, 0.01]} castShadow>
          <cylinderGeometry args={[0.098, 0.115, 0.15, 16]} />
          <meshStandardMaterial color="#161a21" roughness={0.78} />
        </mesh>

        {/* ==================== ARTICULATED ARMS ==================== */}
        <ArticulatedArm3D
          name="rightArmGroup"
          side="right"
          shoulderPosition={[-0.25, 0.37, 0.02]}
          shoulderRotation={rightShoulderRot}
          elbowRotation={rightElbowRot}
          wristRotation={rightWristRot}
          indexCurl={rightFingerCurl}
          otherFingersCurl={rightFingerCurl + 0.12}
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
          {/* Warm Peach Pixar Base Head */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[0.292, 32, 24]} />
            <meshStandardMaterial color="#f6c7a3" roughness={0.5} />
          </mesh>

          {/* Subtle Warm Cheek Blush */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.112, -0.036, 0.252]}
              rotation={[0, side * 0.38, 0]}
              scale={[1.35, 0.85, 0.4]}
            >
              <sphereGeometry args={[0.034, 12, 10]} />
              <meshStandardMaterial
                color="#ee9b82"
                transparent
                opacity={0.32}
                roughness={0.65}
              />
            </mesh>
          ))}

          {/* Sculpted Cute 3D Pixar Nose */}
          <mesh
            position={[0, -0.022, 0.293]}
            rotation={[0.2, 0, 0]}
            scale={[1.05, 0.88, 0.9]}
            castShadow
          >
            <sphereGeometry args={[0.029, 14, 12]} />
            <meshStandardMaterial color="#f0b790" roughness={0.52} />
          </mesh>

          {/* Charcoal-Black Ninja Hood Wrapping Crown, Back, Sides & Chin Collar */}
          {/* 1. Crown & Forehead Hood Cap */}
          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[0.302, 32, 14, 0, Math.PI * 2, 0, 1.18]}
            />
            <meshStandardMaterial color="#1a1e26" roughness={0.74} />
          </mesh>

          {/* 2. Sides & Back Balaclava (wide open Pixar face phi = PI/2 ± 0.92) */}
          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[
                0.302,
                32,
                20,
                Math.PI / 2 + 0.92,
                Math.PI * 2 - 1.84,
                0.85,
                Math.PI - 0.85,
              ]}
            />
            <meshStandardMaterial color="#1a1e26" roughness={0.74} />
          </mesh>

          {/* 3. Lower Neck & Under-Chin Gaiter Collar (clean jawline, no beard look) */}
          <mesh position={[0, -0.06, 0.0]} castShadow receiveShadow>
            <sphereGeometry
              args={[0.298, 28, 14, 0, Math.PI * 2, 2.24, 0.9]}
            />
            <meshStandardMaterial color="#151920" roughness={0.78} />
          </mesh>

          {/* 4. Snug Padded Neck Collar Rim under chin */}
          <mesh
            position={[0, -0.225, 0.015]}
            rotation={[Math.PI / 2 + 0.12, 0, 0]}
            scale={[1.02, 1.0, 0.85]}
            castShadow
          >
            <torusGeometry args={[0.168, 0.032, 10, 26]} />
            <meshStandardMaterial color="#171b23" roughness={0.76} />
          </mesh>

          {/* Expressive 3D Anime Eyes (leftEyeGroup & rightEyeGroup) */}
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

          {/* ==================== LIP-SYNC MOUTH GROUP ==================== */}
          <group
            name="mouthGroup"
            position={[0, -0.098, 0.276]}
            rotation={[0.3, 0, 0]}
          >
            {mouthOpen > 0.06 ? (
              <group>
                {/* Dark interior oral cavity */}
                <mesh
                  position={[0, -mouthOpen * 0.008, 0]}
                  scale={[mouthWidth * 0.94, 0.24 + mouthOpen * 0.58, 0.22]}
                >
                  <sphereGeometry args={[0.045, 16, 12]} />
                  <meshStandardMaterial color="#2a0d12" roughness={0.78} />
                </mesh>

                {/* Clean ivory upper teeth row */}
                <mesh
                  position={[0, 0.008 + mouthOpen * 0.004, 0.007]}
                  scale={[mouthWidth * 0.88, 1, 1]}
                >
                  <boxGeometry args={[0.05, 0.011, 0.01]} />
                  <meshStandardMaterial color="#fcfbf7" roughness={0.25} />
                </mesh>

                {/* Soft coral-pink curved tongue */}
                <mesh
                  position={[0, -0.007 - mouthOpen * 0.014, 0.007]}
                  scale={[mouthWidth * 0.82, 0.34, 0.4]}
                >
                  <sphereGeometry args={[0.024, 12, 10]} />
                  <meshStandardMaterial color="#db6d76" roughness={0.46} />
                </mesh>

                {/* Upper lip rim */}
                <mesh
                  position={[0, 0.013, 0.007]}
                  rotation={[0, 0, 0.2]}
                  scale={[mouthWidth, 0.55, 0.6]}
                >
                  <torusGeometry args={[0.04, 0.0048, 6, 16, Math.PI * 0.86]} />
                  <meshStandardMaterial color="#df9b7d" roughness={0.5} />
                </mesh>

                {/* Dynamic lower lip rim */}
                <mesh
                  position={[0, -0.009 - mouthOpen * 0.025, 0.006]}
                  rotation={[0, 0, Math.PI * 1.12]}
                  scale={[mouthWidth * 0.95, 0.55 + mouthOpen * 0.35, 0.6]}
                >
                  <torusGeometry args={[0.038, 0.0048, 6, 16, Math.PI * 0.76]} />
                  <meshStandardMaterial color="#d4896e" roughness={0.5} />
                </mesh>
              </group>
            ) : (
              /* Warm friendly closed Pixar smile */
              <mesh
                position={[0, 0.006, 0.007]}
                rotation={[0, 0, Math.PI * 1.175]}
                scale={[mouthWidth, 0.55, 0.6]}
              >
                <torusGeometry args={[0.038, 0.0046, 6, 16, Math.PI * 0.65]} />
                <meshStandardMaterial color="#8c4738" roughness={0.5} />
              </mesh>
            )}
          </group>

          {/* Signature JungGo Forest-Green Headband (Hachimaki) */}
          <group position={[0, 0.145, 0]} rotation={[0.08, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.28, 0.299, 0.092, 32, 1, true]} />
              <meshStandardMaterial
                color="#1c7549"
                roughness={0.74}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, 0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.277, 0.014, 8, 32]} />
              <meshStandardMaterial color="#258a59" roughness={0.72} />
            </mesh>
            <mesh position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.288, 0.011, 8, 32]} />
              <meshStandardMaterial color="#165e3a" roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.295, 0.014, 8, 32]} />
              <meshStandardMaterial color="#135635" roughness={0.78} />
            </mesh>

            {/* Headband Knot & Flowing Ribbon Tails on Viewer's Left (-X) */}
            <group position={[-0.296, -0.01, -0.03]}>
              <mesh scale={[0.9, 1.05, 0.9]} castShadow>
                <sphereGeometry args={[0.046, 12, 10]} />
                <meshStandardMaterial color="#196941" roughness={0.76} />
              </mesh>
              <mesh
                geometry={upperTailGeometry}
                position={[-0.01, 0.008, -0.008]}
                rotation={[0.08, 0.24, 0.12 + tailSway]}
                scale={[1.15, 1.12, 1]}
                castShadow
              >
                <meshStandardMaterial color="#218050" roughness={0.74} />
              </mesh>
              <mesh
                geometry={lowerTailGeometry}
                position={[-0.01, -0.008, -0.006]}
                rotation={[-0.06, 0.18, 0.18 - tailSway * 0.75]}
                scale={[1.15, 1.12, 1]}
                castShadow
              >
                <meshStandardMaterial color="#165d3a" roughness={0.78} />
              </mesh>
            </group>
          </group>

          {/* Matte-Black Over-Ear Studio Headphones */}
          <group position={[0, 0.018, 0.008]}>
            <mesh castShadow>
              <torusGeometry args={[0.318, 0.026, 10, 32, Math.PI]} />
              <meshStandardMaterial color="#1a1e26" roughness={0.55} />
            </mesh>

            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.314, -0.022, 0]}>
                <mesh position={[side * 0.014, 0.075, 0]} castShadow>
                  <boxGeometry args={[0.018, 0.11, 0.032]} />
                  <meshStandardMaterial
                    color="#303744"
                    metalness={0.55}
                    roughness={0.36}
                  />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.108, 0.108, 0.06, 20]} />
                  <meshStandardMaterial color="#13161c" roughness={0.78} />
                </mesh>
                <mesh
                  position={[side * 0.029, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.088, 0.102, 0.044, 20]} />
                  <meshStandardMaterial
                    color="#1f242e"
                    metalness={0.4}
                    roughness={0.38}
                  />
                </mesh>
                <mesh
                  position={[side * 0.053, 0, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <torusGeometry args={[0.064, 0.006, 8, 22]} />
                  <meshStandardMaterial
                    color="#555e70"
                    metalness={0.65}
                    roughness={0.3}
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
