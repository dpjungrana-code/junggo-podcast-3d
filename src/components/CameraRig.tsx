import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EpisodeSection,
  StudioMode,
  SubtitleCue,
  getActiveSubtitle,
  isGuestSpeaker,
} from "../data/demoEpisode";

type CameraRigProps = {
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
  readonly studioMode?: StudioMode;
  readonly boardFocusProgress?: number;
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
 * Deterministic widescreen camera rig matched to `public/images/studio-reference.jpg`.
 * Keeps the Ninja Host on the left third behind the desk, the JungGo neon wall sign
 * centered above, and the right half open for PresentationBoard + Tokyo Tower + Fuji Lamp.
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

  const microX = Math.sin(timeSec * 0.55) * 0.014;
  const microY = Math.cos(timeSec * 0.45) * 0.008;

  switch (section.type) {
    case "intro":
    case "story": {
      const dolly = Easing.inOut(Easing.sin)(localProgress);
      return {
        pos: [
          lerp(-0.02, -0.1, dolly) + microX,
          lerp(1.5, 1.46, dolly) + microY,
          lerp(3.32, 3.12, dolly),
        ],
        lookAt: [lerp(0.18, 0.14, dolly), 1.32, -0.45],
        fov: lerp(41.5, 40, dolly),
      };
    }

    case "vocabulary":
    case "grammar":
    case "kanji_lesson":
    case "station_guide": {
      const orbit = Easing.inOut(Easing.sin)(localProgress);
      return {
        pos: [
          lerp(-0.1, -0.16, orbit) + microX,
          1.46 + microY,
          lerp(3.16, 3.08, orbit),
        ],
        lookAt: [lerp(0.14, 0.18, orbit), 1.32, -0.45],
        fov: 40,
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
        pos: [-0.02 + microX, 1.46 + microY, 3.12],
        lookAt: [0.12, 1.32, -0.45],
        fov: 39.8,
      };

      const guestAngle: CameraPose = {
        pos: [-0.14 + microX, 1.47 + microY, 3.18],
        lookAt: [0.2, 1.32, -0.44],
        fov: 40.2,
      };

      const blend = isGuestSpeaking ? Math.max(guestBlend, 0.5) : guestBlend;
      return lerpPose(hostAngle, guestAngle, blend);
    }

    case "quiz": {
      const tensionPush = Easing.out(Easing.cubic)(localProgress);
      return {
        pos: [
          lerp(-0.08, -0.14, tensionPush) + microX,
          lerp(1.44, 1.47, tensionPush) + microY,
          lerp(3.22, 3.1, tensionPush),
        ],
        lookAt: [0.18, 1.33, -0.44],
        fov: 40.5,
      };
    }
  }
};

/**
 * Dynamic 3D Camera Rig choreographer driven purely by `useCurrentFrame()`.
 */
export const CameraRig: React.FC<CameraRigProps> = ({
  sections,
  subtitles,
  studioMode = "solo",
  boardFocusProgress = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { camera } = useThree();
  const timeSec = frame / fps;
  const isDual = studioMode === "dual";
  const focusP = Math.max(0, Math.min(1, boardFocusProgress));

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

  let clampedBias = 0;
  if (isDual) {
    let speakerBias = 0;
    for (const cue of subtitles) {
      const target = isGuestSpeaker(cue.speaker) ? 1 : -1;
      const enter = interpolate(
        timeSec,
        [cue.startSec - 0.35, cue.startSec + 0.35],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        },
      );
      const exit = interpolate(
        timeSec,
        [cue.endSec - 0.2, cue.endSec + 0.45],
        [1, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        },
      );
      const env = Math.min(enter, exit);
      if (env > 0.001) {
        speakerBias += target * env;
      }
    }
    clampedBias = Math.max(-1, Math.min(1, speakerBias));
    const panX = clampedBias * 0.09;
    pose = {
      pos: [
        pose.pos[0] + panX - 0.02,
        pose.pos[1] + 0.03,
        pose.pos[2] + 0.25,
      ],
      lookAt: [
        pose.lookAt[0] + panX * 0.65 - 0.04,
        pose.lookAt[1] - 0.04,
        pose.lookAt[2],
      ],
      fov: Math.min(43, pose.fov + 1.4),
    };
  }

  if (focusP > 0.001) {
    const microX = Math.sin(timeSec * 0.55) * 0.007;
    const microY = Math.cos(timeSec * 0.45) * 0.005;
    const circlePanX = isDual ? clampedBias * 0.14 : 0;
    const circlePose: CameraPose = isDual
      ? {
          pos: [-0.61 + circlePanX + microX, 1.42 + microY, 2.38],
          lookAt: [-0.61 + circlePanX * 0.75, 1.35, -0.62],
          fov: 40,
        }
      : {
          pos: [-0.74 + microX, 1.43 + microY, 1.46],
          lookAt: [-0.78, 1.36, -0.62],
          fov: 38,
        };
    pose = lerpPose(pose, circlePose, focusP);
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
