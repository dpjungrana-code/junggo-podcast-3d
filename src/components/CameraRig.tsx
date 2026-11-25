import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  SubtitleCue,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";

type CameraRigProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
};

type CameraPose = {
  readonly pos: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly fov: number;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpPose = (a: CameraPose, b: CameraPose, t: number): CameraPose => ({
  pos: [
    lerp(a.pos[0], b.pos[0], t),
    lerp(a.pos[1], b.pos[1], t),
    lerp(a.pos[2], b.pos[2], t),
  ],
  lookAt: [
    lerp(a.lookAt[0], b.lookAt[0], t),
    lerp(a.lookAt[1], b.lookAt[1], t),
    lerp(a.lookAt[2], b.lookAt[2], t),
  ],
  fov: lerp(a.fov, b.fov, t),
});

/**
 * Computes deterministic widescreen camera framing driven strictly by `useCurrentFrame()`.
 * Keeps the Ninja Host & Studio Desk cleanly framed in the left third so the right half
 * remains open for the flat 2D PresentationBoard and distant Tokyo Tower skyline.
 */
const getSectionPose = (
  section: EpisodeSection,
  timeSec: number,
  subtitles: readonly SubtitleCue[],
): CameraPose => {
  const duration = Math.max(0.001, section.endSec - section.startSec);
  const localProgress = Math.max(
    0,
    Math.min(1, (timeSec - section.startSec) / duration),
  );

  const microX = Math.sin(timeSec * 0.55) * 0.018;
  const microY = Math.cos(timeSec * 0.45) * 0.01;

  switch (section.type) {
    case "intro":
    case "story": {
      const dolly = Easing.inOut(Easing.sin)(localProgress);
      return {
        pos: [
          lerp(0.08, -0.06, dolly) + microX,
          lerp(1.54, 1.48, dolly) + microY,
          lerp(3.48, 3.22, dolly),
        ],
        lookAt: [lerp(0.22, 0.16, dolly), 1.32, -0.45],
        fov: lerp(42, 40.5, dolly),
      };
    }

    case "vocabulary":
    case "grammar": {
      const orbit = Easing.inOut(Easing.sin)(localProgress);
      return {
        pos: [
          lerp(-0.1, -0.18, orbit) + microX,
          1.48 + microY,
          lerp(3.26, 3.16, orbit),
        ],
        lookAt: [lerp(0.2, 0.24, orbit), 1.32, -0.42],
        fov: 40.5,
      };
    }

    case "dialogue": {
      const activeCue = getActiveSubtitle(subtitles, timeSec);
      const isGuestSpeaking =
        activeCue !== null && isGuestSpeaker(activeCue.speaker);
      const speakerSwitchTime =
        subtitles.find(
          (s) =>
            s.startSec >= section.startSec &&
            s.startSec < section.endSec &&
            isGuestSpeaker(s.speaker),
        )?.startSec ?? section.startSec + duration * 0.5;

      const guestBlend = interpolate(
        timeSec,
        [speakerSwitchTime - 0.55, speakerSwitchTime + 0.55],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        },
      );

      const hostAngle: CameraPose = {
        pos: [0.06 + microX, 1.46 + microY, 3.18],
        lookAt: [0.14, 1.32, -0.45],
        fov: 40,
      };

      const guestAngle: CameraPose = {
        pos: [-0.14 + microX, 1.48 + microY, 3.24],
        lookAt: [0.24, 1.32, -0.42],
        fov: 40.5,
      };

      const blend = isGuestSpeaking ? Math.max(guestBlend, 0.5) : guestBlend;
      return lerpPose(hostAngle, guestAngle, blend);
    }

    case "quiz": {
      const tensionPush = Easing.out(Easing.cubic)(localProgress);
      return {
        pos: [
          lerp(-0.08, -0.14, tensionPush) + microX,
          lerp(1.44, 1.48, tensionPush) + microY,
          lerp(3.32, 3.18, tensionPush),
        ],
        lookAt: [0.22, 1.33, -0.42],
        fov: 41,
      };
    }
  }
};

/**
 * Dynamic 3D Camera Rig choreographer.
 * Computes smooth cross-faded camera trajectories purely from `useCurrentFrame()`.
 */
export const CameraRig: React.FC<CameraRigProps> = ({
  sections,
  subtitles,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { camera } = useThree();
  const timeSec = frame / fps;

  let activeIndex = sections.length - 1;
  for (let i = 0; i < sections.length; i++) {
    if (timeSec >= sections[i].startSec && timeSec < sections[i].endSec) {
      activeIndex = i;
      break;
    }
  }

  const currentSection = sections[activeIndex];
  let pose = getSectionPose(currentSection, timeSec, subtitles);

  const transitionDuration = 0.75;
  if (activeIndex > 0) {
    const prevSection = sections[activeIndex - 1];
    const timeSinceStart = timeSec - currentSection.startSec;
    if (timeSinceStart < transitionDuration) {
      const t = interpolate(timeSinceStart, [0, transitionDuration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      });
      const prevPose = getSectionPose(
        prevSection,
        prevSection.endSec,
        subtitles,
      );
      pose = lerpPose(prevPose, pose, t);
    }
  }

  const applyCamera = (): void => {
    camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - pose.fov) > 0.01) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
      }
    }
    camera.updateMatrixWorld();
  };

  applyCamera();
  useLayoutEffect(() => {
    applyCamera();
  });

  return null;
};
