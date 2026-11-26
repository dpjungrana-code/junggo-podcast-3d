import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  PodcastSectionType,
  SubtitleCue,
  getActiveSubtitle,
  isAddressingCoHost,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";
import {
  computeDualLockMouthMetrics,
  usePodcastAudioMetrics,
} from "../utils/audio";
import { createHoodieLogoTexture } from "../utils/textures";
import { PixarHand3D, computeCalmGestureEnvelopes } from "./PixarHand3D";

export type FemaleNinjaHost3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
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

const computeSpeakerEnvelope = (
  subtitles: readonly SubtitleCue[] | undefined,
  guestSpeaker: boolean,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }

  let maxWeight = 0;
  for (const cue of subtitles) {
    if (isGuestSpeaker(cue.speaker) !== guestSpeaker) {
      continue;
    }
    const enter = interpolate(
      timeSec,
      [cue.startSec - 0.22, cue.startSec + 0.22],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [cue.endSec - 0.16, cue.endSec + 0.34],
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
 * Smooth 0..1 envelope when Maria directly addresses Sensei (by name, question
 * phrasing, or dialogue handoff) without pointing at the board.
 */
const computeAddressSenseiWeight = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }
  let maxWeight = 0;
  for (let i = 0; i < subtitles.length; i++) {
    const cue = subtitles[i];
    if (!isGuestSpeaker(cue.speaker)) {
      continue;
    }
    const midSec = (cue.startSec + cue.endSec) * 0.5;
    const sec = findSectionAt(sections, midSec);
    if (resolveCueGesture(cue, sec, true) === "point_board") {
      continue;
    }
    if (!isAddressingCoHost(cue, subtitles[i + 1])) {
      continue;
    }
    const enter = interpolate(
      timeSec,
      [cue.startSec - 0.16, cue.startSec + 0.24],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const exit = interpolate(
      timeSec,
      [cue.endSec - 0.12, cue.endSec + 0.36],
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

type FemaleEyeProps = {
  readonly name: string;
  readonly side: "left" | "right";
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly blinkAmount: number;
  readonly pupilOffsetX: number;
  readonly pupilOffsetY: number;
  readonly browRaise: number;
  readonly browTilt: number;
};

/**
 * Large expressive Pixar-anime eye with sleek flared upper eyelashes and smooth
 * 3D eyelids offset cleanly from Sensei's blink cycle.
 */
const FemaleStylizedEye3D: React.FC<FemaleEyeProps> = ({
  name,
  side,
  position,
  rotation,
  blinkAmount,
  pupilOffsetX,
  pupilOffsetY,
  browRaise,
  browTilt,
}) => {
  const outerSign = side === "left" ? 1 : -1;
  const upperLidScaleY = lerp(0.01, 1.0, blinkAmount);
  const lowerLidLift = blinkAmount * 0.015;
  const closedLineVisible = blinkAmount > 0.45;

  return (
    <group
      name={name}
      position={[position[0], position[1], position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
      {/* Warm gentle upward-arched dark-espresso eyebrow cleanly below headband */}
      <mesh
        position={[0, 0.031 + browRaise, 0.02]}
        rotation={[0, 0, Math.PI * 0.23 + browTilt]}
        scale={[1.0, 0.55, 0.72]}
        castShadow
      >
        <torusGeometry args={[0.049, 0.0046, 8, 16, Math.PI * 0.54]} />
        <meshStandardMaterial color="#382218" roughness={0.56} />
      </mesh>

      {/* Wet-look glossy white sclera */}
      <mesh scale={[1.02, 1.08, 0.34]}>
        <sphereGeometry args={[0.052, 18, 14]} />
        <meshPhysicalMaterial
          color="#fcfdff"
          roughness={0.14}
          clearcoat={1.0}
          clearcoatRoughness={0.06}
        />
      </mesh>

      {/* Soft upper lash arch */}
      <mesh
        position={[0, 0.005, 0.011]}
        rotation={[0, 0, 0.14]}
        scale={[1.03, 1.08, 0.72]}
      >
        <torusGeometry args={[0.052, 0.0058, 6, 16, Math.PI * 0.86]} />
        <meshStandardMaterial color="#211618" roughness={0.38} />
      </mesh>

      {/* Flared outer winged eyelashes */}
      <mesh
        position={[outerSign * 0.051, 0.018, 0.012]}
        rotation={[0, 0, outerSign * -0.95]}
      >
        <capsuleGeometry args={[0.004, 0.017, 4, 6]} />
        <meshStandardMaterial color="#211618" roughness={0.38} />
      </mesh>
      <mesh
        position={[outerSign * 0.048, 0.032, 0.012]}
        rotation={[0, 0, outerSign * -0.68]}
      >
        <capsuleGeometry args={[0.0034, 0.013, 4, 6]} />
        <meshStandardMaterial color="#211618" roughness={0.38} />
      </mesh>

      {/* Movable Glossy Iris, Pupil, and Bright Cornea Catchlights */}
      <group position={[pupilOffsetX, pupilOffsetY, 0.0185]}>
        <mesh>
          <circleGeometry args={[0.037, 20]} />
          <meshPhysicalMaterial
            color="#2b120e"
            roughness={0.12}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
          />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.0335, 20]} />
          <meshPhysicalMaterial
            color="#662d1b"
            roughness={0.14}
            clearcoat={0.95}
            clearcoatRoughness={0.06}
          />
        </mesh>
        <mesh position={[0, -0.009, 0.002]} scale={[0.92, 0.72, 1]}>
          <circleGeometry args={[0.022, 16]} />
          <meshStandardMaterial
            color="#c7683e"
            emissive="#632612"
            emissiveIntensity={0.42}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 0.001, 0.003]}>
          <circleGeometry args={[0.016, 16]} />
          <meshStandardMaterial color="#0b0706" roughness={0.12} />
        </mesh>
        <mesh position={[-0.0115, 0.0125, 0.0042]}>
          <circleGeometry args={[0.0104, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.68}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0.0125, -0.0115, 0.0042]}>
          <circleGeometry args={[0.0052, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.54}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* 3D Upper Eyelid Pivot */}
      {blinkAmount > 0.02 && (
        <group position={[0, 0.058, 0.011]} scale={[1, upperLidScaleY, 1]}>
          <mesh position={[0, -0.056, 0]} scale={[1.06, 1.06, 0.36]}>
            <sphereGeometry args={[0.054, 14, 10]} />
            <meshStandardMaterial color="#ffd7bc" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Curved closed-eye lash arc */}
      {closedLineVisible && (
        <mesh
          position={[0, -0.015, 0.03]}
          rotation={[0, 0, Math.PI * 1.15]}
          scale={[1.06, 0.44, 0.6]}
        >
          <torusGeometry args={[0.045, 0.0058, 6, 14, Math.PI * 0.7]} />
          <meshStandardMaterial color="#140f12" roughness={0.4} />
        </mesh>
      )}

      {/* Lower eyelid cushion */}
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

type FemaleArmProps = {
  readonly name: string;
  readonly side: "left" | "right";
  readonly shoulderPosition: readonly [number, number, number];
  readonly shoulderRotation: readonly [number, number, number];
  readonly elbowRotation: readonly [number, number, number];
  readonly wristRotation: readonly [number, number, number];
  readonly fingerCurl: number;
  readonly fingerSpread: number;
  readonly thumbCurl: number;
};

/**
 * Smooth articulated crimson-red velvet hoodie sleeve, matte-black wrist wrap,
 * and sculpted 5-finger Pixar hand.
 */
const FemaleArticulatedArm3D: React.FC<FemaleArmProps> = ({
  name,
  side,
  shoulderPosition,
  shoulderRotation,
  elbowRotation,
  wristRotation,
  fingerCurl,
  fingerSpread,
  thumbCurl,
}) => {
  return (
    <group
      name={name}
      position={[shoulderPosition[0], shoulderPosition[1], shoulderPosition[2]]}
      rotation={[shoulderRotation[0], shoulderRotation[1], shoulderRotation[2]]}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.082, 14, 10]} />
        <meshPhysicalMaterial
          color="#b82538"
          roughness={0.78}
          sheen={0.58}
          sheenRoughness={0.62}
          sheenColor="#ff7a8a"
        />
      </mesh>

      <mesh position={[0, -0.098, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.066, 0.136, 6, 12]} />
        <meshPhysicalMaterial
          color="#b82538"
          roughness={0.78}
          sheen={0.58}
          sheenRoughness={0.62}
          sheenColor="#ff7a8a"
        />
      </mesh>

      <group
        position={[0, -0.195, 0]}
        rotation={[elbowRotation[0], elbowRotation[1], elbowRotation[2]]}
      >
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.066, 12, 10]} />
          <meshPhysicalMaterial
            color="#9e1e2f"
            roughness={0.8}
            sheen={0.52}
            sheenRoughness={0.65}
            sheenColor="#ff7a8a"
          />
        </mesh>

        <mesh position={[0, -0.088, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.061, 0.122, 6, 12]} />
          <meshPhysicalMaterial
            color="#b82538"
            roughness={0.78}
            sheen={0.58}
            sheenRoughness={0.62}
            sheenColor="#ff7a8a"
          />
        </mesh>

        {/* Ribbed crimson cuff */}
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.056, 0.049, 0.034, 14]} />
          <meshPhysicalMaterial
            color="#8e1928"
            roughness={0.82}
            sheen={0.45}
            sheenRoughness={0.65}
            sheenColor="#ff7a8a"
          />
        </mesh>

        {/* Matte-black wrist wrap with gold-crimson accent stripe */}
        <mesh position={[0, -0.188, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.038, 0.032, 14]} />
          <meshStandardMaterial color="#171b22" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.175, 0]}>
          <cylinderGeometry args={[0.043, 0.043, 0.008, 14]} />
          <meshStandardMaterial color="#f5b82e" metalness={0.5} roughness={0.35} />
        </mesh>

        {/* Sculpted 5-Finger Pixar Hand */}
        <group
          position={[0, -0.208, 0]}
          rotation={[wristRotation[0], wristRotation[1], wristRotation[2]]}
        >
          <PixarHand3D
            side={side}
            skinColor="#ffd5b8"
            scale={0.98}
            fingerCurl={fingerCurl}
            fingerSpread={fingerSpread}
            thumbCurl={thumbCurl}
          />
        </group>
      </group>
    </group>
  );
};

/**
 * Stylized 3D Pixar-Chibi Female Ninja Co-Host (Maria) matched in proportions
 * and craft to `NinjaHost3D`, with sleek deep-teal hoodie, crimson ninja headband,
 * high ponytail, winged eyelashes, independent audio-reactive lip-sync, offset
 * blinking (`+37` frames), and cross-character gaze + active listening nods.
 */
export const FemaleNinjaHost3D: React.FC<FemaleNinjaHost3DProps> = ({
  sections,
  subtitles,
  position = [-0.08, 0.78, -0.64],
  rotation = [0, -0.26, 0],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();

  const activeSection = findSectionAt(sections, timeSec);
  const activeCue = subtitles ? getActiveSubtitle(subtitles, timeSec) : null;
  void activeCue;

  // Dual-Lock Silence-Gated Lip-Sync: requires BOTH active speech window AND RMS >= 0.035
  const mouthMetrics = computeDualLockMouthMetrics(
    subtitles,
    true,
    timeSec,
    fps,
    audio,
    isGuestSpeaker,
  );
  const isMariaSpeaking = mouthMetrics.isSpeakingNow;
  const voiceEnergy = mouthMetrics.voiceEnergy;
  const speechPeak = mouthMetrics.speechPeak;
  const mouthOpen = mouthMetrics.jawOpen;
  const mouthWidth = mouthMetrics.mouthWidth;

  const mariaSpeakingWeight = computeSpeakerEnvelope(subtitles, true, timeSec);
  const senseiSpeakingWeight = computeSpeakerEnvelope(
    subtitles,
    false,
    timeSec,
  );
  const addressSenseiWeight = computeAddressSenseiWeight(
    sections,
    subtitles,
    timeSec,
  );
  const senseiCalmGestures = computeCalmGestureEnvelopes(
    frame,
    fps,
    sections,
    subtitles,
    false,
  );
  const mariaCalmGestures = computeCalmGestureEnvelopes(
    frame,
    fps,
    sections,
    subtitles,
    true,
  );
  const senseiPointWeight = senseiCalmGestures.pointBoardWeight;
  const mariaPointWeight = mariaCalmGestures.pointBoardWeight;
  const mariaNodWeight = mariaCalmGestures.nodEncourageWeight;
  const mariaCalmEmphasis = mariaCalmGestures.calmEmphasisWeight;

  const introWeight = computeSectionWeight(
    sections,
    ["intro", "story"],
    timeSec,
  );
  const quizWeight = computeSectionWeight(sections, ["quiz"], timeSec);
  const kanjiOrVocabWeight = computeSectionWeight(
    sections,
    ["kanji_lesson", "vocabulary", "grammar", "station_guide"],
    timeSec,
  );

  const logoTexture = useMemo(() => createHoodieLogoTexture(), []);

  const torsoGeometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(0.0, -0.05),
      new THREE.Vector2(0.246, -0.05),
      new THREE.Vector2(0.262, 0.05),
      new THREE.Vector2(0.258, 0.16),
      new THREE.Vector2(0.244, 0.27),
      new THREE.Vector2(0.222, 0.36),
      new THREE.Vector2(0.186, 0.425),
      new THREE.Vector2(0.135, 0.47),
      new THREE.Vector2(0.105, 0.495),
      new THREE.Vector2(0.0, 0.495),
    ];
    return new THREE.LatheGeometry(profile, 28);
  }, []);

  const ponytailGeometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(0.0, 0.02),
      new THREE.Vector2(0.044, 0.01),
      new THREE.Vector2(0.068, -0.06),
      new THREE.Vector2(0.072, -0.14),
      new THREE.Vector2(0.056, -0.23),
      new THREE.Vector2(0.028, -0.31),
      new THREE.Vector2(0.008, -0.36),
      new THREE.Vector2(0.0, -0.37),
    ];
    return new THREE.LatheGeometry(profile, 20);
  }, []);

  const { upperTailGeometry, lowerTailGeometry } = useMemo(() => {
    const upperShape = new THREE.Shape();
    upperShape.moveTo(0, 0.014);
    upperShape.quadraticCurveTo(0.11, 0.056, 0.265, 0.042);
    upperShape.quadraticCurveTo(0.21, 0.008, 0.242, -0.02);
    upperShape.quadraticCurveTo(0.11, -0.024, 0, -0.014);
    upperShape.closePath();

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(0, 0.011);
    lowerShape.quadraticCurveTo(0.1, -0.005, 0.238, -0.05);
    lowerShape.quadraticCurveTo(0.19, -0.07, 0.212, -0.104);
    lowerShape.quadraticCurveTo(0.09, -0.072, 0, -0.016);
    lowerShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.011,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
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
      ponytailGeometry.dispose();
      upperTailGeometry.dispose();
      lowerTailGeometry.dispose();
    };
  }, [
    logoTexture,
    torsoGeometry,
    ponytailGeometry,
    upperTailGeometry,
    lowerTailGeometry,
  ]);

  // Offset 102-frame (~3.4s) blink cycle so Maria & Sensei never blink in unison
  const blinkFrame = (frame + 37) % 102;
  const blinkCycleIdx = Math.floor((frame + 37) / 102);
  const primaryBlink = interpolate(blinkFrame, [92, 95, 96, 99], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const doubleBlink =
    blinkCycleIdx % 4 === 2
      ? interpolate(blinkFrame, [82, 84.5, 85.5, 88], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        })
      : 0;
  const blinkAmount = Math.max(primaryBlink, doubleBlink);

  // Smart cross-character gaze (~22deg / -0.38 rad left toward Sensei) & board tracking
  const lookAtSenseiWeight = clamp01(
    Math.max(
      senseiSpeakingWeight * (1 - senseiPointWeight * 0.85),
      addressSenseiWeight,
    ),
  );
  const lookAtBoardWeight = clamp01(
    Math.max(
      senseiPointWeight * 0.9,
      mariaPointWeight,
      kanjiOrVocabWeight * 0.45 * (1 - lookAtSenseiWeight),
      quizWeight * 0.55,
    ),
  );
  const greetCameraWeight =
    introWeight * mariaSpeakingWeight * (1 - addressSenseiWeight);

  const baseHeadYaw = lerp(-0.14, -0.38, lookAtSenseiWeight);
  const speakingHeadYaw = lerp(baseHeadYaw, 0.08, greetCameraWeight);
  const headYaw =
    lerp(speakingHeadYaw, 0.36, lookAtBoardWeight) +
    Math.sin(timeSec * 0.95 + 0.8) * 0.026 * (1 - lookAtBoardWeight * 0.4);

  const pupilOffsetX =
    lerp(
      lerp(-0.004, -0.0135, lookAtSenseiWeight),
      0.0145,
      lookAtBoardWeight,
    ) +
    Math.sin(timeSec * 0.8 + 1.4) * 0.0014;
  const pupilOffsetY =
    Math.cos(timeSec * 1.25 + 0.6) * 0.0014 +
    quizWeight * 0.003 +
    lookAtBoardWeight * 0.0025;

  // Breathing, posture & attentive listening nods
  const breathY = Math.sin(timeSec * 2.3 + 1.2) * 0.01;
  const torsoYaw = lerp(
    lerp(-0.06, -0.14, lookAtSenseiWeight),
    0.1,
    lookAtBoardWeight,
  );
  const torsoPitch = voiceEnergy * 0.022;

  const speakBobY = isMariaSpeaking ? voiceEnergy * 0.011 : 0;
  const speechNod = isMariaSpeaking
    ? Math.sin(timeSec * 7.6) * voiceEnergy * 0.042 + voiceEnergy * 0.018
    : 0;
  const activeListeningNod =
    lookAtSenseiWeight *
    (0.03 + 0.055 * Math.max(0, Math.sin(timeSec * 4.1)) * (0.4 + audio.volume));
  const mariaEncourageNod = mariaNodWeight * Math.sin(timeSec * 6.4) * 0.075;
  const headPitch =
    Math.sin(timeSec * 1.45 + 0.9) * 0.018 +
    speechNod +
    activeListeningNod +
    mariaEncourageNod -
    lookAtBoardWeight * 0.03;

  const headRoll =
    Math.sin(timeSec * 1.15 + 0.7) * 0.024 +
    lookAtSenseiWeight * -0.045 +
    quizWeight * -0.09;

  const browRaise =
    0.004 +
    (isMariaSpeaking ? voiceEnergy * 0.009 + speechPeak * 0.005 : 0) +
    lookAtSenseiWeight * 0.0035 +
    quizWeight * 0.004;
  // Positive gentle inner-brow lift keeps Maria's expression bright, warm, and welcoming
  const friendlyBrowTilt = 0.05 + quizWeight * 0.02;

  const tailSway = Math.sin(timeSec * 2.5 + 1.4) * 0.08 + voiceEnergy * 0.055;
  const ponytailSwayZ = Math.sin(timeSec * 2.1 + 0.5) * 0.045 - headYaw * 0.25;

  // Calm, Unhurried Phrase-Level Arm & Hand Gestures ("Less-Is-More": quiet desk rest when listening)
  const slowBreathArm = Math.sin(timeSec * 2.0 + 0.8) * 0.016;
  const calmDrift = Math.sin(timeSec * 2.4 + 0.4) * 0.02;
  const calmFollowThrough = Math.cos(timeSec * 2.0 + 0.9) * 0.018;

  // Right Arm (-X, facing Sensei): rests calmly near desk (~70% of time); gentle subtle open-palm on selected emphasis phrases
  const rightShoulderRot: [number, number, number] = [
    -0.32 - mariaCalmEmphasis * 0.24 + slowBreathArm + calmDrift * mariaCalmEmphasis,
    0.08 + mariaCalmEmphasis * 0.08,
    -0.22 - mariaCalmEmphasis * 0.14,
  ];
  const rightElbowRot: [number, number, number] = [
    -1.08 +
      mariaCalmEmphasis * 0.14 +
      slowBreathArm * 0.6 +
      calmFollowThrough * mariaCalmEmphasis,
    0,
    0.2 - mariaCalmEmphasis * 0.08,
  ];
  const rightWristRot: [number, number, number] = [
    0.16 - mariaCalmEmphasis * 0.22,
    0.16 + mariaCalmEmphasis * 0.1,
    -0.1 + mariaCalmEmphasis * 0.14,
  ];
  const rightFingerCurl = lerp(0.5, 0.2, mariaCalmEmphasis);
  const rightFingerSpread = lerp(0.18, 0.66, mariaCalmEmphasis);
  const rightThumbCurl = lerp(0.32, 0.15, mariaCalmEmphasis);

  // Left Arm (+X, board side): rests quietly near desk unless Maria politely presents toward the board (`point_board`)
  const leftRestShoulder: [number, number, number] = [
    -0.32 + slowBreathArm,
    -0.06,
    0.22,
  ];
  const leftPointShoulder: [number, number, number] = [
    -0.52 + calmDrift * 0.7,
    -0.18,
    0.98 + calmFollowThrough * 0.7,
  ];
  const leftShoulderRot: [number, number, number] = [
    lerp(leftRestShoulder[0], leftPointShoulder[0], mariaPointWeight),
    lerp(leftRestShoulder[1], leftPointShoulder[1], mariaPointWeight),
    lerp(leftRestShoulder[2], leftPointShoulder[2], mariaPointWeight),
  ];

  const leftRestElbow: [number, number, number] = [
    -1.08 + slowBreathArm * 0.5,
    0,
    -0.2,
  ];
  const leftPointElbow: [number, number, number] = [
    -0.56 + calmFollowThrough * 0.6,
    0.12,
    0.2,
  ];
  const leftElbowRot: [number, number, number] = [
    lerp(leftRestElbow[0], leftPointElbow[0], mariaPointWeight),
    lerp(0, leftPointElbow[1], mariaPointWeight),
    lerp(leftRestElbow[2], leftPointElbow[2], mariaPointWeight),
  ];

  const leftWristRot: [number, number, number] = [
    lerp(0.16, -0.22, mariaPointWeight),
    lerp(0.16, -0.28, mariaPointWeight),
    lerp(0.1, 0.24, mariaPointWeight),
  ];
  const leftFingerCurl = lerp(0.5, 0.08, mariaPointWeight);
  const leftFingerSpread = lerp(0.18, 0.08, mariaPointWeight);
  const leftThumbCurl = lerp(0.32, 0.12, mariaPointWeight);

  void activeSection;

  return (
    <group
      position={[position[0], position[1], position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
      {/* Ergonomic Matte-Black Studio Chair */}
      <group position={[0, -0.04, -0.34]}>
        <mesh position={[0, 0.41, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.58, 0.82, 0.09]} />
          <meshStandardMaterial color="#14171e" roughness={0.76} />
        </mesh>
        <mesh position={[0, 0.82, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.5, 14]} />
          <meshStandardMaterial color="#1e232c" roughness={0.62} />
        </mesh>
        <mesh position={[-0.28, 0.41, 0.05]} castShadow>
          <boxGeometry args={[0.07, 0.74, 0.12]} />
          <meshStandardMaterial color="#1a1f28" roughness={0.7} />
        </mesh>
        <mesh position={[0.28, 0.41, 0.05]} castShadow>
          <boxGeometry args={[0.07, 0.74, 0.12]} />
          <meshStandardMaterial color="#1a1f28" roughness={0.7} />
        </mesh>
      </group>

      {/* ==================== TORSO GROUP ==================== */}
      <group
        name="mariaTorsoGroup"
        position={[0, breathY, 0]}
        rotation={[torsoPitch, torsoYaw, 0]}
      >
        {/* Rich Crimson Velvet JungGo Ninja Hoodie */}
        <mesh
          geometry={torsoGeometry}
          scale={[1.04, 1, 0.86]}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color="#b82538"
            roughness={0.78}
            sheen={0.58}
            sheenRoughness={0.62}
            sheenColor="#ff7a8a"
          />
        </mesh>

        {/* Crisp Curved "JungGo" Chest Wordmark */}
        <mesh
          position={[0, 0.285, 0.004]}
          scale={[1.04, 1, 0.86]}
          receiveShadow
        >
          <cylinderGeometry
            args={[0.232, 0.256, 0.136, 18, 1, true, -0.52, 1.04]}
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
          position={[0, 0.482, 0.015]}
          rotation={[0.2, 0, 0]}
          scale={[1.02, 1, 0.92]}
          castShadow
        >
          <torusGeometry args={[0.158, 0.05, 10, 22]} />
          <meshPhysicalMaterial
            color="#8e1928"
            roughness={0.8}
            sheen={0.48}
            sheenRoughness={0.65}
            sheenColor="#ff7a8a"
          />
        </mesh>
        <mesh
          position={[0, 0.456, -0.058]}
          rotation={[0.35, 0, 0]}
          scale={[1.1, 0.72, 0.9]}
          castShadow
        >
          <torusGeometry args={[0.168, 0.045, 10, 20]} />
          <meshPhysicalMaterial
            color="#cf3347"
            roughness={0.76}
            sheen={0.55}
            sheenRoughness={0.62}
            sheenColor="#ff8c9b"
          />
        </mesh>

        {/* Warm Gold-Ivory Drawstrings */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.052, 0.388, 0.214]}
            rotation={[0.08, 0, side * -0.05]}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.0065, 0.0065, 0.14, 8]} />
              <meshStandardMaterial color="#f5d388" roughness={0.62} />
            </mesh>
            <mesh position={[0, -0.075, 0]}>
              <cylinderGeometry args={[0.008, 0.007, 0.02, 8]} />
              <meshStandardMaterial color="#fff8eb" roughness={0.35} />
            </mesh>
          </group>
        ))}

        {/* Neck Pivot Core */}
        <mesh position={[0, 0.535, 0.01]} castShadow>
          <cylinderGeometry args={[0.092, 0.108, 0.145, 14]} />
          <meshStandardMaterial color="#161920" roughness={0.76} />
        </mesh>

        {/* ==================== ARTICULATED ARMS ==================== */}
        <FemaleArticulatedArm3D
          name="mariaRightArmGroup"
          side="right"
          shoulderPosition={[-0.23, 0.365, 0.02]}
          shoulderRotation={rightShoulderRot}
          elbowRotation={rightElbowRot}
          wristRotation={rightWristRot}
          fingerCurl={rightFingerCurl}
          fingerSpread={rightFingerSpread}
          thumbCurl={rightThumbCurl}
        />

        <FemaleArticulatedArm3D
          name="mariaLeftArmGroup"
          side="left"
          shoulderPosition={[0.23, 0.365, 0.02]}
          shoulderRotation={leftShoulderRot}
          elbowRotation={leftElbowRot}
          wristRotation={leftWristRot}
          fingerCurl={leftFingerCurl}
          fingerSpread={leftFingerSpread}
          thumbCurl={leftThumbCurl}
        />

        {/* ==================== HEAD GROUP ==================== */}
        <group
          name="mariaHeadGroup"
          position={[0, 0.75 + speakBobY, 0.02]}
          rotation={[headPitch, headYaw, headRoll]}
        >
          {/* Warm Peach Pixar Chibi Head */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[0.282, 28, 22]} />
            <meshPhysicalMaterial
              color="#ffd7bc"
              roughness={0.44}
              sheen={0.22}
              sheenRoughness={0.75}
              sheenColor="#ffece0"
            />
          </mesh>

          {/* Soft Rosy Cheek Blush */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.108, -0.036, 0.242]}
              rotation={[0, side * 0.38, 0]}
              scale={[1.48, 0.92, 0.4]}
            >
              <sphereGeometry args={[0.036, 10, 8]} />
              <meshStandardMaterial
                color="#f48d88"
                transparent
                opacity={0.5}
                roughness={0.62}
              />
            </mesh>
          ))}

          {/* Cute Sculpted Nose */}
          <mesh
            position={[0, -0.02, 0.283]}
            rotation={[0.2, 0, 0]}
            scale={[1.0, 0.84, 0.86]}
            castShadow
          >
            <sphereGeometry args={[0.025, 12, 10]} />
            <meshStandardMaterial color="#f5bfa0" roughness={0.5} />
          </mesh>

          {/* Matte-Black Ninja Cowl & Lower Mask Frame */}
          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[0.292, 28, 12, 0, Math.PI * 2, 0, 1.08]}
            />
            <meshStandardMaterial color="#181b22" roughness={0.72} />
          </mesh>

          <mesh castShadow receiveShadow>
            <sphereGeometry
              args={[
                0.292,
                28,
                18,
                Math.PI / 2 + 0.96,
                Math.PI * 2 - 1.92,
                0.85,
                Math.PI - 0.85,
              ]}
            />
            <meshStandardMaterial color="#181b22" roughness={0.72} />
          </mesh>

          <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
            <sphereGeometry
              args={[0.288, 24, 12, 0, Math.PI * 2, 2.24, 0.9]}
            />
            <meshStandardMaterial color="#15181e" roughness={0.76} />
          </mesh>

          {/* Lower Ninja Mask Collar Trim */}
          <mesh
            position={[0, -0.218, 0.014]}
            rotation={[Math.PI / 2 + 0.12, 0, 0]}
            scale={[1.02, 1.0, 0.85]}
            castShadow
          >
            <torusGeometry args={[0.162, 0.03, 8, 24]} />
            <meshStandardMaterial color="#161920" roughness={0.74} />
          </mesh>

          {/* Stylish High Ninja Ponytail */}
          <group
            position={[0, 0.135, -0.255]}
            rotation={[0.52, 0, ponytailSwayZ]}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.052, 0.015, 8, 16]} />
              <meshStandardMaterial color="#d93848" roughness={0.62} />
            </mesh>
            <mesh geometry={ponytailGeometry} castShadow>
              <meshStandardMaterial color="#1a1d25" roughness={0.68} />
            </mesh>
          </group>

          {/* Expressive Anime Eyes with Warm Friendly Arched Brows */}
          <FemaleStylizedEye3D
            name="mariaRightEyeGroup"
            side="right"
            position={[-0.085, 0.022, 0.268]}
            rotation={[0, -0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={friendlyBrowTilt}
          />
          <FemaleStylizedEye3D
            name="mariaLeftEyeGroup"
            side="left"
            position={[0.085, 0.022, 0.268]}
            rotation={[0, 0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={-friendlyBrowTilt}
          />

          {/* ==================== WARM FRIENDLY PIXAR LIP-SYNC MOUTH CUTOUT ==================== */}
          <group
            name="mariaMouthGroup"
            position={[0, -0.09, 0.27]}
            rotation={[0.24, 0, 0]}
          >
            {mouthOpen > 0.05 ? (
              <group>
                {/* Gentle calm oral cavity calibrated for polite speaking */}
                <mesh
                  position={[0, 0.001 - Math.min(0.68, mouthOpen * 0.74) * 0.019, -0.001]}
                  scale={[
                    mouthWidth * 0.95,
                    0.23 + Math.min(0.68, mouthOpen * 0.74) * 0.66,
                    0.26,
                  ]}
                >
                  <sphereGeometry args={[0.058, 16, 12]} />
                  <meshStandardMaterial color="#571322" roughness={0.7} />
                </mesh>
                {/* Crisp ivory upper teeth arch */}
                <mesh
                  position={[0, 0.011, 0.01]}
                  scale={[mouthWidth * 0.88, 1, 1]}
                >
                  <boxGeometry args={[0.07, 0.013, 0.01]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive="#fff6ed"
                    emissiveIntensity={0.14}
                    roughness={0.18}
                  />
                </mesh>
                {/* Soft coral-pink curved tongue */}
                <mesh
                  position={[
                    0,
                    -0.01 - Math.min(0.68, mouthOpen * 0.74) * 0.019,
                    0.009,
                  ]}
                  scale={[mouthWidth * 0.84, 0.42, 0.42]}
                >
                  <sphereGeometry args={[0.035, 12, 10]} />
                  <meshStandardMaterial
                    color="#f5788e"
                    emissive="#541622"
                    emissiveIntensity={0.25}
                    roughness={0.4}
                  />
                </mesh>
                {/* Upward-smiling gentle upper lip contour */}
                <mesh
                  position={[0, 0.019, 0.01]}
                  rotation={[0, 0, Math.PI * 1.24]}
                  scale={[mouthWidth * 1.0, 0.24, 0.56]}
                >
                  <torusGeometry args={[0.054, 0.0044, 6, 16, Math.PI * 0.52]} />
                  <meshStandardMaterial color="#ea998a" roughness={0.44} />
                </mesh>
                {/* Dynamic smiling lower lip rim */}
                <mesh
                  position={[
                    0,
                    -0.01 - Math.min(0.68, mouthOpen * 0.74) * 0.035,
                    0.009,
                  ]}
                  rotation={[0, 0, Math.PI * 1.11]}
                  scale={[
                    mouthWidth * 0.96,
                    0.56 + Math.min(0.68, mouthOpen * 0.74) * 0.35,
                    0.62,
                  ]}
                >
                  <torusGeometry args={[0.052, 0.0046, 6, 16, Math.PI * 0.78]} />
                  <meshStandardMaterial color="#e08078" roughness={0.44} />
                </mesh>
              </group>
            ) : (
              /* Warm welcoming Pixar closed smile */
              <mesh
                position={[0, 0.005, 0.01]}
                rotation={[0, 0, Math.PI * 1.12]}
                scale={[mouthWidth * 1.04, 0.62, 0.62]}
              >
                <torusGeometry args={[0.052, 0.005, 8, 20, Math.PI * 0.76]} />
                <meshStandardMaterial color="#b3454e" roughness={0.44} />
              </mesh>
            )}
          </group>

          {/* Crimson Ninja Headband + Flowing Right-Side Ribbon Tails */}
          <group position={[0, 0.152, 0]} rotation={[0.08, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.27, 0.289, 0.088, 28, 1, true]} />
              <meshStandardMaterial
                color="#c93142"
                roughness={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.268, 0.013, 8, 28]} />
              <meshStandardMaterial color="#e04456" roughness={0.68} />
            </mesh>
            <mesh position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.278, 0.01, 8, 28]} />
              <meshStandardMaterial color="#a82433" roughness={0.74} />
            </mesh>
            <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.285, 0.013, 8, 28]} />
              <meshStandardMaterial color="#961e2c" roughness={0.74} />
            </mesh>

            <group position={[0.286, -0.01, -0.03]}>
              <mesh scale={[0.9, 1.05, 0.9]} castShadow>
                <sphereGeometry args={[0.044, 10, 8]} />
                <meshStandardMaterial color="#bd2a3b" roughness={0.72} />
              </mesh>
              <mesh
                geometry={upperTailGeometry}
                position={[0.01, 0.008, -0.008]}
                rotation={[0.08, -0.24, -0.12 - tailSway]}
                scale={[1.15, 1.12, 1]}
                castShadow
              >
                <meshStandardMaterial color="#de3d4f" roughness={0.7} />
              </mesh>
              <mesh
                geometry={lowerTailGeometry}
                position={[0.01, -0.008, -0.006]}
                rotation={[-0.06, -0.18, -0.18 + tailSway * 0.75]}
                scale={[1.15, 1.12, 1]}
                castShadow
              >
                <meshStandardMaterial color="#a62231" roughness={0.74} />
              </mesh>
            </group>
          </group>

          {/* Matte-Black Over-Ear Studio Headphones with Warm Crimson-Gold Trim */}
          <group position={[0, 0.018, 0.008]}>
            <mesh castShadow>
              <torusGeometry args={[0.308, 0.025, 10, 28, Math.PI]} />
              <meshStandardMaterial color="#191d25" roughness={0.52} />
            </mesh>

            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.304, -0.022, 0]}>
                <mesh position={[side * 0.014, 0.072, 0]} castShadow>
                  <boxGeometry args={[0.017, 0.106, 0.03]} />
                  <meshStandardMaterial
                    color="#454a54"
                    metalness={0.6}
                    roughness={0.34}
                  />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.104, 0.104, 0.058, 18]} />
                  <meshStandardMaterial color="#14171d" roughness={0.76} />
                </mesh>
                <mesh
                  position={[side * 0.028, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.084, 0.098, 0.042, 18]} />
                  <meshStandardMaterial
                    color="#1f232c"
                    metalness={0.42}
                    roughness={0.38}
                  />
                </mesh>
                <mesh
                  position={[side * 0.05, 0, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <torusGeometry args={[0.065, 0.007, 8, 20]} />
                  <meshStandardMaterial
                    color="#e05260"
                    metalness={0.68}
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
