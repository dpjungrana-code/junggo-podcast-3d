import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  StudioMode,
  SubtitleCue,
  getActiveSection,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";
import { usePodcastAudioMetrics } from "../utils/audio";
import {
  createBookCoverTexture,
  createFujiLampTexture,
  createLaptopLidLogoTexture,
  createLaptopScreenTexture,
  createMugTexture,
  createNeonSignTexture,
  createStudioWallTexture,
  createStudyBookStackTexture,
  createTokyoSkyTexture,
  createWoodTexture,
  createYouTubePlaqueTexture,
} from "../utils/textures";
import { FemaleNinjaHost3D, MARIA_LAYOUT } from "./FemaleNinjaHost3D";
import { NinjaHost3D, SENSEI_LAYOUT, SENSEI_MOUTH_LOCAL } from "./NinjaHost3D";

type Studio3DProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles?: readonly SubtitleCue[];
  readonly studioMode?: StudioMode;
  /** 0 = studio wide, 1 = circular PIP; lets hosts aim eye contact at the real lens. */
  readonly boardFocusProgress?: number;
};

const BOKEH_LIGHTS: readonly {
  readonly pos: readonly [number, number, number];
  readonly radius: number;
  readonly color: string;
  readonly phase: number;
}[] = [
  { pos: [1.75, 1.12, -5.2], radius: 0.08, color: "#ffbe6b", phase: 0.2 },
  { pos: [2.35, 0.9, -5.8], radius: 0.11, color: "#93c5fd", phase: 1.1 },
  { pos: [3.1, 1.24, -6.2], radius: 0.09, color: "#ffd88a", phase: 2.3 },
  { pos: [3.8, 0.98, -5.5], radius: 0.12, color: "#ff8c5a", phase: 0.8 },
  { pos: [2.05, 1.56, -6.9], radius: 0.07, color: "#9ee7ff", phase: 3.1 },
  { pos: [2.72, 0.85, -5.0], radius: 0.1, color: "#ffcb77", phase: 1.7 },
  { pos: [4.2, 1.82, -7.2], radius: 0.07, color: "#ffd29d", phase: 3.6 },
  { pos: [4.85, 1.25, -6.2], radius: 0.095, color: "#ffbe6b", phase: 2.4 },
  { pos: [5.75, 1.05, -6.4], radius: 0.085, color: "#93c5fd", phase: 4.1 },
];

const SKYLINE_BUILDINGS: readonly {
  readonly pos: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: string;
  readonly windowColor: string;
}[] = [
  {
    pos: [1.65, 0.7, -8.4],
    size: [0.64, 1.75, 0.55],
    color: "#112452",
    windowColor: "#a5d8ff",
  },
  {
    pos: [2.32, 0.88, -8.9],
    size: [0.58, 2.1, 0.5],
    color: "#142a5e",
    windowColor: "#ffd596",
  },
  {
    pos: [2.95, 0.62, -8.6],
    size: [0.52, 1.5, 0.48],
    color: "#0e204a",
    windowColor: "#93c5fd",
  },
  {
    pos: [4.75, 0.78, -7.9],
    size: [0.64, 1.9, 0.52],
    color: "#122657",
    windowColor: "#ffbe73",
  },
  {
    pos: [5.95, 0.72, -7.7],
    size: [0.62, 1.7, 0.48],
    color: "#10224e",
    windowColor: "#a5d8ff",
  },
];

const PLANT_LEAF_ANGLES = [0, 0.85, 1.7, 2.55, 3.4, 4.25, 5.1, 5.8];

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
 * Stylized 3D potted indoor plant sharing geometry/material instances across placements.
 */
const PottedPlant: React.FC<{
  readonly position: [number, number, number];
  readonly scale?: number;
  readonly potColor?: string;
}> = ({ position, scale = 1, potColor = "#2a2e35" }) => {
  const shared = useMemo(
    () => ({
      potGeo: new THREE.CylinderGeometry(0.115, 0.088, 0.22, 16),
      soilGeo: new THREE.CylinderGeometry(0.105, 0.105, 0.02, 12),
      leafGeo: new THREE.SphereGeometry(0.075, 8, 6),
      potMat: new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.5 }),
      soilMat: new THREE.MeshStandardMaterial({ color: "#3c281b", roughness: 0.95 }),
      leafDarkMat: new THREE.MeshStandardMaterial({ color: "#226b36", roughness: 0.6 }),
      leafLightMat: new THREE.MeshStandardMaterial({ color: "#308746", roughness: 0.6 }),
    }),
    [potColor],
  );

  useEffect(() => {
    return () => {
      shared.potGeo.dispose();
      shared.soilGeo.dispose();
      shared.leafGeo.dispose();
      shared.potMat.dispose();
      shared.soilMat.dispose();
      shared.leafDarkMat.dispose();
      shared.leafLightMat.dispose();
    };
  }, [shared]);

  return (
    <group position={position} scale={scale}>
      <mesh
        position={[0, 0.11, 0]}
        geometry={shared.potGeo}
        material={shared.potMat}
        castShadow
        receiveShadow
      />
      <mesh
        position={[0, 0.215, 0]}
        geometry={shared.soilGeo}
        material={shared.soilMat}
      />
      {PLANT_LEAF_ANGLES.map((angle, idx) => {
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
            geometry={shared.leafGeo}
            material={idx % 2 === 0 ? shared.leafDarkMat : shared.leafLightMat}
            castShadow
          />
        );
      })}
    </group>
  );
};

/**
 * Sculpted 3D Japanese Bonsai Tree (supports rectangular dark tray or round white ceramic pot).
 */
const BonsaiTree3D: React.FC<{
  readonly position: [number, number, number];
  readonly scale?: number;
  readonly potStyle?: "tray" | "whiteRound";
}> = ({ position, scale = 1, potStyle = "tray" }) => {
  return (
    <group position={position} scale={scale}>
      {potStyle === "whiteRound" ? (
        <group>
          <mesh position={[0, 0.065, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.125, 0.095, 0.13, 18]} />
            <meshStandardMaterial color="#eeece6" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.125, 0]}>
            <cylinderGeometry args={[0.115, 0.115, 0.015, 16]} />
            <meshStandardMaterial color="#362419" roughness={0.95} />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh position={[0, 0.028, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.32, 0.055, 0.2]} />
            <meshStandardMaterial color="#232830" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.058, 0]}>
            <boxGeometry args={[0.28, 0.012, 0.16]} />
            <meshStandardMaterial color="#342318" roughness={0.95} />
          </mesh>
        </group>
      )}

      {/* Curved organic bonsai trunk */}
      <group position={[0, potStyle === "whiteRound" ? 0.075 : 0, 0]}>
        <mesh position={[-0.025, 0.11, 0]} rotation={[0, 0, -0.24]} castShadow>
          <cylinderGeometry args={[0.018, 0.028, 0.12, 8]} />
          <meshStandardMaterial color="#583a26" roughness={0.84} />
        </mesh>
        <mesh position={[0.012, 0.19, 0.01]} rotation={[0.08, 0, 0.35]} castShadow>
          <cylinderGeometry args={[0.012, 0.018, 0.11, 8]} />
          <meshStandardMaterial color="#583a26" roughness={0.84} />
        </mesh>
        <mesh position={[-0.055, 0.17, -0.01]} rotation={[0, 0, 0.55]} castShadow>
          <cylinderGeometry args={[0.009, 0.014, 0.085, 7]} />
          <meshStandardMaterial color="#583a26" roughness={0.84} />
        </mesh>
        {[
          [-0.085, 0.21, 0.01, 0.076],
          [0.055, 0.25, 0.02, 0.09],
          [-0.01, 0.28, -0.01, 0.074],
          [0.11, 0.2, -0.01, 0.064],
        ].map(([fx, fy, fz, r], idx) => (
          <mesh
            key={idx}
            position={[fx, fy, fz]}
            scale={[1.38, 0.56, 1.05]}
            castShadow
          >
            <sphereGeometry args={[r, 10, 8]} />
            <meshStandardMaterial
              color={idx % 2 === 0 ? "#246636" : "#328246"}
              roughness={0.7}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/**
 * Lush cascading green trailing ivy plant draping down from the top-left shelf corner.
 */
const HangingIvy3D: React.FC<{
  readonly position: [number, number, number];
}> = ({ position }) => {
  const vineDrops: readonly [number, number, number, number, string][] = [
    [-0.08, 0.04, 0.02, 0.055, "#237838"],
    [0.0, 0.06, 0.03, 0.06, "#2d9245"],
    [0.07, 0.03, 0.04, 0.052, "#3da854"],
    [-0.12, -0.02, 0.04, 0.048, "#2b8b42"],
    [-0.05, -0.04, 0.05, 0.05, "#42b55b"],
    [0.04, -0.05, 0.05, 0.052, "#247c3a"],
    [0.11, -0.06, 0.05, 0.046, "#369e4d"],
    [-0.09, -0.11, 0.05, 0.044, "#2f9447"],
    [-0.02, -0.13, 0.06, 0.046, "#206f34"],
    [0.06, -0.14, 0.06, 0.048, "#45b85e"],
    [0.12, -0.16, 0.06, 0.042, "#28853e"],
    [-0.06, -0.2, 0.06, 0.04, "#39a350"],
    [0.02, -0.22, 0.06, 0.044, "#257e3b"],
    [0.09, -0.24, 0.06, 0.042, "#40b057"],
    [-0.03, -0.29, 0.05, 0.036, "#2a8a41"],
    [0.05, -0.31, 0.06, 0.038, "#3aa652"],
    [0.11, -0.33, 0.05, 0.035, "#217236"],
    [0.01, -0.38, 0.05, 0.034, "#47ba5f"],
    [0.08, -0.41, 0.05, 0.032, "#2c8e43"],
    [0.05, -0.47, 0.04, 0.028, "#3ba752"],
  ];
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.072, 0.056, 0.09, 12]} />
        <meshStandardMaterial color="#272b33" roughness={0.6} />
      </mesh>
      {vineDrops.map(([vx, vy, vz, r, col], idx) => (
        <mesh key={idx} position={[vx, vy, vz]} scale={[1.25, 0.85, 0.9]}>
          <sphereGeometry args={[r, 8, 6]} />
          <meshStandardMaterial color={col} roughness={0.58} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Cute stylized 3D ceramic Maneki-neko (Japanese lucky cat) sitting beside
 * the study books on the middle bookshelf, matching the studio references.
 */
const ManekiNeko3D: React.FC<{
  readonly position: [number, number, number];
}> = ({ position }) => {
  return (
    <group position={position} rotation={[0, 0.24, 0]}>
      {/* Warm ceramic torso */}
      <mesh position={[0, 0.075, 0]} scale={[1.0, 1.15, 0.92]} castShadow>
        <sphereGeometry args={[0.072, 16, 12]} />
        <meshStandardMaterial color="#fbf8f3" roughness={0.24} />
      </mesh>
      {/* Round cat head */}
      <mesh position={[0, 0.175, 0.004]} scale={[1.08, 0.96, 0.95]} castShadow>
        <sphereGeometry args={[0.068, 16, 12]} />
        <meshStandardMaterial color="#fbf8f3" roughness={0.24} />
      </mesh>
      {/* Pointed ears + soft pink inner ears */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.046, 0.232, 0.004]}
          rotation={[0, 0, side * -0.28]}
        >
          <mesh castShadow>
            <coneGeometry args={[0.024, 0.046, 10]} />
            <meshStandardMaterial color="#fbf8f3" roughness={0.26} />
          </mesh>
          <mesh position={[0, -0.003, 0.012]}>
            <coneGeometry args={[0.014, 0.03, 8]} />
            <meshStandardMaterial color="#f5989d" roughness={0.42} />
          </mesh>
        </group>
      ))}
      {/* Crimson neck collar & shiny gold bell */}
      <mesh position={[0, 0.125, 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.056, 0.011, 8, 18]} />
        <meshStandardMaterial color="#d92b2b" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.114, 0.062]}>
        <sphereGeometry args={[0.015, 10, 8]} />
        <meshStandardMaterial
          color="#f7c143"
          metalness={0.72}
          roughness={0.22}
        />
      </mesh>
      {/* Raised beckoning left paw */}
      <mesh position={[-0.064, 0.155, 0.025]} rotation={[0.2, 0, 0.35]} castShadow>
        <capsuleGeometry args={[0.019, 0.052, 6, 10]} />
        <meshStandardMaterial color="#fbf8f3" roughness={0.24} />
      </mesh>
      {/* Right paw holding miniature gold koban oval */}
      <mesh position={[0.045, 0.075, 0.052]} rotation={[0.15, -0.2, -0.25]}>
        <capsuleGeometry args={[0.017, 0.036, 6, 10]} />
        <meshStandardMaterial color="#fbf8f3" roughness={0.24} />
      </mesh>
      <mesh position={[0.016, 0.068, 0.068]} scale={[0.9, 1.25, 0.35]}>
        <cylinderGeometry args={[0.024, 0.024, 0.012, 14]} />
        <meshStandardMaterial
          color="#f5b82e"
          metalness={0.68}
          roughness={0.25}
        />
      </mesh>
      {/* Cute happy eyes, nose, and blush */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.025, 0.184, 0.062]}>
            <sphereGeometry args={[0.0085, 8, 8]} />
            <meshStandardMaterial color="#1a1618" roughness={0.25} />
          </mesh>
          <mesh position={[side * 0.042, 0.168, 0.058]}>
            <sphereGeometry args={[0.009, 8, 8]} />
            <meshStandardMaterial color="#f59b9e" roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.172, 0.066]}>
        <sphereGeometry args={[0.0065, 8, 8]} />
        <meshStandardMaterial color="#e86f78" roughness={0.4} />
      </mesh>
    </group>
  );
};

/**
 * Warm glowing Japanese Mt. Fuji shoji desk lantern on the bottom-right of the desk.
 */
const FujiShojiLamp3D: React.FC<{
  readonly position: [number, number, number];
  readonly texture: THREE.CanvasTexture;
}> = ({ position, texture }) => {
  return (
    <group position={position} rotation={[0, -0.28, 0]}>
      {/* Dark wood base */}
      <mesh position={[0, 0.015, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 0.03, 0.25]} />
        <meshStandardMaterial color="#21150e" roughness={0.68} />
      </mesh>
      {/* Glowing Shoji core */}
      <mesh position={[0, 0.165, 0]}>
        <boxGeometry args={[0.21, 0.27, 0.21]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffca6b"
          emissiveIntensity={1.2}
          roughness={0.45}
        />
      </mesh>
      {/* Four dark wood corner frame pillars */}
      {[
        [-0.105, -0.105],
        [0.105, -0.105],
        [-0.105, 0.105],
        [0.105, 0.105],
      ].map(([cx, cz], idx) => (
        <mesh key={idx} position={[cx, 0.165, cz]} castShadow>
          <boxGeometry args={[0.02, 0.29, 0.02]} />
          <meshStandardMaterial color="#1c110b" roughness={0.7} />
        </mesh>
      ))}
      {/* Top wooden rim */}
      <mesh position={[0, 0.305, 0]} castShadow>
        <boxGeometry args={[0.24, 0.024, 0.24]} />
        <meshStandardMaterial color="#21150e" roughness={0.68} />
      </mesh>
      {/* Soft warm local glow */}
      <pointLight
        position={[0, 0.18, 0.16]}
        color="#ffbd59"
        intensity={0.55}
        distance={1.6}
        decay={2}
      />
    </group>
  );
};

/**
 * Stylized 3D Tokyo Tower + Royal-Blue Night Tokyo Skyline outside the right window.
 */
const TokyoSkylineBackdrop: React.FC<{ readonly timeSec: number }> = ({
  timeSec,
}) => {
  const skyAssets = useMemo(
    () => ({
      skyTexture: createTokyoSkyTexture(),
      bokehGeo: new THREE.SphereGeometry(1, 8, 8),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      skyAssets.skyTexture.dispose();
      skyAssets.bokehGeo.dispose();
    };
  }, [skyAssets]);

  const beaconIntensity = 1.4 + 1.1 * Math.sin(timeSec * 3.8);

  return (
    <group>
      <mesh position={[3.2, 2.2, -11.2]}>
        <planeGeometry args={[12.0, 8.0]} />
        <meshBasicMaterial map={skyAssets.skyTexture} />
      </mesh>

      {/* Distant cool-blue horizon glow */}
      <mesh position={[3.1, 0.5, -10.5]}>
        <planeGeometry args={[10.0, 1.6]} />
        <meshBasicMaterial
          color="#3b6be0"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      {/* Layered Royal-Blue Tokyo Skyline Buildings */}
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

      {/* Prominent Illuminated Tokyo Tower on Far Right */}
      <group position={[5.55, 0.38, -5.05]} scale={0.92}>
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
              color="#ff6238"
              emissive="#ff4c1f"
              emissiveIntensity={1.08}
              roughness={0.45}
            />
          </mesh>
        ))}

        <mesh position={[0, 0.88, 0]}>
          <cylinderGeometry args={[0.14, 0.29, 0.75, 4]} />
          <meshStandardMaterial
            color="#ff5a30"
            emissive="#ff4a1e"
            emissiveIntensity={0.95}
            wireframe
          />
        </mesh>

        <mesh position={[0, 1.28, 0]}>
          <boxGeometry args={[0.38, 0.14, 0.38]} />
          <meshStandardMaterial
            color="#ffefd6"
            emissive="#ffb854"
            emissiveIntensity={1.45}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 1.38, 0]}>
          <boxGeometry args={[0.3, 0.06, 0.3]} />
          <meshStandardMaterial
            color="#ff5a36"
            emissive="#ff4721"
            emissiveIntensity={0.95}
          />
        </mesh>

        <mesh position={[0, 1.66, 0]}>
          <cylinderGeometry args={[0.088, 0.135, 0.52, 4]} />
          <meshStandardMaterial
            color="#fff3e6"
            emissive="#ffd29d"
            emissiveIntensity={0.8}
          />
        </mesh>

        <mesh position={[0, 2.08, 0]}>
          <cylinderGeometry args={[0.058, 0.088, 0.38, 4]} />
          <meshStandardMaterial
            color="#ff5a30"
            emissive="#ff4a1e"
            emissiveIntensity={1.15}
          />
        </mesh>

        <mesh position={[0, 2.28, 0]}>
          <boxGeometry args={[0.19, 0.1, 0.19]} />
          <meshStandardMaterial
            color="#fff6e0"
            emissive="#ffc25c"
            emissiveIntensity={1.65}
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
          <sphereGeometry args={[0.032, 10, 10]} />
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
            scale={orb.radius}
            geometry={skyAssets.bokehGeo}
          >
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

type Vec3 = readonly [number, number, number];

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Host-local (root frame, yaw only) -> world position. */
const hostLocalToWorld = (root: Vec3, yaw: number, local: Vec3): THREE.Vector3 =>
  new THREE.Vector3(local[0], local[1], local[2])
    .applyAxisAngle(Y_AXIS, yaw)
    .add(new THREE.Vector3(root[0], root[1], root[2]));

/** Solid boom-arm tube spanning exactly from `a` to `b` (so every joint connects). */
const BoomRod: React.FC<{
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  readonly radius: number;
}> = ({ a, b, radius }) => {
  const dir = b.clone().sub(a);
  const length = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize());
  return (
    <mesh position={mid} quaternion={quat} castShadow>
      <cylinderGeometry args={[radius, radius * 1.08, length, 10]} />
      <meshStandardMaterial color="#1b1f27" metalness={0.6} roughness={0.38} />
    </mesh>
  );
};

const BoomJoint: React.FC<{ readonly at: THREE.Vector3; readonly r: number }> = ({
  at,
  r,
}) => (
  <mesh position={at} castShadow>
    <sphereGeometry args={[r, 12, 10]} />
    <meshStandardMaterial color="#303642" metalness={0.75} roughness={0.3} />
  </mesh>
);

export type BoomMicRig = {
  readonly clamp: THREE.Vector3;
  readonly riserTop: THREE.Vector3;
  readonly elbow: THREE.Vector3;
  readonly mount: THREE.Vector3;
  readonly capsule: THREE.Vector3;
  readonly aim: THREE.Quaternion;
};

/**
 * Broadcast boom placement for a host: the SM7B capsule sits at chin height,
 * out to the host's outer side (away from the co-host and the lens line), and
 * aims up at the mouth. It clears the face, the mouth and the chest wordmark in
 * both studio-wide and circular-PIP framing. The two-section arm is built
 * joint-to-joint from a desk clamp, so it always reads as one connected stand.
 */
export const computeBoomMicRig = (
  root: Vec3,
  yaw: number,
  outerSide: number,
  mouthLocal: Vec3,
  clampLocal: Vec3,
): BoomMicRig => {
  const capsuleLocal: Vec3 = [outerSide * 0.3, 0.44, 0.4];
  const capsule = hostLocalToWorld(root, yaw, capsuleLocal);
  const mouth = hostLocalToWorld(root, yaw, mouthLocal);
  const dir = mouth.clone().sub(capsule).normalize();
  const aim = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, dir);
  // Yoke pivot directly under the capsule body, in the capsule's own frame
  const mount = capsule
    .clone()
    .add(new THREE.Vector3(0, -0.072, -0.02).applyQuaternion(aim));
  const elbow = hostLocalToWorld(root, yaw, [
    capsuleLocal[0] + outerSide * 0.44,
    capsuleLocal[1] + 0.05,
    capsuleLocal[2] + 0.06,
  ]);
  const clamp = hostLocalToWorld(root, yaw, clampLocal);
  clamp.y = 0.78;
  const riserTop = clamp.clone().add(new THREE.Vector3(0, 0.16, 0));
  return {
    clamp,
    riserTop,
    elbow,
    mount,
    capsule,
    aim,
  };
};

/**
 * Matte-black SM7B broadcast mic on a connected two-section boom arm, with a
 * voice-reactive LED ring.
 */
const BoomMicrophone3D: React.FC<{
  readonly rig: BoomMicRig;
  readonly ledColor: string;
  readonly audioVolume: number;
}> = ({ rig, ledColor, audioVolume }) => {
  const ledIntensity = 0.8 + audioVolume * 1.8;
  return (
    <group>
      {/* Desk clamp + riser post */}
      <mesh position={[rig.clamp.x, rig.clamp.y + 0.03, rig.clamp.z]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.06, 0.12]} />
        <meshStandardMaterial color="#14171d" metalness={0.6} roughness={0.38} />
      </mesh>
      <BoomRod a={rig.clamp} b={rig.riserTop} radius={0.018} />
      <BoomJoint at={rig.riserTop} r={0.026} />
      {/* Lower & upper arm sections meeting at the spring elbow */}
      <BoomRod a={rig.riserTop} b={rig.elbow} radius={0.015} />
      <BoomJoint at={rig.elbow} r={0.024} />
      <BoomRod a={rig.elbow} b={rig.mount} radius={0.013} />
      <BoomJoint at={rig.mount} r={0.018} />

      {/* SM7B capsule aimed at the host's mouth */}
      <group position={rig.capsule} quaternion={rig.aim}>
        {/* U-yoke cradling the body down to the boom pivot */}
        <mesh position={[0, 0, -0.02]} rotation={[0, 0, Math.PI]} castShadow>
          <torusGeometry args={[0.058, 0.007, 10, 18, Math.PI]} />
          <meshStandardMaterial color="#252b36" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.044, 0.042, 0.16, 20]} />
          <meshStandardMaterial color="#181b22" metalness={0.65} roughness={0.36} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <torusGeometry args={[0.047, 0.0052, 8, 22]} />
          <meshStandardMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={ledIntensity}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.046, 0.062, 10, 18]} />
          <meshStandardMaterial color="#12151a" roughness={0.92} />
        </mesh>
      </group>
    </group>
  );
};

/**
 * Main True 3D JungGo Podcast Studio Scene matching `public/images/studio-reference.jpg` A-to-Z.
 * Uses 512x512 shadows and memoized shared geometries/materials for fast T4 GPU rendering.
 * Strictly driven by useCurrentFrame() — ZERO useFrame().
 */
export const Studio3D: React.FC<Studio3DProps> = ({
  sections,
  subtitles,
  studioMode = "solo",
  boardFocusProgress = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;
  const audio = usePodcastAudioMetrics();
  const isDual = studioMode === "dual";

  const activeSection = getActiveSection(sections, timeSec);
  const activeCue = subtitles ? getActiveSubtitle(subtitles, timeSec) : null;
  const isMariaActive = activeCue !== null && isGuestSpeaker(activeCue.speaker);
  const senseiMicVol = isDual && isMariaActive ? 0.06 : audio.volume;
  const mariaMicVol = isMariaActive ? audio.volume : 0.06;
  const quizFactor = computeQuizFactor(sections, timeSec);
  const isQuiz = activeSection.type === "quiz";

  const senseiLayout = isDual ? SENSEI_LAYOUT.dual : SENSEI_LAYOUT.solo;
  const micRigs = useMemo(
    () => ({
      sensei: computeBoomMicRig(
        senseiLayout.position,
        senseiLayout.yaw,
        -1,
        SENSEI_MOUTH_LOCAL,
        [-0.88, 0, 0.52],
      ),
      maria: computeBoomMicRig(
        MARIA_LAYOUT.position,
        MARIA_LAYOUT.yaw,
        1,
        [0, 0.66, 0.29],
        [0.95, 0, 0.42],
      ),
    }),
    [senseiLayout],
  );
  // Warm/cool rim spotlights aimed just above each host's head (no shadows)
  const rimTargets = useMemo(() => {
    const sensei = new THREE.Object3D();
    sensei.position.set(
      senseiLayout.position[0],
      senseiLayout.position[1] + 0.9,
      senseiLayout.position[2],
    );
    const maria = new THREE.Object3D();
    maria.position.set(
      MARIA_LAYOUT.position[0],
      MARIA_LAYOUT.position[1] + 0.88,
      MARIA_LAYOUT.position[2],
    );
    return { sensei, maria };
  }, [senseiLayout]);

  const textures = useMemo(
    () => ({
      wood: createWoodTexture(),
      wall: createStudioWallTexture(),
      neon: createNeonSignTexture(),
      mug: createMugTexture(),
      book: createBookCoverTexture(),
      studyBooks: createStudyBookStackTexture(),
      youtubePlaque: createYouTubePlaqueTexture(),
      laptop: createLaptopScreenTexture(),
      laptopLidLogo: createLaptopLidLogoTexture(),
      fujiLamp: createFujiLampTexture(),
    }),
    [],
  );

  const sharedScene = useMemo(
    () => ({
      slatGeo: new THREE.BoxGeometry(0.088, 3.6, 0.06),
      deskLegGeo: new THREE.BoxGeometry(0.08, 0.7, 0.08),
      // Slightly deeper walnut so the ceiling wall-wash reads as pools of light and
      // the faces, not the backdrop, carry the most saturated orange in frame.
      slatMat: new THREE.MeshStandardMaterial({
        color: "#904d21",
        roughness: 0.5,
        metalness: 0.06,
      }),
      wallMat: new THREE.MeshStandardMaterial({
        map: textures.wall,
        color: "#522f18",
        roughness: 0.76,
      }),
      woodMat: new THREE.MeshStandardMaterial({
        map: textures.wood,
        roughness: 0.4,
        metalness: 0.06,
      }),
      shelfBackMat: new THREE.MeshStandardMaterial({
        color: "#6b3c1b",
        roughness: 0.65,
      }),
      windowFrameMat: new THREE.MeshStandardMaterial({
        color: "#151a24",
        metalness: 0.55,
        roughness: 0.42,
      }),
      windowMullionMat: new THREE.MeshStandardMaterial({
        color: "#181e2b",
        metalness: 0.5,
        roughness: 0.45,
      }),
      deskLegMat: new THREE.MeshStandardMaterial({
        color: "#181b22",
        metalness: 0.6,
        roughness: 0.4,
      }),
    }),
    [textures],
  );

  useEffect(() => {
    return () => {
      Object.values(sharedScene).forEach((resource) => resource.dispose());
      Object.values(textures).forEach((tex) => tex.dispose());
    };
  }, [sharedScene, textures]);

  const keyIntensity = interpolate(quizFactor, [0, 1], [2.25, 1.35]);
  const rimIntensity = interpolate(quizFactor, [0, 1], [1.15, 1.9]);
  const ambientIntensity = interpolate(quizFactor, [0, 1], [0.58, 0.36]);
  const neonGlowIntensity =
    0.84 + audio.volume * 0.18 + Math.sin(timeSec * 4.5) * 0.025;

  return (
    <group>
      {/* ================= CINEMA-GRADE WARM 3-POINT + RECESSED STUDIO LIGHTING ================= */}
      <ambientLight intensity={ambientIntensity} color="#ffddb8" />
      <hemisphereLight
        args={[
          "#7da2ff",
          "#663918",
          interpolate(quizFactor, [0, 1], [0.62, 0.38]),
        ]}
      />

      {/* 1. Warm Amber Key Light (single 512x512 shadow map for fast T4 GPU rendering) */}
      <directionalLight
        position={[-2.1, 3.6, 2.9]}
        intensity={keyIntensity}
        color="#ffd8a8"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-1.5}
        shadow-bias={-0.0005}
      />

      {/* 2. Cool Royal-Blue Night Light from the Tokyo Window: placed behind the hosts so
            it grazes edges instead of tinting the faces lilac */}
      <directionalLight
        position={[4.2, 2.9, -3.4]}
        intensity={rimIntensity}
        color={quizFactor > 0.35 ? "#9c6bff" : "#3d7eff"}
      />

      {/* 2b. Broadcast rim (back) lights: warm on Sensei, cool on Maria. They trace the
            dark hoods & headphones against the slats. No shadow maps, and they replace the
            old window point light + a merged shelf light, so the light count is unchanged. */}
      <primitive object={rimTargets.sensei} />
      <spotLight
        position={[
          senseiLayout.position[0] - 0.5,
          2.85,
          senseiLayout.position[2] - 1.1,
        ]}
        target={rimTargets.sensei}
        intensity={interpolate(quizFactor, [0, 1], [16, 12])}
        color={quizFactor > 0.35 ? "#c9a2ff" : "#ffc58c"}
        angle={0.36}
        penumbra={0.85}
        distance={3.0}
        decay={2}
      />
      {isDual ? (
        <>
          <primitive object={rimTargets.maria} />
          <spotLight
            position={[MARIA_LAYOUT.position[0] + 0.5, 2.85, MARIA_LAYOUT.position[2] - 1.1]}
            target={rimTargets.maria}
            intensity={interpolate(quizFactor, [0, 1], [16, 12])}
            color={quizFactor > 0.35 ? "#b69cff" : "#a9c8ff"}
            angle={0.36}
            penumbra={0.85}
            distance={3.0}
            decay={2}
          />
        </>
      ) : null}

      {/* 3. Warm Front-Desk Bounce Fill for Pixar Face & Oak Tabletop Sheen */}
      <pointLight
        position={[-0.2, 1.48, 1.85]}
        intensity={interpolate(quizFactor, [0, 1], [1.35, 0.78])}
        color="#ffd4a3"
        distance={6.0}
        decay={2}
      />

      {/* 4. Warm Recessed Bookshelf Bay Glow (one merged light tucked behind the shelf lip) */}
      <pointLight
        position={[-2.35, 2.05, -1.74]}
        intensity={interpolate(quizFactor, [0, 1], [1.95, 1.15])}
        color="#ffae45"
        distance={3.0}
        decay={2}
      />

      {/* 5. Three Warm Ceiling Wall-Wash Spotlights over Walnut Slats */}
      {[-1.35, -0.45, 0.45].map((sx, idx) => (
        <group key={idx} position={[sx, 3.16, -1.84]}>
          <mesh>
            <cylinderGeometry args={[0.075, 0.085, 0.06, 14]} />
            <meshStandardMaterial color="#181b22" roughness={0.45} />
          </mesh>
          <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.058, 14]} />
            <meshBasicMaterial color="#ffe2a8" />
          </mesh>
          <pointLight
            position={[0, -0.24, 0.2]}
            intensity={interpolate(quizFactor, [0, 1], [2.3, 1.15])}
            color="#ffad42"
            distance={5.2}
            decay={1.8}
          />
        </group>
      ))}

      {/* ================= STUDIO ROOM ARCHITECTURE ================= */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 12]} />
        <meshStandardMaterial color="#18120e" roughness={0.85} />
      </mesh>

      {/* Warm Golden-Walnut Back Wall & Window Framing */}
      <mesh position={[-0.75, 1.95, -2.15]} material={sharedScene.wallMat} receiveShadow>
        <boxGeometry args={[7.1, 4.1, 0.16]} />
      </mesh>
      <mesh position={[3.85, 3.62, -2.15]} material={sharedScene.wallMat} receiveShadow>
        <boxGeometry args={[4.2, 0.76, 0.16]} />
      </mesh>
      <mesh position={[3.85, 0.32, -2.15]} material={sharedScene.wallMat} receiveShadow>
        <boxGeometry args={[4.2, 0.68, 0.16]} />
      </mesh>
      <mesh position={[6.15, 1.95, -2.15]} material={sharedScene.wallMat} receiveShadow>
        <boxGeometry args={[0.6, 4.1, 0.16]} />
      </mesh>

      {/* Warm Golden-Walnut Vertical Slats behind Host & Neon Sign */}
      {Array.from({ length: 22 }, (_, idx) => (
        <mesh
          key={idx}
          position={[-1.78 + idx * 0.165, 1.95, -2.04]}
          geometry={sharedScene.slatGeo}
          material={sharedScene.slatMat}
          castShadow
          receiveShadow
        />
      ))}

      {/* ================= LEFT WARM-LED BOOKSHELF (BONSAI, YOUTUBE PLAQUE, BOOKS, MANEKI-NEKO) ================= */}
      <group position={[-2.38, 1.52, -1.84]}>
        <mesh position={[0, 0, -0.14]} material={sharedScene.shelfBackMat} receiveShadow>
          <boxGeometry args={[1.22, 2.32, 0.05]} />
        </mesh>
        {[-0.86, -0.18, 0.48, 1.1].map((sy, idx) => (
          <group key={idx} position={[0, sy, 0]}>
            <mesh material={sharedScene.woodMat} castShadow receiveShadow>
              <boxGeometry args={[1.2, 0.05, 0.36]} />
            </mesh>
            {idx > 0 && (
              <mesh position={[0, -0.028, 0.08]}>
                <boxGeometry args={[1.08, 0.016, 0.02]} />
                <meshStandardMaterial
                  color="#ffe4ad"
                  emissive="#ffae3d"
                  emissiveIntensity={2.6 - quizFactor * 0.8}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        ))}
        {[-0.58, 0.58].map((sx, idx) => (
          <mesh
            key={idx}
            position={[sx, 0.12, 0]}
            material={sharedScene.woodMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.05, 2.08, 0.36]} />
          </mesh>
        ))}

        {/* Top Shelf Left: Sculpted 3D Bonsai Tree */}
        <BonsaiTree3D position={[-0.24, 0.505, 0.02]} scale={1.15} potStyle="tray" />

        {/* Top Shelf Right: Silver YouTube Play Button Award Plaque */}
        <group position={[0.28, 0.72, -0.02]} rotation={[-0.08, -0.18, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.38, 0.026]} />
            <meshStandardMaterial
              color="#c8cfd8"
              metalness={0.65}
              roughness={0.28}
            />
          </mesh>
          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.28, 0.36]} />
            <meshStandardMaterial
              map={textures.youtubePlaque}
              metalness={0.45}
              roughness={0.32}
            />
          </mesh>
        </group>

        {/* Top-Right Cascading Hanging Ivy */}
        <HangingIvy3D position={[0.56, 1.02, 0.14]} />

        {/* Middle Shelf: ~22% Larger Zero-Glare Matte Study Books + Maneki-neko Lucky Cat */}
        <group position={[-0.08, 0.095, 0.03]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.73, 0.51, 0.26]} />
            <meshStandardMaterial
              color="#ebe4d5"
              roughness={0.92}
              metalness={0.0}
            />
          </mesh>
          <mesh position={[0, 0, 0.132]}>
            <planeGeometry args={[0.73, 0.51]} />
            <meshStandardMaterial
              map={textures.studyBooks}
              roughness={0.95}
              metalness={0.0}
              envMapIntensity={0.15}
            />
          </mesh>
        </group>
        {/* Sleek vertical accent book on far-left edge */}
        <mesh position={[-0.5, 0.095, 0.02]} castShadow>
          <boxGeometry args={[0.072, 0.51, 0.23]} />
          <meshStandardMaterial
            color="#d97706"
            roughness={0.88}
            metalness={0.0}
          />
        </mesh>
        {/* Cute Ceramic Maneki-neko Lucky Cat on right side of middle shelf */}
        <ManekiNeko3D position={[0.43, -0.155, 0.05]} />

        {/* Bottom Shelf: Matte-black Studio Camera Prop */}
        <group position={[-0.22, -0.72, 0.04]} rotation={[0, 0.35, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.18, 0.12, 0.11]} />
            <meshStandardMaterial color="#161920" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.048, 0.08, 16]} />
            <meshStandardMaterial color="#12151a" metalness={0.65} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* ================= CENTERED "JungGo PODCAST STUDIO" NEON SIGN ================= */}
      <mesh position={[isDual ? -0.56 : -0.42, isDual ? 2.66 : 2.64, -1.96]}>
        <planeGeometry args={[1.88, 0.94]} />
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

      {/* Back-Center Indoor Plant tucked beside the window */}
      <PottedPlant
        position={[isDual ? 0.78 : 0.52, 0.85, -1.62]}
        scale={1.15}
        potColor="#24272e"
      />

      {/* ================= RIGHT STUDIO WINDOW & TOKYO NIGHT SKYLINE ================= */}
      <group position={[3.35, 1.92, -2.14]}>
        <mesh position={[0, 1.34, 0]} material={sharedScene.windowFrameMat}>
          <boxGeometry args={[4.55, 0.085, 0.22]} />
        </mesh>
        <mesh position={[0, -1.34, 0]} material={sharedScene.woodMat}>
          <boxGeometry args={[4.55, 0.095, 0.28]} />
        </mesh>
        <mesh position={[-2.22, 0, 0]} material={sharedScene.windowFrameMat}>
          <boxGeometry args={[0.09, 2.75, 0.22]} />
        </mesh>
        <mesh position={[2.22, 0, 0]} material={sharedScene.windowFrameMat}>
          <boxGeometry args={[0.09, 2.75, 0.22]} />
        </mesh>
        <mesh position={[-0.75, 0, 0]} material={sharedScene.windowMullionMat}>
          <boxGeometry args={[0.045, 2.66, 0.12]} />
        </mesh>
        <mesh position={[0.68, 0, 0]} material={sharedScene.windowMullionMat}>
          <boxGeometry args={[0.045, 2.66, 0.12]} />
        </mesh>
        <mesh position={[0, 0.45, 0]} material={sharedScene.windowMullionMat}>
          <boxGeometry args={[4.42, 0.04, 0.12]} />
        </mesh>
        {/* Lightweight glass pane */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[4.4, 2.62]} />
          <meshStandardMaterial
            color="#98bfff"
            transparent
            opacity={0.045}
            roughness={0.12}
            metalness={0.15}
            depthWrite={false}
          />
        </mesh>
      </group>

      <TokyoSkylineBackdrop timeSec={timeSec} />

      {/* ================= FOREGROUND GOLDEN-OAK DESK & PROPS ================= */}
      <group>
        {/* Main Golden-Oak Desk Tabletop (warm satin finish catching studio reflections) */}
        <mesh position={[0, 0.735, 0.16]} castShadow receiveShadow>
          <boxGeometry args={[isDual ? 5.65 : 5.15, 0.09, 1.5]} />
          <meshStandardMaterial
            map={textures.wood}
            roughness={0.34}
            metalness={0.08}
          />
        </mesh>
        {[
          [isDual ? -2.42 : -2.18, 0.35, -0.35],
          [isDual ? 2.42 : 2.18, 0.35, -0.35],
          [isDual ? -2.42 : -2.18, 0.35, 0.65],
          [isDual ? 2.42 : 2.18, 0.35, 0.65],
        ].map(([lx, ly, lz], idx) => (
          <mesh
            key={idx}
            position={[lx, ly, lz]}
            geometry={sharedScene.deskLegGeo}
            material={sharedScene.deskLegMat}
            castShadow
          />
        ))}

        {/* Dark Charcoal Leather Desk Mat under Hosts & Laptop */}
        <mesh position={[isDual ? -0.36 : -0.18, 0.784, 0.14]} receiveShadow>
          <boxGeometry args={[isDual ? 2.76 : 2.28, 0.008, 0.82]} />
          <meshStandardMaterial color="#1c1f26" roughness={0.78} />
        </mesh>

        {/* Far-Left White Ceramic Potted Leafy Plant */}
        <PottedPlant
          position={[isDual ? -2.02 : -1.88, 0.78, 0.46]}
          scale={1.18}
          potColor="#eceae4"
        />

        {/* White Ceramic "JungGo" Mug on Coaster (emblem centered facing camera) */}
        <group
          position={[isDual ? -1.58 : -1.44, 0.78, 0.42]}
          rotation={[0, Math.PI + 0.46, 0]}
        >
          <mesh position={[0, 0.004, 0]} receiveShadow>
            <cylinderGeometry args={[0.095, 0.095, 0.008, 20]} />
            <meshStandardMaterial color="#181b22" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.095, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.076, 0.07, 0.185, 24]} />
            <meshStandardMaterial map={textures.mug} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.175, 0]}>
            <cylinderGeometry args={[0.068, 0.068, 0.015, 20]} />
            <meshStandardMaterial color="#361c0f" roughness={0.2} />
          </mesh>
          <mesh position={[-0.08, 0.095, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.046, 0.012, 10, 16, Math.PI]} />
            <meshStandardMaterial color="#f2efe9" roughness={0.24} />
          </mesh>
        </group>

        {/* Maria's Matching Ceramic "JungGo" Mug in Dual Mode */}
        {isDual ? (
          <group position={[0.02, 0.78, 0.46]} rotation={[0, Math.PI + 0.02, 0]}>
            <mesh position={[0, 0.004, 0]} receiveShadow>
              <cylinderGeometry args={[0.092, 0.092, 0.008, 20]} />
              <meshStandardMaterial color="#181b22" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.092, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.074, 0.068, 0.18, 24]} />
              <meshStandardMaterial map={textures.mug} roughness={0.22} />
            </mesh>
            <mesh position={[0, 0.17, 0]}>
              <cylinderGeometry args={[0.066, 0.066, 0.015, 20]} />
              <meshStandardMaterial color="#361c0f" roughness={0.2} />
            </mesh>
            <mesh position={[0.078, 0.092, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <torusGeometry args={[0.045, 0.012, 10, 16, Math.PI]} />
              <meshStandardMaterial color="#f2efe9" roughness={0.24} />
            </mesh>
          </group>
        ) : null}

        {/* Sensei's SM7B on a connected boom: chin height, outer side, aimed at his mouth */}
        <BoomMicrophone3D
          rig={micRigs.sensei}
          ledColor={isQuiz ? "#a78bfa" : "#34f5b5"}
          audioVolume={senseiMicVol}
        />

        {/* Maria's SM7B mirrored on her outer (window) side */}
        {isDual ? (
          <BoomMicrophone3D
            rig={micRigs.maria}
            ledColor={isQuiz ? "#a78bfa" : "#f43f5e"}
            audioVolume={mariaMicVol}
          />
        ) : null}

        {/* Open Space-Gray Laptop angled cleanly, JungGo Mt. Fuji Lid facing Camera */}
        <group
          position={isDual ? [0.46, 0.786, 0.28] : [0.08, 0.786, 0.16]}
          rotation={[0, isDual ? Math.PI - 0.44 : Math.PI - 0.34, 0]}
          scale={isDual ? 0.76 : 1}
        >
          <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.022, 0.46]} />
            <meshStandardMaterial
              color="#636a76"
              metalness={0.78}
              roughness={0.28}
            />
          </mesh>
          <mesh position={[0, 0.025, -0.04]}>
            <boxGeometry args={[0.6, 0.004, 0.21]} />
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
            <mesh position={[0, 0.225, 0]} castShadow>
              <boxGeometry args={[0.72, 0.45, 0.014]} />
              <meshStandardMaterial
                color="#6a7280"
                metalness={0.8}
                roughness={0.25}
              />
            </mesh>
            {/* Inner DAW screen facing Host */}
            <mesh position={[0, 0.225, 0.009]}>
              <planeGeometry args={[0.67, 0.4]} />
              <meshStandardMaterial
                map={textures.laptop}
                emissiveMap={textures.laptop}
                emissive="#ffffff"
                emissiveIntensity={0.6}
              />
            </mesh>
            {/* Outer Lid JungGo Red Sun + Mt. Fuji Emblem facing Camera */}
            <mesh position={[0, 0.225, -0.009]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.7, 0.43]} />
              <meshStandardMaterial
                map={textures.laptopLidLogo}
                metalness={0.55}
                roughness={0.35}
              />
            </mesh>
          </group>
        </group>

        {/* Foreground Right Mini Bonsai Tree in White Ceramic Pot */}
        <BonsaiTree3D
          position={[1.42, 0.78, 0.44]}
          scale={1.08}
          potStyle="whiteRound"
        />

        {/* Warm Glowing Mt. Fuji Shoji Desk Lantern on Far Right */}
        <FujiShojiLamp3D
          position={[1.95, 0.78, 0.46]}
          texture={textures.fujiLamp}
        />
      </group>

      {/* ================= PIXAR-CHIBI NINJA HOST(S) ================= */}
      <NinjaHost3D
        sections={sections}
        subtitles={subtitles}
        studioMode={studioMode}
        boardFocusProgress={boardFocusProgress}
      />
      {isDual ? (
        <FemaleNinjaHost3D
          sections={sections}
          subtitles={subtitles}
          boardFocusProgress={boardFocusProgress}
        />
      ) : null}
    </group>
  );
};
