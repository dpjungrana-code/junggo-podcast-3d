import React from "react";

export type IrisPalette = {
  /** Outer limbal ring (darkest). */
  readonly limbal: string;
  /** Main iris body. */
  readonly iris: string;
  /** Warm lower crescent that gives the Pixar "lit from within" gradient. */
  readonly glow: string;
  readonly glowEmissive: string;
  readonly pupil: string;
};

/** Rich dark warm brown-black (Sensei). */
export const SENSEI_IRIS: IrisPalette = {
  limbal: "#1a0c06",
  iris: "#4a2412",
  glow: "#8f4a22",
  glowEmissive: "#3a1808",
  pupil: "#050302",
};

/** Rich dark warm brown-black with a faint chestnut warmth (Maria). */
export const MARIA_IRIS: IrisPalette = {
  limbal: "#1b0b08",
  iris: "#4c2216",
  glow: "#954624",
  glowEmissive: "#3d1709",
  pupil: "#050302",
};

/**
 * The iris layers are flat discs, so any glossy coat reflects a light as one
 * uniform sheet across the whole iris (this is what washed out Sensei's left eye
 * under the front fill light). Keeping specular near zero and roughness high makes
 * the iris read the same at every head angle; the "wet" sparkle comes only from
 * the controlled catchlights below.
 */
const IRIS_SPECULAR = 0.1;
const IRIS_ROUGHNESS = 0.66;

type PixarIris3DProps = {
  readonly palette: IrisPalette;
  readonly radius: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Distance in front of the sclera centre (eye-local +Z). */
  readonly depth?: number;
};

/**
 * Glare-free Pixar iris stack: matte limbal ring, iris body, warm lower glow, deep
 * pupil, and two crisp unlit catchlights. Shared by both hosts so every eye in the
 * studio is calibrated identically and stays symmetrical under any studio light.
 */
export const PixarIris3D: React.FC<PixarIris3DProps> = ({
  palette,
  radius,
  offsetX,
  offsetY,
  depth = 0.0185,
}) => {
  return (
    <group position={[offsetX, offsetY, depth]}>
      <mesh>
        <circleGeometry args={[radius, 24]} />
        <meshPhysicalMaterial
          color={palette.limbal}
          roughness={IRIS_ROUGHNESS}
          metalness={0}
          clearcoat={0}
          specularIntensity={IRIS_SPECULAR}
          envMapIntensity={0}
        />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <circleGeometry args={[radius * 0.905, 24]} />
        <meshPhysicalMaterial
          color={palette.iris}
          roughness={IRIS_ROUGHNESS}
          metalness={0}
          clearcoat={0}
          specularIntensity={IRIS_SPECULAR}
          envMapIntensity={0}
        />
      </mesh>
      <mesh position={[0, -0.009, 0.002]} scale={[0.92, 0.72, 1]}>
        <circleGeometry args={[0.022, 18]} />
        <meshPhysicalMaterial
          color={palette.glow}
          emissive={palette.glowEmissive}
          emissiveIntensity={0.4}
          roughness={IRIS_ROUGHNESS}
          metalness={0}
          clearcoat={0}
          specularIntensity={IRIS_SPECULAR}
          envMapIntensity={0}
        />
      </mesh>
      <mesh position={[0, 0.001, 0.003]}>
        <circleGeometry args={[0.016, 18]} />
        <meshPhysicalMaterial
          color={palette.pupil}
          roughness={0.72}
          metalness={0}
          clearcoat={0}
          specularIntensity={0.05}
          envMapIntensity={0}
        />
      </mesh>

      {/* Primary key-light catchlight: crisp, unlit, identical on every eye */}
      <mesh position={[-0.0112, 0.0122, 0.0042]}>
        <circleGeometry args={[0.0094, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {/* Small secondary bounce catchlight */}
      <mesh position={[0.0122, -0.0112, 0.0042]}>
        <circleGeometry args={[0.0044, 12]} />
        <meshBasicMaterial color="#fff3e6" toneMapped={false} />
      </mesh>
    </group>
  );
};
