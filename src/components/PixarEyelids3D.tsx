import React from "react";
import * as THREE from "three";

type PixarEyelids3DProps = {
  /** Sclera sphere radius (eye-local). */
  readonly eyeRadius: number;
  /** Sclera X/Y scale so the lid hugs the eyeball exactly. */
  readonly scleraScale: readonly [number, number];
  /** 0 = lid fully up, 1 = closed (rest pose + blink, see `computeUpperLidAmount`). */
  readonly lidAmount: number;
  /** 0..1 cheek push from a warm smile (lifts the lower lid). */
  readonly smileLift: number;
  /** Raw blink amount, for the closed-eye lash line and lower-lid tuck. */
  readonly blinkAmount: number;
  readonly lidColor: string;
  readonly lowerLidColor: string;
  readonly lashColor: string;
  /** Lash-line thickness at the lid edge. */
  readonly lashThickness: number;
  /** Maria's flared outer lashes: +1 / -1 = outer side, 0 = none. */
  readonly wingSide?: number;
};

/** Cap opening (polar angle) at lid fully up / fully closed. */
const THETA_OPEN = 0.35;
const THETA_CLOSED = Math.PI - 0.16;
/** Backward tilt so the lid margin arches (higher in the middle) like a real lid. */
const LID_TILT = -0.32;
/** Lid shell depth relative to the eyeball radius: keeps it in front of the iris. */
const LID_DEPTH_SCALE = 0.62;
const LID_RADIUS_SCALE = 1.07;

const qTheta = (v: number): number => Math.round(v * 200) / 200;

/**
 * Pixar upper/lower eyelid rig shared by both hosts.
 *
 * The upper lid is a spherical cap hugging the eyeball. Its opening angle
 * comes from `lidAmount`, so the same mesh does the relaxed resting lid
 * (covering the top of the iris, no "startled" ring of white), vertical-gaze
 * tracking, smile squints and full blinks. The lash line rides exactly on the
 * cap's edge.
 */
export const PixarEyelids3D: React.FC<PixarEyelids3DProps> = ({
  eyeRadius,
  scleraScale,
  lidAmount,
  smileLift,
  blinkAmount,
  lidColor,
  lowerLidColor,
  lashColor,
  lashThickness,
  wingSide = 0,
}) => {
  const r = eyeRadius * LID_RADIUS_SCALE;
  const sx = scleraScale[0];
  const sy = scleraScale[1];
  const sz = LID_DEPTH_SCALE;
  const theta = qTheta(THETA_OPEN + (THETA_CLOSED - THETA_OPEN) * Math.max(0, Math.min(1, lidAmount)));
  const edgeY = r * Math.cos(theta) * sy;
  const edgeR = r * Math.sin(theta);
  const lashVisible = blinkAmount < 0.62 && edgeR > 0.012;
  const closedLineVisible = blinkAmount >= 0.62;
  // Grows in from nothing (no pop, no pale "bag" at rest) on blinks & warm smiles.
  const smile01 = Math.max(0, Math.min(1, smileLift));
  const lowerLift = blinkAmount * 0.02 + smile01 * 0.012;
  // Gentle listening warmth (<0.25) leaves the lower lid out; real smiles push it up.
  const lowerPresence = Math.min(
    1,
    Math.max(blinkAmount * 4, (smile01 - 0.25) * 2.2),
  );

  return (
    <group>
      <group position={[0, 0, 0.002]} rotation={[LID_TILT, 0, 0]}>
        {/* Upper lid shell */}
        <mesh scale={[sx, sy, sz]}>
          <sphereGeometry args={[r, 24, 14, 0, Math.PI * 2, 0, theta]} />
          <meshStandardMaterial color={lidColor} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>

        {/* Upper lash line riding the lid margin */}
        {lashVisible ? (
          <mesh
            position={[0, edgeY, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[edgeR * sx * 1.01, edgeR * sz * 1.04, lashThickness / 0.2]}
          >
            <torusGeometry args={[1, 0.1, 6, 28, Math.PI]} />
            <meshStandardMaterial color={lashColor} roughness={0.4} />
          </mesh>
        ) : null}

        {/* Flared outer wing lashes (Maria) following the lid edge */}
        {lashVisible && wingSide !== 0 ? (
          <group position={[wingSide * edgeR * sx * 0.97, edgeY, edgeR * sz * 0.2]}>
            <mesh position={[wingSide * 0.004, 0.002, 0]} rotation={[0, 0, wingSide * -0.95]}>
              <capsuleGeometry args={[0.004, 0.017, 4, 6]} />
              <meshStandardMaterial color={lashColor} roughness={0.38} />
            </mesh>
            <mesh position={[wingSide * 0.0005, 0.013, 0]} rotation={[0, 0, wingSide * -0.62]}>
              <capsuleGeometry args={[0.0034, 0.012, 4, 6]} />
              <meshStandardMaterial color={lashColor} roughness={0.38} />
            </mesh>
          </group>
        ) : null}
      </group>

      {/* Friendly curved closed-eye lash line during blinks */}
      {closedLineVisible ? (
        <mesh
          position={[0, -0.016, 0.03]}
          rotation={[0, 0, Math.PI * 1.15]}
          scale={[1.05, 0.42, 0.6]}
        >
          <torusGeometry args={[0.045, lashThickness * 0.95, 6, 14, Math.PI * 0.7]} />
          <meshStandardMaterial color={lashColor} roughness={0.4} />
        </mesh>
      ) : null}

      {/* Lower lid cushion: tucks up on blinks and warm smiles (cheek push) */}
      {lowerPresence > 0.01 ? (
        <mesh
          position={[0, -0.064 + lowerLift, 0.008]}
          scale={[1.05, 0.26 * lowerPresence, 0.3 * lowerPresence]}
        >
          <sphereGeometry args={[eyeRadius * 0.96, 14, 8]} />
          <meshStandardMaterial color={lowerLidColor} roughness={0.52} />
        </mesh>
      ) : null}
    </group>
  );
};
