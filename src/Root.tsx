import React from "react";
import { Composition } from "remotion";
import { JungGoPodcastStudio } from "./Composition";
import currentEpisodeJson from "./data/currentEpisode.json";
import type { EpisodeData } from "./data/demoEpisode";

const FPS = 30;
const currentEpisode = currentEpisodeJson as EpisodeData;
const durationInFrames = Math.max(
  90,
  Math.ceil(currentEpisode.durationSec * FPS),
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="JungGoPodcast3D"
        component={JungGoPodcastStudio}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          episodeTitle: currentEpisode.title,
          audioSrc: currentEpisode.audioSrc ?? "audio/current_episode.mp3",
        }}
      />
    </>
  );
};
