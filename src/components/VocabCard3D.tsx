import React, { useEffect, useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EpisodeSection, QuizCardData, VocabCardData } from "../data/demoEpisode";
import {
  createQuizCardTexture,
  createVocabCardTexture,
} from "../utils/textures";

type VocabCard3DProps = {
  readonly sections: readonly EpisodeSection[];
};

const VocabBoardMesh: React.FC<{
  readonly vocab: VocabCardData;
  readonly startSec: number;
  readonly endSec: number;
  readonly timeSec: number;
}> = ({ vocab, startSec, endSec, timeSec }) => {
  const cardTexture = useMemo(() => createVocabCardTexture(vocab), [vocab]);

  useEffect(() => {
    return () => {
      cardTexture.dispose();
    };
  }, [cardTexture]);

  // Smooth slide-in from right and clean slide-out before unmount
  const enterProgress = interpolate(
    timeSec,
    [startSec + 0.15, startSec + 0.95],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const exitProgress = interpolate(
    timeSec,
    [endSec - 0.55, endSec - 0.05],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const visibility = Math.max(0, enterProgress * (1 - exitProgress));
  if (visibility <= 0.005) {
    return null;
  }

  const posX =
    interpolate(enterProgress, [0, 1], [2.45, 0.88]) +
    interpolate(exitProgress, [0, 1], [0, 1.35]);
  const floatY = Math.sin((timeSec - startSec) * 2.1) * 0.025;
  const rotY = -0.24 + (1 - enterProgress) * 0.35;
  const scale = 0.88 + visibility * 0.12;

  return (
    <group
      position={[posX, 1.38 + floatY, 0.25]}
      rotation={[0.02, rotY, 0]}
      scale={scale}
    >
      {/* Frosted Glassmorphic 3D Backing Slab */}
      <mesh position={[0, 0, -0.022]} castShadow>
        <boxGeometry args={[1.64, 1.09, 0.036]} />
        <meshPhysicalMaterial
          color="#0f2532"
          transparent
          opacity={0.74 * visibility}
          roughness={0.14}
          metalness={0.12}
          clearcoat={0.85}
        />
      </mesh>

      {/* Subtle Glowing Mint Edge Frame */}
      <mesh position={[0, 0, -0.026]}>
        <boxGeometry args={[1.68, 1.13, 0.018]} />
        <meshStandardMaterial
          color="#38f6b5"
          emissive="#22e3a4"
          emissiveIntensity={0.85 * visibility}
          transparent
          opacity={0.55 * visibility}
        />
      </mesh>

      {/* Crisp Front Typography & Glass Content Face */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[1.6, 1.06]} />
        <meshBasicMaterial
          map={cardTexture}
          transparent
          opacity={visibility}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const QuizBoardMesh: React.FC<{
  readonly quiz: QuizCardData;
  readonly startSec: number;
  readonly endSec: number;
  readonly timeSec: number;
}> = ({ quiz, startSec, endSec, timeSec }) => {
  const revealed = timeSec >= quiz.revealSec;

  const quizPendingTex = useMemo(
    () => createQuizCardTexture(quiz, false),
    [quiz],
  );
  const quizRevealedTex = useMemo(
    () => createQuizCardTexture(quiz, true),
    [quiz],
  );

  useEffect(() => {
    return () => {
      quizPendingTex.dispose();
      quizRevealedTex.dispose();
    };
  }, [quizPendingTex, quizRevealedTex]);

  const enterProgress = interpolate(
    timeSec,
    [startSec + 0.12, startSec + 0.85],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const exitProgress = interpolate(
    timeSec,
    [endSec - 0.35, endSec],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const visibility = Math.max(0, enterProgress * (1 - exitProgress));
  if (visibility <= 0.005) {
    return null;
  }

  // Countdown bar progress: 1.0 -> 0.0 over countdownDurationSec
  const remainingFraction = interpolate(
    timeSec,
    [
      quiz.countdownStartSec,
      quiz.countdownStartSec + quiz.countdownDurationSec,
    ],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Subtle celebratory pop scale when answer reveals
  const revealPop = revealed
    ? 1 +
      interpolate(
        timeSec,
        [quiz.revealSec, quiz.revealSec + 0.16, quiz.revealSec + 0.4],
        [0, 0.045, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 1;

  const posX = interpolate(enterProgress, [0, 1], [2.2, 0.84]);
  const floatY = Math.sin((timeSec - startSec) * 2.4) * 0.022;
  const rotY = -0.2 + (1 - enterProgress) * 0.28;
  const barMaxWidth = 1.42;
  const barFillWidth = revealed
    ? barMaxWidth
    : Math.max(0.02, barMaxWidth * remainingFraction);

  const barColor = revealed
    ? "#38f6b5"
    : remainingFraction > 0.5
      ? "#38f6b5"
      : remainingFraction > 0.25
        ? "#fbbf24"
        : "#fb7185";

  return (
    <group
      position={[posX, 1.39 + floatY, 0.34]}
      rotation={[0.02, rotY, 0]}
      scale={(0.9 + visibility * 0.1) * revealPop}
    >
      {/* Frosted 3D Quiz Backing Panel */}
      <mesh position={[0, 0, -0.024]} castShadow>
        <boxGeometry args={[1.66, 1.14, 0.04]} />
        <meshPhysicalMaterial
          color="#161230"
          transparent
          opacity={0.82 * visibility}
          roughness={0.15}
          metalness={0.18}
          clearcoat={0.9}
        />
      </mesh>

      {/* Glowing Rim Frame (shifts violet -> emerald on answer reveal) */}
      <mesh position={[0, 0, -0.028]}>
        <boxGeometry args={[1.7, 1.18, 0.02]} />
        <meshStandardMaterial
          color={revealed ? "#38f6b5" : "#a78bfa"}
          emissive={revealed ? "#22e3a4" : "#8b5cf6"}
          emissiveIntensity={(revealed ? 1.5 : 0.95) * visibility}
          transparent
          opacity={0.7 * visibility}
        />
      </mesh>

      {/* Main Quiz Content Face */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[1.62, 1.1]} />
        <meshBasicMaterial
          map={revealed ? quizRevealedTex : quizPendingTex}
          transparent
          opacity={visibility}
          toneMapped={false}
        />
      </mesh>

      {/* Real 3D Visual Countdown Bar Track (bottom of card) */}
      <mesh position={[0, -0.465, 0.015]}>
        <boxGeometry args={[barMaxWidth, 0.042, 0.014]} />
        <meshStandardMaterial color="#1f2438" roughness={0.5} />
      </mesh>

      {/* Animated 3D Countdown Bar Fill */}
      <mesh
        position={[-(barMaxWidth - barFillWidth) / 2, -0.465, 0.024]}
      >
        <boxGeometry args={[barFillWidth, 0.036, 0.018]} />
        <meshStandardMaterial
          color={barColor}
          emissive={barColor}
          emissiveIntensity={1.65}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};

/**
 * Renders floating 3D glassmorphic display boards in true 3D space:
 * - Vocabulary / Grammar Card during "vocabulary" & "grammar" sections
 * - Quiz Card + 3D visual countdown bar during "quiz" sections
 */
export const VocabCard3D: React.FC<VocabCard3DProps> = ({ sections }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  return (
    <group>
      {sections.map((section) => {
        if (
          (section.type === "vocabulary" || section.type === "grammar") &&
          section.vocab &&
          timeSec >= section.startSec &&
          timeSec <= section.endSec
        ) {
          return (
            <VocabBoardMesh
              key={section.id}
              vocab={section.vocab}
              startSec={section.startSec}
              endSec={section.endSec}
              timeSec={timeSec}
            />
          );
        }

        if (
          section.type === "quiz" &&
          section.quiz &&
          timeSec >= section.startSec &&
          timeSec <= section.endSec
        ) {
          return (
            <QuizBoardMesh
              key={section.id}
              quiz={section.quiz}
              startSec={section.startSec}
              endSec={section.endSec}
              timeSec={timeSec}
            />
          );
        }

        return null;
      })}
    </group>
  );
};
