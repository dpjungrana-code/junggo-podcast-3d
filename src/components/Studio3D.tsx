import React, { useEffect, useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  SubtitleCue,
  getActiveSection,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";
import {
  createBookCoverTexture,
  createLaptopScreenTexture,
  createMugTexture,
  createNeonSignTexture,
  createScriptNotesTexture,
  createStudioWallTexture,
  createTokyoSkyTexture,
  createWoodTexture,
} from "../utils/textures";
import { NinjaHost3D } from "./NinjaHost3D";

type Studio3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
};

const BOKEH_LIGHTS: readonly {
  readonly pos: readonly [number, number, number];
  readonly radius: number;
  readonly color: string;
  readonly phase: number;
}[] = [
  { pos: [1.75, 1.12, -5.2], radius: 0.08, color: "#ffbe6b", phase: 0.2 },
  { pos: [2.35, 0.9, -5.8], radius: 0.11, color: "#ff8c5a", phase: 1.1 },
  { pos: [3.1, 1.24, -6.2], radius: 0.09, color: "#ffd88a", phase: 2.3 },
  { pos: [3.8, 0.98, -5.5], radius: 0.12, color: "#ff7262", phase: 0.8 },
  { pos: [2.05, 1.56, -6.9], radius: 0.07, color: "#9ee7ff", phase: 3.1 },
  { pos: [2.72, 0.85, -5.0], radius: 0.1, color: "#ffcb77", phase: 1.7 },
  { pos: [3.4, 1.48, -6.8], radius: 0.08, color: "#ffaa64", phase: 4.0 },
  { pos: [4.1, 1.12, -6.1], radius: 0.11, color: "#ff9e7d", phase: 2.8 },
  { pos: [1.62, 0.88, -6.4], radius: 0.09, color: "#ffae52", phase: 5.2 },
  { pos: [2.55, 1.72, -7.4], radius: 0.06, color: "#b6a6ff", phase: 0.6 },
  { pos: [4.2, 1.82, -7.2], radius: 0.07, color: "#ffd29d", phase: 3.6 },
  { pos: [2.25, 1.32, -6.3], radius: 0.075, color: "#52f7c1", phase: 4.5 },
  { pos: [3.25, 0.78, -5.3], radius: 0.1, color: "#ff944d", phase: 1.9 },
  { pos: [4.4, 1.38, -6.6], radius: 0.09, color: "#ffd384", phase: 2.5 },
];

const SKYLINE_BUILDINGS: readonly {
  readonly pos: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: string;
  readonly windowColor: string;
}[] = [
  {
    pos: [1.55, 0.68, -8.4],
    size: [0.64, 1.7, 0.55],
    color: "#14182d",
    windowColor: "#ffd28a",
  },
  {
    pos: [2.18, 0.86, -8.9],
    size: [0.58, 2.05, 0.5],
    color: "#181d37",
    windowColor: "#ffbe73",
  },
  {
    pos: [2.72, 0.58, -8.6],
    size: [0.48, 1.45, 0.48],
    color: "#12162b",
    windowColor: "#8ed8ff",
  },
  {
    pos: [4.18, 0.92, -8.8],
    size: [0.68, 2.25, 0.52],
    color: "#171c33",
    windowColor: "#ffd596",
  },
  {
    pos: [4.85, 0.72, -7.8],
    size: [0.64, 1.85, 0.52],
    color: "#13182e",
    windowColor: "#ffa96b",
  },
  {
    pos: [1.82, 0.5, -7.2],
    size: [0.48, 1.15, 0.45],
    color: "#101426",
    windowColor: "#ffcb77",
  },
  {
    pos: [5.85, 0.68, -7.6],
    size: [0.62, 1.65, 0.48],
    color: "#111529",
    windowColor: "#a2d2ff",
  },
];

const computeQuizFactor = (
  sections: readonly EpisodeSection[],
  timeSec: number,
): number => {
  const quizSection = sections.find((s) => s.type === "quiz");
  if (!quizSection) {
    return 0;
  }
  const fade = 0.65;
  const enter = interpolate(
    timeSec,
    [quizSection.startSec - fade * 0.4, quizSection.startSec + fade * 0.6],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
  const exit = interpolate(
    timeSec,
    [quizSection.endSec - fade * 0.5, quizSection.endSec + fade * 0.3],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
  return Math.min(enter, exit);
};

/**
 * Stylized 3D potted indoor plant for desk, shelves, and floor corners.
 */
const PottedPlant: React.FC<{
  readonly position: [number, number, number];
  readonly scale?: number;
  readonly potColor?: string;
}> = ({ position, scale = 1, potColor = "#2a2e35" }) => {
  const leafAngles = [0, 0.85, 1.7, 2.55, 3.4, 4.25, 5.1, 5.8];
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.115, 0.088, 0.22, 18]} />
        <meshStandardMaterial color={potColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.215, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.02, 14]} />
        <meshStandardMaterial color="#3c281b" roughness={0.95} />
      </mesh>
      {leafAngles.map((angle, idx) => {
        const lift = 0.26 + (idx % 3) * 0.055;
        const spread = 0.09 + (idx % 2) * 0.04;
        return (
          <mesh
            key={idx}
            position={[
              Math.cos(angle) * spread,
              lift,
              Math.sin(angle) * spread,
            ]}
            rotation={[
              0.42 + (idx % 3) * 0.14,
              -angle,
              0.25 * (idx % 2 === 0 ? 1 : -1),
            ]}
            castShadow
          >
            <sphereGeometry args={[0.075, 10, 8]} />
            <meshStandardMaterial
              color={idx % 2 === 0 ? "#286439" : "#357e47"}
              roughness={0.62}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * Sculpted 3D Japanese Bonsai Tree in a shallow ceramic tray.
 */
const BonsaiTree3D: React.FC<{
  readonly position: [number, number, number];
  readonly scale?: number;
}> = ({ position, scale = 1 }) => {
  return (
    <group position={position} scale={scale}>
      {/* Shallow rectangular bonsai tray */}
      <mesh position={[0, 0.028, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.055, 0.2]} />
        <meshStandardMaterial color="#232830" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.058, 0]}>
        <boxGeometry args={[0.28, 0.012, 0.16]} />
        <meshStandardMaterial color="#342318" roughness={0.95} />
      </mesh>
      {/* Curved organic bonsai trunk */}
      <mesh position={[-0.03, 0.11, 0]} rotation={[0, 0, -0.24]} castShadow>
        <cylinderGeometry args={[0.018, 0.028, 0.12, 8]} />
        <meshStandardMaterial color="#4f3524" roughness={0.85} />
      </mesh>
      <mesh position={[0.01, 0.19, 0.01]} rotation={[0.08, 0, 0.35]} castShadow>
        <cylinderGeometry args={[0.012, 0.018, 0.11, 8]} />
        <meshStandardMaterial color="#4f3524" roughness={0.85} />
      </mesh>
      <mesh position={[-0.06, 0.17, -0.01]} rotation={[0, 0, 0.55]} castShadow>
        <cylinderGeometry args={[0.009, 0.014, 0.085, 7]} />
        <meshStandardMaterial color="#4f3524" roughness={0.85} />
      </mesh>
      {/* Layered bonsai foliage pads */}
      {[
        [-0.09, 0.21, 0.01, 0.075],
        [0.05, 0.25, 0.02, 0.088],
        [-0.01, 0.28, -0.01, 0.072],
        [0.11, 0.2, -0.01, 0.062],
      ].map(([fx, fy, fz, r], idx) => (
        <mesh
          key={idx}
          position={[fx, fy, fz]}
          scale={[1.35, 0.58, 1.05]}
          castShadow
        >
          <sphereGeometry args={[r, 12, 10]} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? "#245c34" : "#2f7541"}
            roughness={0.72}
          />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Japanese porcelain sake flasks & ceramic teapot shelf display.
 */
const JapaneseCeramics3D: React.FC<{
  readonly position: [number, number, number];
}> = ({ position }) => {
  return (
    <group position={position}>
      {/* Tall white porcelain sake flask */}
      <group position={[-0.12, 0, 0]}>
        <mesh position={[0, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.044, 0.14, 14]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.155, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.028, 0.04, 12]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <cylinderGeometry args={[0.038, 0.04, 0.02, 14]} />
          <meshStandardMaterial color="#2c4a6e" roughness={0.35} />
        </mesh>
      </group>
      {/* Secondary flask + cup */}
      <group position={[0.02, 0, 0.02]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.026, 0.036, 0.11, 14]} />
          <meshStandardMaterial color="#dfd9cf" roughness={0.32} />
        </mesh>
        <mesh position={[0.08, 0.022, 0.02]} castShadow>
          <cylinderGeometry args={[0.022, 0.017, 0.044, 12]} />
          <meshStandardMaterial color="#ebe7df" roughness={0.28} />
        </mesh>
      </group>
      {/* Dark iron/ceramic kyusu teapot */}
      <group position={[0.2, 0, -0.01]}>
        <mesh position={[0, 0.042, 0]} scale={[1.15, 0.82, 1.15]} castShadow>
          <sphereGeometry args={[0.048, 14, 10]} />
          <meshStandardMaterial color="#2a2422" roughness={0.55} />
        </mesh>
        <mesh
          position={[-0.055, 0.05, 0]}
          rotation={[0, 0, 0.72]}
          castShadow
        >
          <cylinderGeometry args={[0.008, 0.012, 0.045, 8]} />
          <meshStandardMaterial color="#2a2422" roughness={0.55} />
        </mesh>
      </group>
    </group>
  );
};

/**
 * Pair of stylized mini chibi collectible figures on the right shelf.
 */
const MiniFigures3D: React.FC<{
  readonly position: [number, number, number];
}> = ({ position }) => {
  const figures = [
    { x: -0.1, bodyColor: "#c93838", hairColor: "#1b1f28" },
    { x: 0.12, bodyColor: "#2e5c8a", hairColor: "#4a3222" },
  ];
  return (
    <group position={position}>
      {figures.map((fig, idx) => (
        <group key={idx} position={[fig.x, 0, 0]}>
          {/* Display base */}
          <mesh position={[0, 0.008, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.054, 0.016, 14]} />
            <meshStandardMaterial color="#1a1e26" roughness={0.5} />
          </mesh>
          {/* Body */}
          <mesh position={[0, 0.065, 0]} castShadow>
            <cylinderGeometry args={[0.032, 0.04, 0.095, 12]} />
            <meshStandardMaterial color={fig.bodyColor} roughness={0.62} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.145, 0]} castShadow>
            <sphereGeometry args={[0.044, 14, 12]} />
            <meshStandardMaterial color="#f5c9a6" roughness={0.55} />
          </mesh>
          {/* Hair cap */}
          <mesh position={[0, 0.16, -0.005]} castShadow>
            <sphereGeometry
              args={[0.046, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58]}
            />
            <meshStandardMaterial color={fig.hairColor} roughness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/**
 * Stylized 3D Tokyo Tower + Glowing Night Tokyo Skyline outside the right window.
 */
const TokyoSkylineBackdrop: React.FC<{ readonly timeSec: number }> = ({
  timeSec,
}) => {
  const skyTexture = useMemo(() => createTokyoSkyTexture(), []);

  useEffect(() => {
    return () => {
      skyTexture.dispose();
    };
  }, [skyTexture]);

  const beaconIntensity = 1.4 + 1.1 * Math.sin(timeSec * 3.8);

  return (
    <group>
      <mesh position={[2.9, 2.2, -11.2]}>
        <planeGeometry args={[11.2, 7.8]} />
        <meshBasicMaterial map={skyTexture} />
      </mesh>

      {/* Distant warm horizon glow */}
      <mesh position={[2.8, 0.45, -10.5]}>
        <planeGeometry args={[9.0, 1.4]} />
        <meshBasicMaterial
          color="#ff8c52"
          transparent
          opacity={0.26}
          depthWrite={false}
        />
      </mesh>

      {/* Layered 3D Tokyo Skyline Buildings */}
      {SKYLINE_BUILDINGS.map((b, idx) => (
        <group key={idx} position={[b.pos[0], b.pos[1], b.pos[2]]}>
          <mesh>
            <boxGeometry args={[b.size[0], b.size[1], b.size[2]]} />
            <meshStandardMaterial color={b.color} roughness={0.85} />
          </mesh>
          {[0.3, 0.05, -0.2, -0.45].map((yOff, wIdx) => (
            <mesh
              key={wIdx}
              position={[0, yOff * b.size[1], b.size[2] / 2 + 0.005]}
            >
              <planeGeometry args={[b.size[0] * 0.72, 0.045]} />
              <meshBasicMaterial
                color={b.windowColor}
                transparent
                opacity={0.55 + ((idx + wIdx) % 3) * 0.14}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Prominent Illuminated Tokyo Tower on Far Right (visible beside PresentationBoard) */}
      <group position={[5.42, 0.32, -5.4]} scale={0.94}>
        {[
          [-0.22, -0.22, 0.16, -0.16],
          [0.22, -0.22, 0.16, 0.16],
          [-0.22, 0.22, -0.16, -0.16],
          [0.22, 0.22, -0.16, 0.16],
        ].map(([lx, lz, rx, rz], idx) => (
          <mesh
            key={idx}
            position={[lx, 0.42, lz]}
            rotation={[rx, 0, rz]}
          >
            <cylinderGeometry args={[0.032, 0.058, 0.92, 6]} />
            <meshStandardMaterial
              color="#ff5733"
              emissive="#ff4518"
              emissiveIntensity={1.0}
              roughness={0.45}
            />
          </mesh>
        ))}

        <mesh position={[0, 0.88, 0]}>
          <cylinderGeometry args={[0.14, 0.29, 0.75, 4]} />
          <meshStandardMaterial
            color="#ff552e"
            emissive="#ff441a"
            emissiveIntensity={0.9}
            wireframe
          />
        </mesh>

        <mesh position={[0, 1.28, 0]}>
          <boxGeometry args={[0.38, 0.14, 0.38]} />
          <meshStandardMaterial
            color="#ffebd2"
            emissive="#ffae42"
            emissiveIntensity={1.35}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 1.38, 0]}>
          <boxGeometry args={[0.3, 0.06, 0.3]} />
          <meshStandardMaterial
            color="#ff5a36"
            emissive="#ff4721"
            emissiveIntensity={0.9}
          />
        </mesh>

        <mesh position={[0, 1.66, 0]}>
          <cylinderGeometry args={[0.088, 0.135, 0.52, 4]} />
          <meshStandardMaterial
            color="#fff3e6"
            emissive="#ffd29d"
            emissiveIntensity={0.75}
          />
        </mesh>

        <mesh position={[0, 2.08, 0]}>
          <cylinderGeometry args={[0.058, 0.088, 0.38, 4]} />
          <meshStandardMaterial
            color="#ff552e"
            emissive="#ff441a"
            emissiveIntensity={1.1}
          />
        </mesh>

        <mesh position={[0, 2.28, 0]}>
          <boxGeometry args={[0.19, 0.1, 0.19]} />
          <meshStandardMaterial
            color="#fff6e0"
            emissive="#ffb84d"
            emissiveIntensity={1.6}
          />
        </mesh>

        <mesh position={[0, 2.55, 0]}>
          <cylinderGeometry args={[0.022, 0.052, 0.45, 8]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffe2b8"
            emissiveIntensity={0.85}
          />
        </mesh>
        <mesh position={[0, 2.92, 0]}>
          <cylinderGeometry args={[0.008, 0.02, 0.36, 8]} />
          <meshStandardMaterial
            color="#ff5226"
            emissive="#ff3b14"
            emissiveIntensity={1.2}
          />
        </mesh>

        <mesh position={[0, 3.12, 0]}>
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshStandardMaterial
            color="#ff3b30"
            emissive="#ff2a1f"
            emissiveIntensity={beaconIntensity}
          />
        </mesh>
      </group>

      {BOKEH_LIGHTS.map((orb, idx) => {
        const twinkle = 0.55 + 0.32 * Math.sin(timeSec * 1.9 + orb.phase);
        const yDrift = Math.sin(timeSec * 0.7 + orb.phase) * 0.02;
        return (
          <mesh
            key={idx}
            position={[orb.pos[0], orb.pos[1] + yDrift, orb.pos[2]]}
          >
            <sphereGeometry args={[orb.radius, 10, 10]} />
            <meshBasicMaterial
              color={orb.color}
              transparent
              opacity={twinkle * 0.6}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * Boom-arm Condenser Microphone clamped on the far-left desk edge,
 * sweeping inward so it sits cleanly below the host's mouth without blocking lip-sync.
 */
const StudioMicrophone3D: React.FC<{
  readonly audioVolume: number;
  readonly isQuiz: boolean;
}> = ({ audioVolume, isQuiz }) => {
  const ledColor = isQuiz ? "#a78bfa" : "#34f5b5";
  const ledIntensity = 0.9 + audioVolume * 2.2;

  return (
    <group position={[-1.92, 0.78, -0.02]}>
      {/* Far-left heavy desk clamp base */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.14, 0.06, 0.14]} />
        <meshStandardMaterial
          color="#171b22"
          metalness={0.65}
          roughness={0.35}
        />
      </mesh>
      {/* Lower boom arm staying low on left */}
      <mesh
        position={[0.38, 0.14, 0.02]}
        rotation={[0.04, 0, -1.28]}
        castShadow
      >
        <cylinderGeometry args={[0.015, 0.017, 0.82, 10]} />
        <meshStandardMaterial
          color="#20252f"
          metalness={0.6}
          roughness={0.38}
        />
      </mesh>
      {/* Articulated elbow joint */}
      <mesh position={[0.76, 0.24, 0.04]} castShadow>
        <sphereGeometry args={[0.026, 12, 12]} />
        <meshStandardMaterial
          color="#38404f"
          metalness={0.75}
          roughness={0.3}
        />
      </mesh>
      {/* Upper boom arm angling upward from below so chest logo stays readable */}
      <mesh
        position={[1.08, 0.27, -0.08]}
        rotation={[0.35, 0, -1.44]}
        castShadow
      >
        <cylinderGeometry args={[0.013, 0.014, 0.66, 10]} />
        <meshStandardMaterial
          color="#20252f"
          metalness={0.6}
          roughness={0.38}
        />
      </mesh>

      {/* Broadcast Condenser Mic Capsule positioned safely below host's mouth */}
      <group position={[1.41, 0.31, -0.2]} rotation={[0.28, 0.45, -0.35]}>
        <mesh position={[0, -0.02, 0]} castShadow>
          <torusGeometry args={[0.064, 0.009, 10, 18, Math.PI]} />
          <meshStandardMaterial
            color="#2b313d"
            metalness={0.75}
            roughness={0.32}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.046, 0.044, 0.17, 20]} />
          <meshStandardMaterial
            color="#1c2028"
            metalness={0.65}
            roughness={0.36}
          />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <torusGeometry args={[0.049, 0.006, 10, 24]} />
          <meshStandardMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={ledIntensity}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.048, 0.068, 10, 18]} />
          <meshStandardMaterial color="#14171d" roughness={0.92} />
        </mesh>
      </group>
    </group>
  );
};

/**
 * Main True 3D JungGo Podcast Studio Scene.
 * Framed with the host and desk props on the left third, warm dark-wood slatted wall,
 * recessed LED shelves with bonsai/ceramics/figures, balanced neon wall sign,
 * and Tokyo Tower skyline through the right window.
 * Strictly driven by useCurrentFrame() — ZERO useFrame().
 */
export const Studio3D: React.FC<Studio3DProps> = ({ sections, subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();

  const activeSection = getActiveSection(sections, timeSec);
  const quizFactor = computeQuizFactor(sections, timeSec);
  const isQuiz = activeSection.type === "quiz";

  const textures = useMemo(
    () => ({
      wood: createWoodTexture(),
      wall: createStudioWallTexture(),
      neon: createNeonSignTexture(),
      mug: createMugTexture(),
      book: createBookCoverTexture(),
      laptop: createLaptopScreenTexture(),
      scriptNotes: createScriptNotesTexture(),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((tex) => tex.dispose());
    };
  }, [textures]);

  const keyIntensity = interpolate(quizFactor, [0, 1], [1.75, 0.95]);
  const rimIntensity = interpolate(quizFactor, [0, 1], [1.35, 2.35]);
  const ambientIntensity = interpolate(quizFactor, [0, 1], [0.46, 0.28]);
  const neonGlowIntensity =
    0.85 + audio.volume * 0.28 + Math.sin(timeSec * 4.5) * 0.03;

  return (
    <group>
      {/* ================= 3-POINT STUDIO LIGHTING ================= */}
      <ambientLight intensity={ambientIntensity} color="#d4dcf7" />
      <hemisphereLight
        args={[
          "#7a96d4",
          "#402b1c",
          interpolate(quizFactor, [0, 1], [0.48, 0.28]),
        ]}
      />

      {/* 1. Warm Studio Key Light */}
      <directionalLight
        position={[-2.2, 3.6, 2.8]}
        intensity={keyIntensity}
        color="#ffe2bf"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-1.5}
        shadow-bias={-0.0005}
      />

      {/* 2. Cool Night Blue Rim Light from Tokyo Window */}
      <directionalLight
        position={[4.5, 2.5, -1.5]}
        intensity={rimIntensity}
        color={quizFactor > 0.35 ? "#9c6bff" : "#7ca8ff"}
      />
      <pointLight
        position={[2.4, 2.1, -1.4]}
        intensity={1.0 + quizFactor * 0.8}
        color={quizFactor > 0.35 ? "#8b5cf6" : "#6c8cff"}
        distance={7.5}
        decay={2}
      />

      {/* 3. Warm Shelf & Host Rim Accent Lights */}
      <pointLight
        position={[-2.25, 1.85, -1.25]}
        intensity={interpolate(quizFactor, [0, 1], [1.4, 0.7])}
        color="#ffb96e"
        distance={5.0}
        decay={2}
      />
      <pointLight
        position={[0.45, 1.85, -1.25]}
        intensity={interpolate(quizFactor, [0, 1], [1.15, 0.6])}
        color="#ffb96e"
        distance={4.5}
        decay={2}
      />
      <pointLight
        position={[-0.65, 2.32, -1.25]}
        intensity={0.85}
        color="#e6efff"
        distance={3.2}
        decay={2}
      />

      {/* ================= STUDIO ROOM ARCHITECTURE ================= */}
      {/* Studio Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 12]} />
        <meshStandardMaterial color="#18151a" roughness={0.85} />
      </mesh>

      {/* Dark-Wood Back Studio Wall (Left/Center) + Window Framing Strips */}
      <mesh position={[-1.4, 1.95, -2.15]} receiveShadow>
        <boxGeometry args={[5.8, 4.1, 0.16]} />
        <meshStandardMaterial map={textures.wall} roughness={0.84} />
      </mesh>
      <mesh position={[3.05, 3.62, -2.15]} receiveShadow>
        <boxGeometry args={[3.5, 0.76, 0.16]} />
        <meshStandardMaterial map={textures.wall} roughness={0.84} />
      </mesh>
      <mesh position={[3.05, 0.32, -2.15]} receiveShadow>
        <boxGeometry args={[3.5, 0.68, 0.16]} />
        <meshStandardMaterial map={textures.wall} roughness={0.84} />
      </mesh>
      <mesh position={[5.05, 1.95, -2.15]} receiveShadow>
        <boxGeometry args={[0.6, 4.1, 0.16]} />
        <meshStandardMaterial map={textures.wall} roughness={0.84} />
      </mesh>

      {/* Dark-Wood Vertical Acoustic Slats behind Host & Neon Sign */}
      {Array.from({ length: 20 }, (_, idx) => (
        <mesh
          key={idx}
          position={[-2.18 + idx * 0.155, 1.95, -2.04]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.075, 3.6, 0.055]} />
          <meshStandardMaterial color="#462e1e" roughness={0.72} />
        </mesh>
      ))}

      {/* Warm Ceiling Downlight Pucks */}
      {[-1.55, -0.75, 0.15].map((lx, idx) => (
        <mesh key={idx} position={[lx, 3.24, -1.9]}>
          <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
          <meshStandardMaterial
            color="#fff2d6"
            emissive="#ffcf87"
            emissiveIntensity={1.5}
          />
        </mesh>
      ))}

      {/* ================= LEFT RECESSED WARM LED SHELVES ================= */}
      <group position={[-2.42, 1.52, -1.86]}>
        <mesh position={[0, 0, -0.14]} receiveShadow>
          <boxGeometry args={[1.05, 2.3, 0.05]} />
          <meshStandardMaterial color="#382417" roughness={0.8} />
        </mesh>
        {[-0.85, -0.18, 0.48, 1.08].map((sy, idx) => (
          <group key={idx} position={[0, sy, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1.04, 0.05, 0.34]} />
              <meshStandardMaterial map={textures.wood} roughness={0.62} />
            </mesh>
            {idx > 0 && (
              <mesh position={[0, -0.028, 0.08]}>
                <boxGeometry args={[0.94, 0.012, 0.016]} />
                <meshStandardMaterial
                  color="#ffd599"
                  emissive="#ffba68"
                  emissiveIntensity={1.45 - quizFactor * 0.55}
                />
              </mesh>
            )}
          </group>
        ))}
        {[-0.5, 0.5].map((sx, idx) => (
          <mesh key={idx} position={[sx, 0.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.05, 2.05, 0.34]} />
            <meshStandardMaterial map={textures.wood} roughness={0.62} />
          </mesh>
        ))}

        {/* Top Shelf: 3D Bonsai Tree */}
        <BonsaiTree3D position={[0.02, 0.505, 0.02]} scale={1.18} />

        {/* Middle Shelf: Japanese Ceramics & Teapot */}
        <JapaneseCeramics3D position={[0, -0.155, 0.02]} />

        {/* Bottom Shelf: Japanese Books + Hero Book */}
        <mesh position={[0.2, -0.58, 0.02]} rotation={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.22, 0.46, 0.1]} />
          <meshStandardMaterial map={textures.book} roughness={0.65} />
        </mesh>
        <mesh position={[-0.24, -0.61, 0.01]} castShadow>
          <boxGeometry args={[0.075, 0.42, 0.22]} />
          <meshStandardMaterial color="#b83535" roughness={0.7} />
        </mesh>
        <mesh position={[-0.15, -0.63, 0.01]} castShadow>
          <boxGeometry args={[0.065, 0.38, 0.22]} />
          <meshStandardMaterial color="#ebe2cf" roughness={0.75} />
        </mesh>
        <mesh position={[-0.06, -0.62, 0.01]} castShadow>
          <boxGeometry args={[0.07, 0.4, 0.22]} />
          <meshStandardMaterial color="#254c73" roughness={0.72} />
        </mesh>
      </group>

      {/* ================= RIGHT RECESSED WARM LED SHELVES ================= */}
      <group position={[0.42, 1.52, -1.86]}>
        <mesh position={[0, 0, -0.14]} receiveShadow>
          <boxGeometry args={[0.78, 2.15, 0.05]} />
          <meshStandardMaterial color="#382417" roughness={0.8} />
        </mesh>
        {[-0.78, -0.12, 0.52, 1.05].map((sy, idx) => (
          <group key={idx} position={[0, sy, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.76, 0.048, 0.3]} />
              <meshStandardMaterial map={textures.wood} roughness={0.62} />
            </mesh>
            {idx > 0 && (
              <mesh position={[0, -0.026, 0.07]}>
                <boxGeometry args={[0.68, 0.012, 0.015]} />
                <meshStandardMaterial
                  color="#ffd599"
                  emissive="#ffba68"
                  emissiveIntensity={1.4 - quizFactor * 0.55}
                />
              </mesh>
            )}
          </group>
        ))}
        {[-0.36, 0.36].map((sx, idx) => (
          <mesh key={idx} position={[sx, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.045, 1.9, 0.3]} />
            <meshStandardMaterial map={textures.wood} roughness={0.62} />
          </mesh>
        ))}

        {/* Top Shelf: Cute Collectible Mini Figures */}
        <MiniFigures3D position={[0, 0.545, 0.02]} />

        {/* Middle Shelf: Japanese Reference Books */}
        <mesh position={[-0.14, 0.09, 0.01]} castShadow>
          <boxGeometry args={[0.07, 0.38, 0.2]} />
          <meshStandardMaterial color="#1f6642" roughness={0.7} />
        </mesh>
        <mesh position={[-0.05, 0.07, 0.01]} castShadow>
          <boxGeometry args={[0.06, 0.34, 0.2]} />
          <meshStandardMaterial color="#e5dac6" roughness={0.75} />
        </mesh>
        <mesh position={[0.04, 0.08, 0.01]} rotation={[0, 0, -0.06]} castShadow>
          <boxGeometry args={[0.065, 0.36, 0.2]} />
          <meshStandardMaterial color="#a63434" roughness={0.72} />
        </mesh>

        {/* Bottom Shelf: Potted Mini Plant */}
        <PottedPlant position={[0.05, -0.095, 0.02]} scale={0.75} />
      </group>

      {/* ================= BALANCED "JungGo PODCAST STUDIO" NEON SIGN ================= */}
      <mesh position={[-0.82, 2.2, -1.96]}>
        <planeGeometry args={[1.95, 0.98]} />
        <meshStandardMaterial
          map={textures.neon}
          emissiveMap={textures.neon}
          emissive="#ffffff"
          emissiveIntensity={neonGlowIntensity}
          transparent
          depthWrite={false}
          toneMapped={false}
          roughness={0.35}
        />
      </mesh>

      {/* ================= FLOOR-TO-CEILING WINDOW & TOKYO SKYLINE ================= */}
      <group position={[3.15, 1.92, -2.14]}>
        <mesh position={[0, 1.34, 0]}>
          <boxGeometry args={[4.35, 0.085, 0.22]} />
          <meshStandardMaterial color="#181c24" metalness={0.55} roughness={0.42} />
        </mesh>
        <mesh position={[0, -1.34, 0]}>
          <boxGeometry args={[4.35, 0.095, 0.28]} />
          <meshStandardMaterial map={textures.wood} roughness={0.55} />
        </mesh>
        <mesh position={[-2.12, 0, 0]}>
          <boxGeometry args={[0.09, 2.75, 0.22]} />
          <meshStandardMaterial color="#181c24" metalness={0.55} roughness={0.42} />
        </mesh>
        <mesh position={[2.12, 0, 0]}>
          <boxGeometry args={[0.09, 2.75, 0.22]} />
          <meshStandardMaterial color="#181c24" metalness={0.55} roughness={0.42} />
        </mesh>
        {/* Window mullions */}
        <mesh position={[-0.75, 0, 0]}>
          <boxGeometry args={[0.045, 2.66, 0.12]} />
          <meshStandardMaterial color="#1a1f2a" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0.62, 0, 0]}>
          <boxGeometry args={[0.045, 2.66, 0.12]} />
          <meshStandardMaterial color="#1a1f2a" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[4.22, 0.04, 0.12]} />
          <meshStandardMaterial color="#1a1f2a" metalness={0.5} roughness={0.45} />
        </mesh>
        {/* Subtle Glass Pane */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[4.2, 2.62]} />
          <meshPhysicalMaterial
            color="#a8c8ff"
            transparent
            opacity={0.055}
            roughness={0.08}
            metalness={0.15}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Night Tokyo Skyline + Prominent Tokyo Tower Outside */}
      <TokyoSkylineBackdrop timeSec={timeSec} />

      {/* ================= FOREGROUND WOODEN PODCAST DESK & PROPS ================= */}
      <group>
        {/* Main Textured Walnut/Oak Desk Tabletop */}
        <mesh position={[0, 0.735, 0.16]} castShadow receiveShadow>
          <boxGeometry args={[4.85, 0.09, 1.48]} />
          <meshStandardMaterial
            map={textures.wood}
            roughness={0.54}
            metalness={0.05}
          />
        </mesh>
        {[
          [-2.08, 0.35, -0.35],
          [2.08, 0.35, -0.35],
          [-2.08, 0.35, 0.65],
          [2.08, 0.35, 0.65],
        ].map(([lx, ly, lz], idx) => (
          <mesh key={idx} position={[lx, ly, lz]} castShadow>
            <boxGeometry args={[0.08, 0.7, 0.08]} />
            <meshStandardMaterial color="#181b22" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}

        {/* Far-Left Clamped Boom-Arm Condenser Microphone */}
        <StudioMicrophone3D audioVolume={audio.volume} isQuiz={isQuiz} />

        {/* JungGo Branded Ceramic Mug on Left of Desk */}
        <group position={[-1.48, 0.78, 0.22]} rotation={[0, -0.25, 0]}>
          <mesh position={[0, 0.092, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.076, 0.07, 0.185, 24]} />
            <meshStandardMaterial map={textures.mug} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.172, 0]}>
            <cylinderGeometry args={[0.068, 0.068, 0.015, 20]} />
            <meshStandardMaterial color="#361c0f" roughness={0.2} />
          </mesh>
          <mesh position={[-0.08, 0.092, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.046, 0.012, 10, 16, Math.PI]} />
            <meshStandardMaterial color="#f2efe9" roughness={0.24} />
          </mesh>
        </group>

        {/* Script Notes on Desk (left-center & right-back) */}
        <group position={[-0.92, 0.782, 0.28]} rotation={[0, 0.16, 0]}>
          <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[0.26, 0.34]} />
            <meshStandardMaterial map={textures.scriptNotes} roughness={0.85} />
          </mesh>
          <mesh
            position={[0.03, 0.003, -0.02]}
            rotation={[-Math.PI / 2, 0, -0.14]}
            receiveShadow
          >
            <planeGeometry args={[0.26, 0.34]} />
            <meshStandardMaterial map={textures.scriptNotes} roughness={0.85} />
          </mesh>
        </group>

        {/* Open Sleek Dark-Gray Laptop angled toward Host */}
        <group position={[0.24, 0.78, 0.16]} rotation={[0, -0.44, 0]}>
          <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 0.022, 0.46]} />
            <meshStandardMaterial
              color="#636b78"
              metalness={0.78}
              roughness={0.28}
            />
          </mesh>
          <mesh position={[0, 0.025, -0.04]}>
            <boxGeometry args={[0.58, 0.004, 0.21]} />
            <meshStandardMaterial color="#181c24" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.024, 0.14]}>
            <boxGeometry args={[0.19, 0.003, 0.11]} />
            <meshStandardMaterial
              color="#525a66"
              metalness={0.6}
              roughness={0.35}
            />
          </mesh>
          <group position={[0, 0.024, -0.225]} rotation={[-0.28, 0, 0]}>
            <mesh position={[0, 0.22, 0]} castShadow>
              <boxGeometry args={[0.7, 0.44, 0.014]} />
              <meshStandardMaterial
                color="#6a7280"
                metalness={0.8}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[0, 0.22, 0.009]}>
              <planeGeometry args={[0.65, 0.39]} />
              <meshStandardMaterial
                map={textures.laptop}
                emissiveMap={textures.laptop}
                emissive="#ffffff"
                emissiveIntensity={0.6}
              />
            </mesh>
            <mesh position={[0, 0.23, -0.009]} rotation={[0, Math.PI, 0]}>
              <circleGeometry args={[0.042, 22]} />
              <meshStandardMaterial
                color="#48f0b2"
                emissive="#22e3a4"
                emissiveIntensity={0.5 + audio.volume * 0.4}
              />
            </mesh>
          </group>
        </group>

        {/* Mini Tabletop Camera on Tripod on Right Desk */}
        <group position={[0.92, 0.78, 0.32]} rotation={[0, -0.45, 0]}>
          {/* Tripod legs */}
          {[0, 2.09, 4.18].map((ang, idx) => (
            <mesh
              key={idx}
              position={[Math.cos(ang) * 0.06, 0.065, Math.sin(ang) * 0.06]}
              rotation={[Math.sin(ang) * 0.42, 0, -Math.cos(ang) * 0.42]}
              castShadow
            >
              <cylinderGeometry args={[0.008, 0.006, 0.16, 8]} />
              <meshStandardMaterial color="#1b1f26" metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          {/* Camera body */}
          <mesh position={[0, 0.165, 0]} castShadow>
            <boxGeometry args={[0.14, 0.09, 0.075]} />
            <meshStandardMaterial color="#181c22" roughness={0.45} />
          </mesh>
          {/* Camera lens pointing toward host */}
          <mesh
            position={[0, 0.165, -0.05]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.032, 0.035, 0.045, 16]} />
            <meshStandardMaterial color="#101318" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Rear LCD preview screen facing viewer */}
          <mesh position={[0, 0.165, 0.04]}>
            <planeGeometry args={[0.095, 0.056]} />
            <meshStandardMaterial
              color="#1e2c3a"
              emissive="#25544a"
              emissiveIntensity={0.65}
            />
          </mesh>
          {/* Tiny red REC indicator */}
          <mesh position={[0.052, 0.195, 0.04]}>
            <sphereGeometry args={[0.005, 8, 8]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.6} />
          </mesh>
        </group>

        {/* Indoor Studio Plants */}
        <PottedPlant position={[-2.48, 0.0, -0.35]} scale={1.95} />
        <PottedPlant position={[-2.25, 0.38, 0.78]} scale={1.45} />
        <PottedPlant position={[1.45, 0.78, -0.52]} scale={1.25} />
        <PottedPlant position={[2.15, 0.78, 0.42]} scale={1.35} />
      </group>

      {/* ================= PIXAR-INSPIRED NINJA HOST ================= */}
      <NinjaHost3D sections={sections} subtitles={subtitles} />
    </group>
  );
};
