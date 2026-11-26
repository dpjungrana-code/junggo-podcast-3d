import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

export type MouthPalette = {
  /** Closed-mouth smile line and lip corners. */
  readonly line: string;
  readonly upperLip: string;
  readonly lowerLip: string;
  /** Interior gradient: just under the upper lip -> deep back -> warm lit floor. */
  readonly cavityTop: string;
  readonly cavityDeep: string;
  readonly cavityWarm: string;
  readonly teeth: string;
  readonly teethShade: string;
  readonly tongue: string;
};

export const SENSEI_MOUTH: MouthPalette = {
  line: "#9e443a",
  upperLip: "#c46a5a",
  lowerLip: "#e09080",
  cavityTop: "#3a0f16",
  cavityDeep: "#22070c",
  cavityWarm: "#7c2a33",
  teeth: "#f6efe4",
  teethShade: "#cfc3b3",
  tongue: "#d0606e",
};

export const MARIA_MOUTH: MouthPalette = {
  line: "#b3454e",
  upperLip: "#cc6068",
  lowerLip: "#e8848a",
  cavityTop: "#3d0e17",
  cavityDeep: "#24070d",
  cavityWarm: "#842a36",
  teeth: "#f7f0e6",
  teethShade: "#d1c4b5",
  tongue: "#d65f71",
};

type PixarMouth3DProps = {
  readonly palette: MouthPalette;
  /** Half-width of the relaxed closed smile (metres, head-local). */
  readonly halfWidth: number;
  /** Head sphere radius, used to wrap the mouth around the face. */
  readonly headRadius: number;
  /** 0..1 jaw opening from the dual-lock lip-sync. */
  readonly jawOpen: number;
  /** Viseme width factor (≈0.74 "u" .. 1.32 "i"; 1.06 at rest). */
  readonly mouthWidth: number;
  /** 0..1 extra warmth: deeper smile curve. */
  readonly smile: number;
};

const COLS = 20;
const MAX_DEPTH = 0.05;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type YFn = (x: number) => number;

/**
 * Builds a vertex-coloured strip between two curves (top -> bottom) across
 * [x0, x1], wrapped onto the head sphere so the corners never float off the face.
 */
const buildBand = (
  x0: number,
  x1: number,
  rows: number,
  top: YFn,
  bottom: YFn,
  wrapRadius: number,
  zOffset: number,
  colorAt: (rowT: number, colU: number) => THREE.Color,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const span = Math.max(1e-6, Math.max(Math.abs(x0), Math.abs(x1)));
  for (let i = 0; i <= COLS; i++) {
    const x = lerp(x0, x1, i / COLS);
    const yTop = top(x);
    const yBot = bottom(x);
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      positions.push(x, lerp(yTop, yBot, t), zOffset - (x * x) / (2 * wrapRadius));
      const c = colorAt(t, x / span);
      colors.push(c.r, c.g, c.b);
    }
  }
  const stride = rows + 1;
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

/** Tube along a curve with soft tapered ends (fuller in the middle, like real lips). */
const buildLip = (
  w: number,
  y: YFn,
  radius: number,
  wrapRadius: number,
  zOffset: number,
): THREE.BufferGeometry => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = lerp(-w, w, i / 16);
    pts.push(new THREE.Vector3(x, y(x), zOffset - (x * x) / (2 * wrapRadius)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubular = 24;
  const radial = 6;
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  const pos = geo.getAttribute("position");
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    const taper = 0.42 + 0.58 * Math.pow(Math.sin(Math.PI * u), 0.6);
    curve.getPointAt(u, center);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(center).multiplyScalar(taper).add(center);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  return geo;
};

const q = (v: number): number => Math.round(v * 20000) / 20000;

/**
 * Shared Pixar speaking mouth for Sensei & Maria.
 *
 * One continuous rig instead of swapping meshes: the closed smile is simply the
 * open mouth at zero depth, so there is no pop between talking and resting.
 * - Soft D-shaped opening with a vertex-colour interior (shadow under the upper
 *   lip -> deep back -> warm lit floor) instead of a flat dark hole.
 * - Ivory upper-teeth arch tucked under the upper lip (no emissive sticker).
 * - Tongue appears only on wide-open vowels, resting on the mouth floor.
 * - Tapered upper/lower lips that always stay attached to the opening.
 * - Narrow visemes ("o"/"u") round the opening into an oval.
 */
export const PixarMouth3D: React.FC<PixarMouth3DProps> = ({
  palette,
  halfWidth,
  headRadius,
  jawOpen,
  mouthWidth,
  smile,
}) => {
  const open = clamp01(jawOpen);
  const depth = q(open * MAX_DEPTH);
  const openN = clamp01(depth / 0.024);
  const w = q(halfWidth * (0.15 + 0.85 * mouthWidth));
  const roundness = clamp01((0.95 - mouthWidth) / 0.2) * openN;
  const smileDip = (0.0105 + clamp01(smile) * 0.004) * (1 - 0.45 * openN);
  const topDip = q(smileDip * (1 - roundness) - roundness * depth * 0.35);

  const colors = useMemo(
    () => ({
      line: new THREE.Color(palette.line),
      upperLip: new THREE.Color(palette.upperLip),
      lowerLip: new THREE.Color(palette.lowerLip),
      cavityTop: new THREE.Color(palette.cavityTop),
      cavityDeep: new THREE.Color(palette.cavityDeep),
      cavityWarm: new THREE.Color(palette.cavityWarm),
      teeth: new THREE.Color(palette.teeth),
      teethShade: new THREE.Color(palette.teethShade),
    }),
    [palette],
  );

  const geometries = useMemo(() => {
    const top: YFn = (x) => -topDip * (1 - (x / w) * (x / w));
    const bottom: YFn = (x) =>
      top(x) - depth * Math.pow(Math.max(0, 1 - (x / w) * (x / w)), 0.42);

    const showInterior = depth > 0.0012;
    const cavity = showInterior
      ? buildBand(-w, w, 4, top, bottom, headRadius, 0, (t) => {
          const c = new THREE.Color();
          return t < 0.45
            ? c.lerpColors(colors.cavityTop, colors.cavityDeep, t / 0.45)
            : c.lerpColors(colors.cavityDeep, colors.cavityWarm, (t - 0.45) / 0.55);
        })
      : null;

    const teethW = w * 0.8;
    const teethH = Math.min(0.011, depth * 0.3);
    const teeth =
      depth > 0.005
        ? buildBand(
            -teethW,
            teethW,
            2,
            (x) => top(x) + 0.0006,
            (x) =>
              top(x) -
              teethH * Math.pow(Math.max(0, 1 - (x / teethW) * (x / teethW)), 0.35),
            headRadius,
            0.0008,
            (t, u) =>
              new THREE.Color().lerpColors(
                colors.teeth,
                colors.teethShade,
                Math.min(1, u * u * 0.8 + t * 0.35),
              ),
          )
        : null;

    const tongueAmt = clamp01((depth - 0.01) / 0.016);
    const tongueW = w * 0.68;
    const tongue =
      tongueAmt > 0.02
        ? buildBand(
            -tongueW,
            tongueW,
            2,
            (x) =>
              bottom(x) +
              0.0004 +
              tongueAmt *
                depth *
                0.42 *
                Math.pow(Math.max(0, 1 - (x / tongueW) * (x / tongueW)), 0.6),
            (x) => bottom(x) + 0.0004,
            headRadius,
            0.0005,
            () => new THREE.Color(palette.tongue),
          )
        : null;

    const upperLip = buildLip(w, top, 0.0029 + openN * 0.0005, headRadius, 0.0016);
    const lowerLip = buildLip(
      w,
      (x) => bottom(x) - 0.0016 - openN * 0.0012,
      lerp(0.0032, 0.005, openN),
      headRadius,
      0.0019,
    );

    return { cavity, teeth, tongue, upperLip, lowerLip };
  }, [w, depth, topDip, openN, headRadius, colors, palette.tongue]);

  useEffect(() => {
    return () => {
      geometries.cavity?.dispose();
      geometries.teeth?.dispose();
      geometries.tongue?.dispose();
      geometries.upperLip.dispose();
      geometries.lowerLip.dispose();
    };
  }, [geometries]);

  const upperLipColor = new THREE.Color().lerpColors(
    colors.line,
    colors.upperLip,
    openN * 0.55,
  );
  const lowerLipColor = new THREE.Color().lerpColors(
    colors.line,
    colors.lowerLip,
    openN,
  );
  const cornerZ = 0.0016 - (w * w) / (2 * headRadius);

  return (
    <group>
      {geometries.cavity ? (
        <mesh geometry={geometries.cavity}>
          <meshStandardMaterial vertexColors roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {geometries.tongue ? (
        <mesh geometry={geometries.tongue}>
          <meshStandardMaterial vertexColors roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {geometries.teeth ? (
        <mesh geometry={geometries.teeth}>
          <meshStandardMaterial vertexColors roughness={0.38} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <mesh geometry={geometries.upperLip}>
        <meshStandardMaterial color={upperLipColor} roughness={0.46} />
      </mesh>
      <mesh geometry={geometries.lowerLip}>
        <meshStandardMaterial color={lowerLipColor} roughness={0.42} />
      </mesh>
      {/* Soft smile corners (hide tube ends, read as tiny dimples) */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * w, 0, cornerZ]}>
          <sphereGeometry args={[0.0036, 8, 6]} />
          <meshStandardMaterial color={palette.line} roughness={0.46} />
        </mesh>
      ))}
    </group>
  );
};
