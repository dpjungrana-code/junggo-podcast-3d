import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  HostGestureType,
  PodcastSectionType,
  SubtitleCue,
  getActiveSubtitle,
  isGuestSpeaker,
  resolveCueGesture,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";
import { createHoodieLogoTexture } from "../utils/textures";

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

const computeSpeakerGestureWeight = (
  sections: readonly EpisodeSection[],
  subtitles: readonly SubtitleCue[] | undefined,
  targetGesture: HostGestureType,
  forGuest: boolean,
  timeSec: number,
): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }

  let maxWeight = 0;
  for (const cue of subtitles) {
    const midSec = (cue.startSec + cue.endSec) * 0.5;
    const sectionForCue = findSectionAt(sections, midSec);
    if (resolveCueGesture(cue, sectionForCue, forGuest) !== targetGesture) {
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
      {/* Arched dark eyebrow */}
      <mesh
        position={[0, 0.068 + browRaise, 0.018]}
        rotation={[0, 0, Math.PI / 2 + browTilt]}
        castShadow
      >
        <capsuleGeometry args={[0.0055, 0.054, 4, 8]} />
        <meshStandardMaterial color="#1f1512" roughness={0.56} />
      </mesh>

      {/* Glossy white sclera */}
      <mesh scale={[1.02, 1.08, 0.34]}>
        <sphereGeometry args={[0.052, 18, 14]} />
        <meshStandardMaterial color="#fcfdff" roughness={0.2} />
      </mesh>

      {/* Bold upper lash arch */}
      <mesh
        position={[0, 0.004, 0.011]}
        rotation={[0, 0, 0.14]}
        scale={[1.03, 1.08, 0.72]}
      >
        <torusGeometry args={[0.052, 0.0066, 6, 16, Math.PI * 0.86]} />
        <meshStandardMaterial color="#140f12" roughness={0.36} />
      </mesh>

      {/* Flared outer winged eyelashes */}
      <mesh
        position={[outerSign * 0.051, 0.018, 0.012]}
        rotation={[0, 0, outerSign * -0.95]}
      >
        <capsuleGeometry args={[0.0042, 0.018, 4, 6]} />
        <meshStandardMaterial color="#140f12" roughness={0.36} />
      </mesh>
      <mesh
        position={[outerSign * 0.048, 0.032, 0.012]}
        rotation={[0, 0, outerSign * -0.68]}
      >
        <capsuleGeometry args={[0.0036, 0.014, 4, 6]} />
        <meshStandardMaterial color="#140f12" roughness={0.36} />
      </mesh>

      {/* Movable Iris, Pupil, and Catchlights */}
      <group position={[pupilOffsetX, pupilOffsetY, 0.0185]}>
        <mesh>
          <circleGeometry args={[0.037, 20]} />
          <meshStandardMaterial color="#240f0c" roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.0335, 20]} />
          <meshStandardMaterial color="#592616" roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.009, 0.002]} scale={[0.92, 0.72, 1]}>
          <circleGeometry args={[0.022, 16]} />
          <meshStandardMaterial
            color="#b85b35"
            emissive="#5c2110"
            emissiveIntensity={0.35}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 0.001, 0.003]}>
          <circleGeometry args={[0.0165, 16]} />
          <meshStandardMaterial color="#090605" roughness={0.12} />
        </mesh>
        <mesh position={[-0.0115, 0.0125, 0.0042]}>
          <circleGeometry args={[0.0096, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.62}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0.0125, -0.0115, 0.0042]}>
          <circleGeometry args={[0.0048, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.5}
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
  readonly indexCurl: number;
  readonly otherFingersCurl: number;
};

/**
 * Smooth articulated teal ninja sleeve, matte-black wrist wrap, and sculpted hand.
 */
const FemaleArticulatedArm3D: React.FC<FemaleArmProps> = ({
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
        <sphereGeometry args={[0.082, 14, 10]} />
        <meshStandardMaterial color="#0f646e" roughness={0.72} />
      </mesh>

      <mesh position={[0, -0.098, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.066, 0.136, 6, 12]} />
        <meshStandardMaterial color="#0f646e" roughness={0.72} />
      </mesh>

      <group
        position={[0, -0.195, 0]}
        rotation={[elbowRotation[0], elbowRotation[1], elbowRotation[2]]}
      >
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.066, 12, 10]} />
          <meshStandardMaterial color="#0c555e" roughness={0.74} />
        </mesh>

        <mesh position={[0, -0.088, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.061, 0.122, 6, 12]} />
          <meshStandardMaterial color="#0f646e" roughness={0.72} />
        </mesh>

        {/* Ribbed teal cuff */}
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.056, 0.049, 0.034, 14]} />
          <meshStandardMaterial color="#093f46" roughness={0.8} />
        </mesh>

        {/* Matte-black wrist wrap with crimson accent stripe */}
        <mesh position={[0, -0.188, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.038, 0.032, 14]} />
          <meshStandardMaterial color="#171b22" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.175, 0]}>
          <cylinderGeometry args={[0.043, 0.043, 0.008, 14]} />
          <meshStandardMaterial color="#d93848" roughness={0.55} />
        </mesh>

        {/* Expressive Peach Hand */}
        <group
          position={[0, -0.208, 0]}
          rotation={[wristRotation[0], wristRotation[1], wristRotation[2]]}
        >
          <mesh position={[0, -0.022, 0]} scale={[1.02, 0.9, 0.7]} castShadow>
            <sphereGeometry args={[0.049, 12, 10]} />
            <meshStandardMaterial color="#ffd3b5" roughness={0.5} />
          </mesh>

          <group
            position={[thumbSign * 0.038, -0.015, 0.017]}
            rotation={[0.25, thumbSign * 0.35, thumbSign * 0.65]}
          >
            <mesh position={[0, -0.019, 0]} castShadow>
              <capsuleGeometry args={[0.013, 0.025, 4, 8]} />
              <meshStandardMaterial color="#ffd3b5" roughness={0.5} />
            </mesh>
          </group>

          <group
            position={[thumbSign * 0.021, -0.05, 0.008]}
            rotation={[indexCurl, 0, thumbSign * 0.06]}
          >
            <mesh position={[0, -0.023, 0]} castShadow>
              <capsuleGeometry args={[0.012, 0.033, 4, 8]} />
              <meshStandardMaterial color="#ffd6b8" roughness={0.5} />
            </mesh>
          </group>

          <group
            position={[-thumbSign * 0.014, -0.05, 0.004]}
            rotation={[otherFingersCurl, 0, -thumbSign * 0.05]}
          >
            <mesh position={[thumbSign * 0.012, -0.022, 0.003]} castShadow>
              <capsuleGeometry args={[0.012, 0.031, 4, 8]} />
              <meshStandardMaterial color="#ffd3b5" roughness={0.5} />
            </mesh>
            <mesh position={[-thumbSign * 0.01, -0.02, 0]} castShadow>
              <capsuleGeometry args={[0.0115, 0.027, 4, 8]} />
              <meshStandardMaterial color="#ffd3b5" roughness={0.5} />
            </mesh>
            <mesh position={[-thumbSign * 0.028, -0.016, -0.004]} castShadow>
              <capsuleGeometry args={[0.01, 0.021, 4, 8]} />
              <meshStandardMaterial color="#fccaa8" roughness={0.5} />
            </mesh>
          </group>
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

  const isMariaCueActive =
    activeCue !== null && isGuestSpeaker(activeCue.speaker);
  const isMariaSpeaking = audio.isSpeaking && isMariaCueActive;

  const mariaSpeakingWeight = computeSpeakerEnvelope(subtitles, true, timeSec);
  const senseiSpeakingWeight = computeSpeakerEnvelope(
    subtitles,
    false,
    timeSec,
  );
  const senseiPointWeight = computeSpeakerGestureWeight(
    sections,
    subtitles,
    "point_board",
    false,
    timeSec,
  );
  const mariaPointWeight = computeSpeakerGestureWeight(
    sections,
    subtitles,
    "point_board",
    true,
    timeSec,
  );
  const mariaNodWeight = computeSpeakerGestureWeight(
    sections,
    subtitles,
    "nod_encourage",
    true,
    timeSec,
  );

  const introWeight = computeSectionWeight(
    sections,
    ["intro", "story"],
    timeSec,
  );
  const quizWeight = computeSectionWeight(sections, ["quiz"], timeSec);
  const kanjiOrVocabWeight = computeSectionWeight(
    sections,
    ["kanji_lesson", "vocabulary", "grammar"],
    timeSec,
  );

  const quietFallback = 0.05 + 0.03 * Math.sin(timeSec * 1.7 + 1.1);
  const voiceEnergy = isMariaSpeaking
    ? Math.max(0.15, audio.volume)
    : quietFallback * 0.65;

  // Syllable-synced mouth animation strictly active ONLY when Maria speaks
  const syllableWave =
    0.55 +
    0.27 * Math.sin(timeSec * 17.8 + 0.4) +
    0.18 * Math.cos(timeSec * 24.6 + 1.2);
  const mouthOpen = isMariaSpeaking
    ? clamp01(voiceEnergy * (0.48 + 0.72 * syllableWave))
    : 0;
  const mouthWidth = isMariaSpeaking
    ? lerp(0.88, 1.14, 0.5 + 0.5 * Math.cos(timeSec * 12.2))
    : 0.94;

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

  // Cross-character gaze & board tracking
  // Look LEFT (-X) at Sensei when Sensei speaks; look RIGHT (+X) at board when referencing board
  const lookAtSenseiWeight =
    senseiSpeakingWeight * (1 - senseiPointWeight * 0.85);
  const lookAtBoardWeight = clamp01(
    Math.max(
      senseiPointWeight * 0.9,
      mariaPointWeight,
      kanjiOrVocabWeight * 0.45 * (1 - lookAtSenseiWeight),
      quizWeight * 0.55,
    ),
  );
  const greetCameraWeight = introWeight * mariaSpeakingWeight;

  const baseHeadYaw = lerp(-0.14, -0.28, lookAtSenseiWeight);
  const speakingHeadYaw = lerp(baseHeadYaw, 0.08, greetCameraWeight);
  const headYaw =
    lerp(speakingHeadYaw, 0.36, lookAtBoardWeight) +
    Math.sin(timeSec * 0.95 + 0.8) * 0.026 * (1 - lookAtBoardWeight * 0.4);

  const pupilOffsetX =
    lerp(
      lerp(-0.004, -0.0115, lookAtSenseiWeight),
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
    lerp(-0.06, -0.1, lookAtSenseiWeight),
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
    (isMariaSpeaking ? voiceEnergy * 0.006 : 0) +
    lookAtSenseiWeight * 0.0035 +
    quizWeight * 0.004;
  const browTiltBase = 0.08 - quizWeight * 0.035;

  const tailSway = Math.sin(timeSec * 2.5 + 1.4) * 0.08 + voiceEnergy * 0.055;
  const ponytailSwayZ = Math.sin(timeSec * 2.1 + 0.5) * 0.045 - headYaw * 0.25;

  // Expressive Arm & Hand Gestures (Left Arm +X = board side, Right Arm -X = Sensei side)
  const gesturePulse = Math.sin(timeSec * 5.0 + 0.6) * voiceEnergy;
  const gestureAlt = Math.cos(timeSec * 3.8 + 0.4) * voiceEnergy;
  const speakingMode = isMariaSpeaking ? clamp01(voiceEnergy * 1.35) : 0;

  // Right Arm (-X, facing Sensei): natural conversational gesture when Maria speaks
  const rightShoulderRot: [number, number, number] = [
    -0.34 - speakingMode * 0.36 + gestureAlt * 0.06,
    0.1 + speakingMode * 0.1,
    -0.26 - speakingMode * 0.24,
  ];
  const rightElbowRot: [number, number, number] = [
    -1.06 + speakingMode * 0.12 + gesturePulse * 0.1,
    0,
    0.22 - speakingMode * 0.14,
  ];
  const rightWristRot: [number, number, number] = [
    0.18 - speakingMode * 0.32,
    0.2,
    -0.12 + speakingMode * 0.22,
  ];
  const rightFingerCurl = lerp(0.56, 0.2, speakingMode);

  // Left Arm (+X, board side): gentle attentive posture, or raised pointing toward board when `mariaPointWeight` is active
  const leftBaseShoulder: [number, number, number] = [
    -0.34 - speakingMode * 0.42 + gesturePulse * 0.05,
    -0.08,
    0.26 + speakingMode * 0.28,
  ];
  const leftPointShoulder: [number, number, number] = [
    -0.38 + Math.sin(timeSec * 2.6) * 0.025,
    -0.22,
    1.62 + Math.cos(timeSec * 2.3) * 0.03,
  ];
  const leftShoulderRot: [number, number, number] = [
    lerp(leftBaseShoulder[0], leftPointShoulder[0], mariaPointWeight),
    lerp(leftBaseShoulder[1], leftPointShoulder[1], mariaPointWeight),
    lerp(leftBaseShoulder[2], leftPointShoulder[2], mariaPointWeight),
  ];

  const leftBaseElbow: [number, number, number] = [
    -1.06 + speakingMode * 0.16 + gestureAlt * 0.08,
    0,
    -0.2 + speakingMode * 0.14,
  ];
  const leftPointElbow: [number, number, number] = [-0.24, 0.1, 0.26];
  const leftElbowRot: [number, number, number] = [
    lerp(leftBaseElbow[0], leftPointElbow[0], mariaPointWeight),
    lerp(0, leftPointElbow[1], mariaPointWeight),
    lerp(leftBaseElbow[2], leftPointElbow[2], mariaPointWeight),
  ];

  const leftWristRot: [number, number, number] = [
    lerp(0.16 - speakingMode * 0.28, -0.28, mariaPointWeight),
    lerp(0.18 - speakingMode * 0.36, -0.4, mariaPointWeight),
    lerp(0.14 + speakingMode * 0.18, 0.28, mariaPointWeight),
  ];
  const leftIndexCurl = lerp(lerp(0.56, 0.18, speakingMode), 0.05, mariaPointWeight);
  const leftOtherCurl = lerp(lerp(0.66, 0.26, speakingMode), 0.15, mariaPointWeight);

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
        {/* Sleek Deep-Teal JungGo Ninja Hoodie */}
        <mesh
          geometry={torsoGeometry}
          scale={[1.04, 1, 0.86]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#0f646e" roughness={0.72} />
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
          <meshStandardMaterial color="#0b4b53" roughness={0.76} />
        </mesh>
        <mesh
          position={[0, 0.456, -0.058]}
          rotation={[0.35, 0, 0]}
          scale={[1.1, 0.72, 0.9]}
          castShadow
        >
          <torusGeometry args={[0.168, 0.045, 10, 20]} />
          <meshStandardMaterial color="#137580" roughness={0.74} />
        </mesh>

        {/* Crimson Drawstrings */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.052, 0.388, 0.214]}
            rotation={[0.08, 0, side * -0.05]}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.0065, 0.0065, 0.14, 8]} />
              <meshStandardMaterial color="#c93142" roughness={0.74} />
            </mesh>
            <mesh position={[0, -0.075, 0]}>
              <cylinderGeometry args={[0.008, 0.007, 0.02, 8]} />
              <meshStandardMaterial color="#f5e6e8" roughness={0.4} />
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
          indexCurl={rightFingerCurl}
          otherFingersCurl={rightFingerCurl + 0.12}
        />

        <FemaleArticulatedArm3D
          name="mariaLeftArmGroup"
          side="left"
          shoulderPosition={[0.23, 0.365, 0.02]}
          shoulderRotation={leftShoulderRot}
          elbowRotation={leftElbowRot}
          wristRotation={leftWristRot}
          indexCurl={leftIndexCurl}
          otherFingersCurl={leftOtherCurl}
        />

        {/* ==================== HEAD GROUP ==================== */}
        <group
          name="mariaHeadGroup"
          position={[0, 0.75 + speakBobY, 0.02]}
          rotation={[headPitch, headYaw, headRoll]}
        >
          {/* Warm Peach Chibi Head */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[0.282, 28, 22]} />
            <meshStandardMaterial color="#ffd7bc" roughness={0.48} />
          </mesh>

          {/* Soft Rosy Cheek Blush */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.108, -0.036, 0.242]}
              rotation={[0, side * 0.38, 0]}
              scale={[1.45, 0.9, 0.4]}
            >
              <sphereGeometry args={[0.036, 10, 8]} />
              <meshStandardMaterial
                color="#f48d88"
                transparent
                opacity={0.46}
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
              args={[0.292, 28, 12, 0, Math.PI * 2, 0, 1.16]}
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

          {/* Expressive Anime Eyes with Eyelashes */}
          <FemaleStylizedEye3D
            name="mariaRightEyeGroup"
            side="right"
            position={[-0.085, 0.028, 0.268]}
            rotation={[0, -0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={-browTiltBase}
          />
          <FemaleStylizedEye3D
            name="mariaLeftEyeGroup"
            side="left"
            position={[0.085, 0.028, 0.268]}
            rotation={[0, 0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise}
            browTilt={browTiltBase}
          />

          {/* ==================== EXPRESSIVE LIP-SYNC MOUTH CUTOUT ==================== */}
          <group
            name="mariaMouthGroup"
            position={[0, -0.095, 0.267]}
            rotation={[0.3, 0, 0]}
          >
            {mouthOpen > 0.06 ? (
              <group>
                <mesh
                  position={[0, -mouthOpen * 0.008, 0]}
                  scale={[mouthWidth * 1.0, 0.3 + mouthOpen * 0.65, 0.24]}
                >
                  <sphereGeometry args={[0.044, 14, 10]} />
                  <meshStandardMaterial color="#4a111a" roughness={0.72} />
                </mesh>
                <mesh
                  position={[0, 0.011 + mouthOpen * 0.004, 0.008]}
                  scale={[mouthWidth * 0.9, 1, 1]}
                >
                  <boxGeometry args={[0.05, 0.01, 0.01]} />
                  <meshStandardMaterial color="#fcfbf7" roughness={0.22} />
                </mesh>
                <mesh
                  position={[0, -0.009 - mouthOpen * 0.015, 0.008]}
                  scale={[mouthWidth * 0.86, 0.38, 0.42]}
                >
                  <sphereGeometry args={[0.025, 10, 8]} />
                  <meshStandardMaterial color="#ef7182" roughness={0.42} />
                </mesh>
                <mesh
                  position={[0, 0.015, 0.007]}
                  rotation={[0, 0, 0.2]}
                  scale={[mouthWidth * 1.0, 0.55, 0.6]}
                >
                  <torusGeometry args={[0.04, 0.004, 6, 14, Math.PI * 0.86]} />
                  <meshStandardMaterial color="#ea9d8c" roughness={0.46} />
                </mesh>
                <mesh
                  position={[0, -0.012 - mouthOpen * 0.026, 0.006]}
                  rotation={[0, 0, Math.PI * 1.12]}
                  scale={[mouthWidth * 0.94, 0.55 + mouthOpen * 0.36, 0.6]}
                >
                  <torusGeometry args={[0.038, 0.004, 6, 14, Math.PI * 0.76]} />
                  <meshStandardMaterial color="#e2877c" roughness={0.46} />
                </mesh>
              </group>
            ) : (
              <mesh
                position={[0, 0.006, 0.007]}
                rotation={[0, 0, Math.PI * 1.175]}
                scale={[mouthWidth, 0.55, 0.6]}
              >
                <torusGeometry args={[0.036, 0.0044, 6, 14, Math.PI * 0.65]} />
                <meshStandardMaterial color="#9e4347" roughness={0.46} />
              </mesh>
            )}
          </group>

          {/* Crimson Ninja Headband + Flowing Right-Side Ribbon Tails */}
          <group position={[0, 0.14, 0]} rotation={[0.08, 0, 0]}>
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
