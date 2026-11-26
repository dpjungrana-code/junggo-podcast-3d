import React, { useMemo } from "react";
import * as THREE from "three";

type CheekBlush3DProps = {
  /** -1 = right cheek (-X), +1 = left cheek (+X). */
  readonly side: number;
  readonly headRadius: number;
  /** Head-local (|x|, y) of the blush centre on the face. */
  readonly anchor: readonly [number, number];
  /** Decal width/height in metres. */
  readonly size: readonly [number, number];
  readonly color: string;
  readonly opacity: number;
  readonly texture: THREE.Texture;
};

const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * Soft radial-gradient blush decal laid tangent to the head sphere. Replaces the
 * old translucent squashed spheres, whose hard rims read as bruises in close-up.
 * The gradient fades to zero before the plane's corners, so the slight sag of
 * the sphere under the flat decal is never visible.
 */
export const CheekBlush3D: React.FC<CheekBlush3DProps> = ({
  side,
  headRadius,
  anchor,
  size,
  color,
  opacity,
  texture,
}) => {
  const x = side * anchor[0];
  const y = anchor[1];
  const { position, quaternion } = useMemo(() => {
    const z = Math.sqrt(Math.max(0, headRadius * headRadius - x * x - y * y));
    const normal = new THREE.Vector3(x, y, z).normalize();
    return {
      position: normal.clone().multiplyScalar(headRadius + 0.0032),
      quaternion: new THREE.Quaternion().setFromUnitVectors(FORWARD, normal),
    };
  }, [headRadius, x, y]);

  return (
    <mesh position={position} quaternion={quaternion}>
      <planeGeometry args={[size[0], size[1]]} />
      <meshStandardMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        roughness={0.62}
      />
    </mesh>
  );
};
