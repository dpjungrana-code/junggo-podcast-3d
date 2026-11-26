import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  PodcastSectionType,
  StudioMode,
  SubtitleCue,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";
import {
  computeDualLockMouthMetrics,
  usePodcastAudioMetrics,
} from "../utils/audio";
import {
  blendGazeTargets,
  buildAudienceCheckIns,
  buildBlinkSchedule,
  buildListenerGlances,
  buildListenerNods,
  buildQuestionLifts,
  computeBlinkAmount,
  computeLayeredGaze,
  computeLensDirection,
  computeListenerNodPitch,
  computeQuestionLift,
  computeSpeakingEnvelope,
  computeUpperLidAmount,
  gazeAngleToPupilOffset,
} from "../utils/hostGaze";
import {
  createHoodieLogoTexture,
  createSoftBlushTexture,
} from "../utils/textures";
import { computeCameraPose } from "./CameraRig";
import { CheekBlush3D } from "./CheekBlush3D";
import { PixarEyelids3D } from "./PixarEyelids3D";
import { PixarHand3D, computeCalmGestureEnvelopes } from "./PixarHand3D";
import { PixarIris3D, SENSEI_IRIS } from "./PixarIris3D";
import { PixarMouth3D, SENSEI_MOUTH } from "./PixarMouth3D";

/** Sensei's seat (root position + yaw) per studio mode; shared with Studio3D props. */
export const SENSEI_LAYOUT = {
  dual: { position: [-1.14, 0.78, -0.6], yaw: 0.34 },
  solo: { position: [-0.78, 0.78, -0.62], yaw: 0.24 },
} as const;

/** Head-local mouth anchor (used by Studio3D to aim the boom mic). */
export const SENSEI_MOUTH_LOCAL: readonly [number, number, number] = [0, 0.67, 0.3];

/** Sensei's calm, slightly heavier resting lid (Maria's sits a little higher). */
const SENSEI_REST_LID = 0.24;

export type NinjaHost3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
  readonly studioMode?: StudioMode;
  /** 0 = studio wide, 1 = circular PIP (used to aim eye contact at the real lens). */
  readonly boardFocusProgress?: number;
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
  readonly side: "left" | "right";
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly blinkAmount: number;
  readonly pupilOffsetX: number;
  readonly pupilOffsetY: number;
  readonly browRaise: number;
  readonly browTilt: number;
  readonly lidAmount: number;
  readonly smileLift: number;
};

/**
 * Multi-layered 3D anime-style Pixar eye with warm gentle arched eyebrow,
 * soft expressive catchlights, and smooth 3D eyelids for natural blinking.
 */
const StylizedEye3D: React.FC<StylizedEyeProps> = ({
  name,
  side,
  position,
  rotation,
  blinkAmount,
  pupilOffsetX,
  pupilOffsetY,
  browRaise,
  browTilt,
  lidAmount,
  smileLift,
}) => {
  void side;

  return (
    <group
      name={name}
      position={[position[0], position[1], position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
      {/* Gentle upward-arched warm espresso eyebrow cleanly between eye & headband */}
      <mesh
        position={[0, 0.031 + browRaise, 0.02]}
        rotation={[0, 0, Math.PI * 0.23 + browTilt]}
        scale={[1.0, 0.56, 0.72]}
        castShadow
      >
        <torusGeometry args={[0.05, 0.0068, 8, 18, Math.PI * 0.54]} />
        <meshStandardMaterial color="#382218" roughness={0.58} />
      </mesh>

      {/* Soft moist sclera (gentle sheen, no hot specular bloom around the iris) */}
      <mesh scale={[1.0, 1.06, 0.34]}>
        <sphereGeometry args={[0.052, 18, 14]} />
        <meshPhysicalMaterial
          color="#fbfbf8"
          roughness={0.34}
          clearcoat={0.25}
          clearcoatRoughness={0.32}
          envMapIntensity={0}
        />
      </mesh>

      {/* Glare-free matte iris & pupil with crisp controlled catchlights */}
      <PixarIris3D
        palette={SENSEI_IRIS}
        radius={0.0365}
        offsetX={pupilOffsetX}
        offsetY={pupilOffsetY}
      />

      {/* Resting upper lid + lash line, smile cushion & blink (shared rig) */}
      <PixarEyelids3D
        eyeRadius={0.052}
        scleraScale={[1.0, 1.06]}
        lidAmount={lidAmount}
        smileLift={smileLift}
        blinkAmount={blinkAmount}
        lidColor="#f9caa9"
        lowerLidColor="#ffd4b5"
        lashColor="#241818"
        lashThickness={0.0062}
      />
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
  readonly fingerCurl: number;
  readonly fingerSpread: number;
  readonly thumbCurl: number;
};

/**
 * Smooth articulated emerald hoodie sleeve, black ninja wrist wrap, and sculpted 5-finger
 * Pixar hand with shoulder, elbow, wrist, and multi-segment finger pivots.
 */
const ArticulatedArm3D: React.FC<ArticulatedArmProps> = ({
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
        <sphereGeometry args={[0.086, 14, 10]} />
        <meshPhysicalMaterial
          color="#11834b"
          roughness={0.78}
          sheen={0.55}
          sheenRoughness={0.62}
          sheenColor="#4ade9c"
        />
      </mesh>

      <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.071, 0.14, 6, 12]} />
        <meshPhysicalMaterial
          color="#11834b"
          roughness={0.78}
          sheen={0.55}
          sheenRoughness={0.62}
          sheenColor="#4ade9c"
        />
      </mesh>

      <group
        position={[0, -0.2, 0]}
        rotation={[elbowRotation[0], elbowRotation[1], elbowRotation[2]]}
      >
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshPhysicalMaterial
            color="#0f7845"
            roughness={0.8}
            sheen={0.5}
            sheenRoughness={0.65}
            sheenColor="#4ade9c"
          />
        </mesh>

        <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.066, 0.125, 6, 12]} />
          <meshPhysicalMaterial
            color="#11834b"
            roughness={0.78}
            sheen={0.55}
            sheenRoughness={0.62}
            sheenColor="#4ade9c"
          />
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

        {/* Wrist & Sculpted 5-Finger Pixar Hand */}
        <group
          position={[0, -0.214, 0]}
          rotation={[wristRotation[0], wristRotation[1], wristRotation[2]]}
        >
          <PixarHand3D
            side={side}
            skinColor="#ffd2b0"
            scale={1.04}
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
 * Pixar-Chibi 3D JungGo Ninja Host Character matched A-to-Z to `public/images/studio-reference.jpg`.
 * Vibrant emerald hoodie, warm peach chibi face with rosy cheeks & D-shaped lip-sync mouth,
 * gold-trimmed matte-black studio headphones, green headband with flowing tails, 96-frame
 * natural blinking, and expressive teacher-like hand/finger gestures.
 */
export const NinjaHost3D: React.FC<NinjaHost3DProps> = ({
  sections,
  subtitles,
  studioMode = "solo",
  boardFocusProgress = 0,
}) => {
  const isDual = studioMode === "dual";
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();

  const activeSection = getActiveSection(sections, timeSec);
  const activeCue = subtitles ? getActiveSubtitle(subtitles, timeSec) : null;
  void activeCue;

  // Dual-Lock Silence-Gated Lip-Sync: requires BOTH active speech window AND RMS >= 0.035
  const mouthMetrics = computeDualLockMouthMetrics(
    subtitles,
    false,
    timeSec,
    fps,
    audio,
    isGuestSpeaker,
  );
  const isHostSpeaking = mouthMetrics.isSpeakingNow;
  const voiceEnergy = mouthMetrics.voiceEnergy;
  const speechPeak = mouthMetrics.speechPeak;
  const mouthOpen = mouthMetrics.jawOpen;
  const mouthWidth = mouthMetrics.mouthWidth;

  const vocabWeight = computeSectionWeight(
    sections,
    ["vocabulary", "grammar", "kanji_lesson", "station_guide"],
    timeSec,
  );
  const quizWeight = computeSectionWeight(sections, ["quiz"], timeSec);
  const quizRevealWeight = computeQuizRevealWeight(sections, timeSec);

  const calmGestures = computeCalmGestureEnvelopes(
    frame,
    fps,
    sections,
    subtitles,
    false,
  );
  const pointBoardWeight = calmGestures.pointBoardWeight;
  const nodEncourageWeight = clamp01(
    Math.max(calmGestures.nodEncourageWeight, quizRevealWeight * 0.75),
  );
  const thinkingWeight = clamp01(
    Math.max(
      calmGestures.thinkingWeight,
      quizWeight * (1 - quizRevealWeight) * 0.7,
    ),
  );
  const calmEmphasisWeight = calmGestures.calmEmphasisWeight;

  const logoTexture = useMemo(() => createHoodieLogoTexture(), []);
  const blushTexture = useMemo(() => createSoftBlushTexture(), []);

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
      blushTexture.dispose();
      torsoGeometry.dispose();
      upperTailGeometry.dispose();
      lowerTailGeometry.dispose();
    };
  }, [
    logoTexture,
    blushTexture,
    torsoGeometry,
    upperTailGeometry,
    lowerTailGeometry,
  ]);

  const layout = isDual ? SENSEI_LAYOUT.dual : SENSEI_LAYOUT.solo;
  const hostPos: [number, number, number] = [
    layout.position[0],
    layout.position[1],
    layout.position[2],
  ];
  const rootYaw = layout.yaw;
  /** Maria sits to Sensei's left (+X world), so turning toward her is +yaw. */
  const partnerSide = 1;

  // Natural irregular blinking (3–5s apart, rare double-blinks; independent of Maria's)
  const blinkSchedule = useMemo(
    () => buildBlinkSchedule("sensei", durationInFrames / fps, 2.1),
    [durationInFrames, fps],
  );
  const blinkAmount = computeBlinkAmount(blinkSchedule, timeSec);

  // Smooth speaking/listening envelopes (no per-syllable snapping)
  const selfSpeaking = computeSpeakingEnvelope(subtitles, false, timeSec);
  const mariaSpeaking = isDual
    ? computeSpeakingEnvelope(subtitles, true, timeSec)
    : 0;
  const listenerWeight = clamp01(mariaSpeaking * (1 - selfSpeaking));

  // Layered social gaze: eyes lead (150ms) -> head -> torso (120ms lag), with
  // brief ~0.8s audience check-ins every 3.5–5s while talking to Maria.
  const audienceCheckIns = useMemo(
    () => (isDual ? buildAudienceCheckIns(sections, subtitles, false) : []),
    [isDual, sections, subtitles],
  );
  const listenerNods = useMemo(
    () => (isDual ? buildListenerNods(subtitles, false) : []),
    [isDual, subtitles],
  );
  // Independent listener gaze: while Maria talks, Sensei watches her (with brief
  // audience glances) instead of sharing her lens/board gaze like a twin.
  const listenerGaze = useMemo(
    () =>
      isDual
        ? { forGuest: false, glances: buildListenerGlances(subtitles, false) }
        : undefined,
    [isDual, subtitles],
  );
  const questionLifts = useMemo(
    () => buildQuestionLifts(subtitles, false),
    [subtitles],
  );
  const gaze = computeLayeredGaze(
    sections,
    subtitles,
    timeSec,
    audienceCheckIns,
    listenerGaze,
  );
  // 0.2s-old gaze drives the overlapping action of headband tails & drawstrings
  const lagGaze = computeLayeredGaze(
    sections,
    subtitles,
    timeSec - 0.2,
    audienceCheckIns,
    listenerGaze,
  );
  const questionLift = computeQuestionLift(questionLifts, timeSec);

  // True eye contact: aim at the real lens (studio wide or circular PIP camera)
  const cameraPose = computeCameraPose(
    timeSec,
    sections,
    subtitles ?? [],
    studioMode,
    boardFocusProgress,
  );
  const lens = computeLensDirection(cameraPose.pos, [
    hostPos[0],
    hostPos[1] + 0.78,
    hostPos[2] + 0.02,
  ]);

  // World-space yaw targets per gaze mode.
  // camera : torso gently open toward Maria, head & eyes square to the lens.
  // partner: soft ~9.5° torso + ~18° head on top (≈27° from the lens line, never a
  //          45° profile); the eyes finish the line toward Maria.
  // board  : unchanged board-reading angles, eased by a smooth speaking envelope.
  const boardTorsoWorld = rootYaw + lerp(0.08, 0.14, pointBoardWeight);
  const boardHeadWorld =
    boardTorsoWorld +
    lerp(
      lerp(0.22 + 0.05 * Math.sin(timeSec * 0.9), 0.28, selfSpeaking),
      0.36,
      pointBoardWeight,
    );
  const listenerAtBoard = lerp(
    0.72 + 0.18 * Math.sin(timeSec * 0.9),
    1,
    selfSpeaking,
  );
  const partnerTorsoWorld = lens.yaw + partnerSide * (isDual ? 0.165 : 0.06);
  const partnerHeadWorld = partnerTorsoWorld + partnerSide * (isDual ? 0.31 : 0.08);

  const torsoTargets = {
    camera: lens.yaw + partnerSide * 0.03,
    partner: partnerTorsoWorld,
    board: boardTorsoWorld,
  };
  const headTargets = {
    camera: lens.yaw,
    partner: partnerHeadWorld,
    board: boardHeadWorld,
  };
  const eyeTargets = {
    camera: lens.yaw,
    partner: partnerHeadWorld + partnerSide * (isDual ? 0.24 : 0.08),
    board:
      boardHeadWorld +
      lerp(0.21, 0.3, Math.max(selfSpeaking, pointBoardWeight)) *
        listenerAtBoard,
  };

  // Breathing & Torso Motion (overlapping action: torso trails the head)
  const breathY = Math.sin(timeSec * 2.15) * 0.011;
  const torsoSway = Math.sin(timeSec * 0.75) * 0.015;
  const torsoWorld = blendGazeTargets(gaze.torso, torsoTargets);
  const torsoYaw = torsoWorld - rootYaw + torsoSway;
  const torsoPitch =
    0.02 +
    voiceEnergy * 0.024 +
    quizRevealWeight * -0.022 +
    listenerWeight * gaze.torso.partner * 0.022;
  // Slow idle weight shift (~12s period, own phase) + a resting shoulder tilt
  const weightShift = Math.sin(timeSec * 0.52 + 0.3) * 0.016;
  const torsoRoll = 0.012 + weightShift;
  const torsoShiftX = weightShift * 0.35;
  // Torso yaw/pitch change over the last 0.2s, for lagging cloth
  const torsoLagYaw =
    blendGazeTargets(lagGaze.torso, torsoTargets) - torsoWorld;

  // Head Turning (stabilised against torso sway), Nodding & Tilting
  const speakBobY = isHostSpeaking ? voiceEnergy * 0.012 : 0;
  const headWorld =
    blendGazeTargets(gaze.head, headTargets) +
    Math.sin(timeSec * 1.05) * 0.022 * (1 - pointBoardWeight * 0.4) +
    (isHostSpeaking ? Math.cos(timeSec * 4.8) * voiceEnergy * 0.018 : 0);
  const headYaw = headWorld - torsoWorld - torsoSway;
  const headLagYaw = blendGazeTargets(lagGaze.head, headTargets) -
    blendGazeTargets(gaze.head, headTargets);

  // Eyes lead the head and hold the target while the head drifts (VOR-style)
  const eyeWorld = blendGazeTargets(gaze.eyes, eyeTargets);
  const pupilOffsetX =
    gazeAngleToPupilOffset(eyeWorld - headWorld) +
    Math.sin(timeSec * 0.85) * 0.0006;
  const pupilOffsetY =
    Math.cos(timeSec * 1.35) * 0.0012 +
    gaze.eyes.camera * Math.sin(lens.pitch) * 0.05 +
    quizRevealWeight * 0.002 +
    pointBoardWeight * 0.003 +
    thinkingWeight * 0.0065;

  const speechNod = isHostSpeaking
    ? Math.sin(timeSec * 7.2) * voiceEnergy * 0.045 + voiceEnergy * 0.02
    : 0;
  // Organic listening nods on Maria's phrase boundaries (strongest when facing her)
  const listeningNod =
    computeListenerNodPitch(listenerNods, timeSec) *
    (1 - selfSpeaking) *
    lerp(0.45, 1, gaze.head.partner);
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

  // Warm 3–5° head tilt toward Maria (a touch more while listening)
  const partnerTilt =
    -partnerSide * gaze.head.partner * lerp(0.055, 0.08, listenerWeight);
  const headRoll =
    Math.sin(timeSec * 1.25) * 0.022 -
    torsoRoll * 0.65 +
    questionLift * 0.035 +
    partnerTilt +
    thinkingWeight * 0.16 -
    vocabWeight * 0.024 +
    nodEncourageWeight * 0.02;

  // Warmth: smiles while encouraging, on quiz reveals, and softly while listening
  const smileWarmth = clamp01(
    nodEncourageWeight * 0.8 + quizRevealWeight * 0.7 + listenerWeight * 0.3,
  );
  const browRaise =
    0.004 +
    (isHostSpeaking ? voiceEnergy * 0.009 + speechPeak * 0.005 : 0) +
    questionLift * 0.009 +
    quizWeight * 0.004 +
    nodEncourageWeight * 0.007 +
    thinkingWeight * 0.004;
  // Positive gentle inner-brow lift keeps expressions warm, relaxed, and welcoming
  const friendlyBrowTilt =
    0.045 +
    questionLift * 0.03 +
    nodEncourageWeight * 0.025 +
    thinkingWeight * 0.015;
  // Thinking = one quizzical brow up, the other slightly down
  const browAsym = thinkingWeight * 0.008;
  const lidAmount = computeUpperLidAmount(
    SENSEI_REST_LID,
    blinkAmount,
    pupilOffsetY,
    questionLift,
    smileWarmth,
  );

  // Headband tails trail head turns (overlapping action) on top of a soft flutter
  const tailSway =
    Math.sin(timeSec * 2.65) * 0.06 + voiceEnergy * 0.05 - headLagYaw * 0.9;
  const tailLagYaw = headLagYaw * 1.4;
  // Drawstrings swing against torso turns and settle with breathing
  const drawstringSwingZ = -torsoLagYaw * 0.9 + Math.sin(timeSec * 1.7) * 0.025;
  const drawstringSwingX =
    0.08 + Math.sin(timeSec * 2.15 + 0.6) * 0.03 - torsoPitch * 0.6;

  // Calm, Unhurried Phrase-Level Arm & Hand Gestures ("Less-Is-More": ~0.4 Hz max, quiet desk rest when listening)
  const slowBreathArm = Math.sin(timeSec * 1.9) * 0.018;
  const calmDrift = Math.sin(timeSec * 2.5) * 0.022;
  const calmFollowThrough = Math.cos(timeSec * 2.1 + 0.5) * 0.02;

  // Right Arm (-X, viewer's left): forearm angled down, palm resting flat on the desk
  // (~95% of time), gently raises on thinking cues. Deliberately not a mirror of the left.
  const rightRestShoulder: [number, number, number] = [
    -0.46 + slowBreathArm,
    0.05,
    -0.14 - calmEmphasisWeight * 0.03,
  ];
  const rightThinkShoulder: [number, number, number] = [
    -0.9 + slowBreathArm,
    0.22,
    -0.32,
  ];
  const rightShoulderRot: [number, number, number] = [
    lerp(rightRestShoulder[0], rightThinkShoulder[0], thinkingWeight),
    lerp(rightRestShoulder[1], rightThinkShoulder[1], thinkingWeight),
    lerp(rightRestShoulder[2], rightThinkShoulder[2], thinkingWeight),
  ];

  const rightRestElbow: [number, number, number] = [
    -0.42 - calmEmphasisWeight * 0.05 + slowBreathArm * 0.6,
    0,
    0.3,
  ];
  const rightThinkElbow: [number, number, number] = [
    -1.6 + calmFollowThrough * 0.5,
    0.12,
    0.44,
  ];
  const rightElbowRot: [number, number, number] = [
    lerp(rightRestElbow[0], rightThinkElbow[0], thinkingWeight),
    lerp(rightRestElbow[1], rightThinkElbow[1], thinkingWeight),
    lerp(rightRestElbow[2], rightThinkElbow[2], thinkingWeight),
  ];

  // Pronated (palm-down) wrist lying flat on the desk
  const rightRestWrist: [number, number, number] = [
    -0.66 - calmEmphasisWeight * 0.06,
    Math.PI,
    -0.12,
  ];
  const rightThinkWrist: [number, number, number] = [0.22, 0.16, -0.14];
  const rightWristRot: [number, number, number] = [
    lerp(rightRestWrist[0], rightThinkWrist[0], thinkingWeight),
    lerp(rightRestWrist[1], rightThinkWrist[1], thinkingWeight),
    lerp(rightRestWrist[2], rightThinkWrist[2], thinkingWeight),
  ];

  const rightFingerCurl = lerp(
    lerp(0.3, 0.42, calmEmphasisWeight),
    0.62,
    thinkingWeight,
  );
  const rightFingerSpread = lerp(
    0.1,
    0.28,
    calmEmphasisWeight * (1 - thinkingWeight),
  );
  const rightThumbCurl = lerp(0.22, 0.46, thinkingWeight);

  // Left Arm (+X, viewer's right): rests calmly near desk (~65-70% of time); polite open-palm on key phrases & `point_board`
  const leftRestShoulder: [number, number, number] = [
    -0.4 + slowBreathArm,
    -0.05,
    0.12,
  ];
  const leftEmphasisShoulder: [number, number, number] = [
    -0.56 + calmDrift,
    -0.1,
    0.48 + calmFollowThrough * 0.8,
  ];
  const leftPointShoulder: [number, number, number] = isDual
    ? [
        -0.58 + calmDrift * 0.7,
        -0.16,
        1.08 + calmFollowThrough * 0.7,
      ]
    : [
        -0.36 + calmDrift * 0.7,
        -0.2,
        1.42 + calmFollowThrough * 0.7,
      ];

  const leftRestElbow: [number, number, number] = [
    -0.5 + slowBreathArm * 0.5,
    0,
    -0.26,
  ];
  const leftEmphasisElbow: [number, number, number] = [
    -0.9 + calmFollowThrough,
    0,
    -0.04,
  ];
  const leftPointElbow: [number, number, number] = [
    -0.36 + calmFollowThrough * 0.6,
    0.12,
    0.24,
  ];

  const leftBaseShoulder: [number, number, number] = [
    lerp(leftRestShoulder[0], leftEmphasisShoulder[0], calmEmphasisWeight),
    lerp(leftRestShoulder[1], leftEmphasisShoulder[1], calmEmphasisWeight),
    lerp(leftRestShoulder[2], leftEmphasisShoulder[2], calmEmphasisWeight),
  ];
  const leftShoulderRot: [number, number, number] = [
    lerp(leftBaseShoulder[0], leftPointShoulder[0], pointBoardWeight),
    lerp(leftBaseShoulder[1], leftPointShoulder[1], pointBoardWeight),
    lerp(leftBaseShoulder[2], leftPointShoulder[2], pointBoardWeight),
  ];

  const leftBaseElbow: [number, number, number] = [
    lerp(leftRestElbow[0], leftEmphasisElbow[0], calmEmphasisWeight),
    0,
    lerp(leftRestElbow[2], leftEmphasisElbow[2], calmEmphasisWeight),
  ];
  const leftElbowRot: [number, number, number] = [
    lerp(leftBaseElbow[0], leftPointElbow[0], pointBoardWeight),
    lerp(0, leftPointElbow[1], pointBoardWeight),
    lerp(leftBaseElbow[2], leftPointElbow[2], pointBoardWeight),
  ];

  // Rest: palm-down on the desk (pronated); supinates to an open palm on emphasis
  const leftWristRot: [number, number, number] = [
    lerp(lerp(-0.58, -0.18, calmEmphasisWeight), -0.22, pointBoardWeight),
    lerp(lerp(-Math.PI, -0.18, calmEmphasisWeight), -0.28, pointBoardWeight),
    lerp(lerp(0.14, 0.2, calmEmphasisWeight), 0.24, pointBoardWeight),
  ];

  // Pose-aware finger anatomy: relaxed semi-open rest -> welcoming open palm -> polite Japanese presentation
  const leftFingerCurl = lerp(
    lerp(0.4, 0.18, calmEmphasisWeight),
    0.08,
    pointBoardWeight,
  );
  const leftFingerSpread = lerp(
    lerp(0.14, 0.68, calmEmphasisWeight),
    0.08,
    pointBoardWeight,
  );
  const leftThumbCurl = lerp(
    lerp(0.26, 0.14, calmEmphasisWeight),
    0.12,
    pointBoardWeight,
  );

  void activeSection;

  const hostRot: [number, number, number] = [0, rootYaw, 0];

  return (
    <group position={hostPos} rotation={hostRot}>
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
        position={[torsoShiftX, breathY, 0]}
        rotation={[torsoPitch, torsoYaw, torsoRoll]}
      >
        {/* Vibrant Velvet Emerald-Green JungGo Hoodie */}
        <mesh
          geometry={torsoGeometry}
          scale={[1.08, 1, 0.86]}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color="#11834b"
            roughness={0.78}
            sheen={0.55}
            sheenRoughness={0.62}
            sheenColor="#4ade9c"
          />
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
          <meshPhysicalMaterial
            color="#0e6b3d"
            roughness={0.8}
            sheen={0.45}
            sheenRoughness={0.65}
            sheenColor="#34d399"
          />
        </mesh>
        <mesh
          position={[0, 0.46, -0.06]}
          rotation={[0.35, 0, 0]}
          scale={[1.15, 0.75, 0.9]}
          castShadow
        >
          <torusGeometry args={[0.175, 0.048, 10, 20]} />
          <meshPhysicalMaterial
            color="#148e52"
            roughness={0.78}
            sheen={0.5}
            sheenRoughness={0.62}
            sheenColor="#4ade9c"
          />
        </mesh>

        {/* Emerald Drawstrings with Light Aglets (pivot at the collar, lagging swing) */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.056, 0.465, 0.222]}
            rotation={[
              drawstringSwingX + side * 0.01,
              0,
              side * -0.05 + drawstringSwingZ * (side === 1 ? 1 : 0.85),
            ]}
          >
            <mesh position={[0, -0.075, 0]} castShadow>
              <cylinderGeometry args={[0.007, 0.007, 0.15, 8]} />
              <meshStandardMaterial color="#0b4f2d" roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.155, 0]}>
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
          fingerCurl={rightFingerCurl}
          fingerSpread={rightFingerSpread}
          thumbCurl={rightThumbCurl}
        />

        <ArticulatedArm3D
          name="leftArmGroup"
          side="left"
          shoulderPosition={[0.25, 0.37, 0.02]}
          shoulderRotation={leftShoulderRot}
          elbowRotation={leftElbowRot}
          wristRotation={leftWristRot}
          fingerCurl={leftFingerCurl}
          fingerSpread={leftFingerSpread}
          thumbCurl={leftThumbCurl}
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
            <meshPhysicalMaterial
              color="#ffd4b5"
              roughness={0.44}
              sheen={0.22}
              sheenRoughness={0.75}
              sheenColor="#ffe8d6"
              emissive="#ff8a66"
              emissiveIntensity={0.05}
            />
          </mesh>

          {/* Soft gradient cheek blush decals (rise slightly with a smile) */}
          {[-1, 1].map((side) => (
            <CheekBlush3D
              key={side}
              side={side}
              headRadius={0.292}
              anchor={[0.112, -0.04 + smileWarmth * 0.006]}
              size={[0.1, 0.062]}
              color="#f28a7a"
              opacity={0.6 + smileWarmth * 0.12}
              texture={blushTexture}
            />
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
              args={[0.302, 28, 12, 0, Math.PI * 2, 0, 1.08]}
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

          {/* Expressive 3D Anime Eyes with Warm Friendly Arched Brows */}
          <StylizedEye3D
            name="rightEyeGroup"
            side="right"
            position={[-0.088, 0.022, 0.278]}
            rotation={[0, -0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise - browAsym * 0.3}
            browTilt={friendlyBrowTilt}
            lidAmount={lidAmount}
            smileLift={smileWarmth}
          />
          <StylizedEye3D
            name="leftEyeGroup"
            side="left"
            position={[0.088, 0.022, 0.278]}
            rotation={[0, 0.3, 0]}
            blinkAmount={blinkAmount}
            pupilOffsetX={pupilOffsetX}
            pupilOffsetY={pupilOffsetY}
            browRaise={browRaise + browAsym}
            browTilt={-friendlyBrowTilt}
            lidAmount={lidAmount}
            smileLift={smileWarmth}
          />

          {/* ==================== WARM FRIENDLY PIXAR LIP-SYNC MOUTH ==================== */}
          <group
            name="mouthGroup"
            position={[0, -0.092, 0.279]}
            rotation={[0.3, 0, 0]}
          >
            <PixarMouth3D
              palette={SENSEI_MOUTH}
              halfWidth={0.047}
              headRadius={0.292}
              jawOpen={mouthOpen}
              mouthWidth={mouthWidth}
              smile={smileWarmth}
            />
          </group>

          {/* Vibrant Emerald-Green Ninja Headband + Flowing Ribbon Tails */}
          <group position={[0, 0.156, 0]} rotation={[0.08, 0, 0]}>
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

            <group position={[-0.296, -0.01, -0.03]} rotation={[0, tailLagYaw, 0]}>
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
