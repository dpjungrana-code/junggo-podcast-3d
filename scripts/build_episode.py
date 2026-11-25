#!/usr/bin/env python3
"""
Free Japanese TTS + Timestamp Generator for JungGo Podcast Studio.

Reads `scripts/episode_script.json`, synthesizes each line via `edge-tts`
(`ja-JP-KeitaNeural` for Sensei, `ja-JP-NanamiNeural` for Maria), parses exact
MPEG audio frame durations in pure Python (no external ffmpeg required), writes
combined MP3 audio to `public/audio/current_episode.mp3`, and outputs synced
timestamps + section ranges to `src/data/currentEpisode.json`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import edge_tts

VOICE_MAP: dict[str, str] = {
    "sensei": "ja-JP-KeitaNeural",
    "junggo": "ja-JP-KeitaNeural",
    "maria": "ja-JP-NanamiNeural",
    "yuki": "ja-JP-NanamiNeural",
}

# MPEG Layer III lookup tables
_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SAMPLE_RATES: dict[int, tuple[int, int, int]] = {
    3: (44100, 48000, 32000),  # MPEG 1
    2: (22050, 24000, 16000),  # MPEG 2
    0: (11025, 12000, 8000),   # MPEG 2.5
}


@dataclass(frozen=True)
class Mp3StreamInfo:
    frames_bytes: bytes
    duration_sec: float
    template_header: bytes
    frame_duration_sec: float
    frame_size_bytes: int


def _strip_id3_tags(data: bytes) -> bytes:
    """Removes leading ID3v2 and trailing ID3v1 tags if present."""
    start = 0
    if len(data) >= 10 and data[:3] == b"ID3":
        size = (
            ((data[6] & 0x7F) << 21)
            | ((data[7] & 0x7F) << 14)
            | ((data[8] & 0x7F) << 7)
            | (data[9] & 0x7F)
        )
        start = min(len(data), 10 + size)

    end = len(data)
    if end - start >= 128 and data[end - 128 : end - 125] == b"TAG":
        end -= 128

    return data[start:end]


def _parse_mp3_frames(raw_data: bytes) -> Mp3StreamInfo:
    """Parses MPEG Layer III frames to extract clean audio bytes and exact duration."""
    data = _strip_id3_tags(raw_data)
    out = bytearray()
    total_duration = 0.0
    template_header: bytes | None = None
    template_frame_duration = 0.024
    template_frame_size = 144

    pos = 0
    length = len(data)

    while pos + 4 <= length:
        b0 = data[pos]
        b1 = data[pos + 1]
        if b0 != 0xFF or (b1 & 0xE0) != 0xE0:
            pos += 1
            continue

        version_id = (b1 >> 3) & 0x03
        layer_id = (b1 >> 1) & 0x03
        if version_id == 1 or layer_id != 1:
            pos += 1
            continue

        b2 = data[pos + 2]
        bitrate_idx = (b2 >> 4) & 0x0F
        sample_idx = (b2 >> 2) & 0x03
        padding = (b2 >> 1) & 0x01

        if bitrate_idx in (0, 15) or sample_idx == 3:
            pos += 1
            continue

        sample_rate = _SAMPLE_RATES[version_id][sample_idx]
        if version_id == 3:
            bitrate_kbps = _BITRATES_V1_L3[bitrate_idx]
            samples_per_frame = 1152
            frame_len = (144 * bitrate_kbps * 1000 // sample_rate) + padding
        else:
            bitrate_kbps = _BITRATES_V2_L3[bitrate_idx]
            samples_per_frame = 576
            frame_len = (72 * bitrate_kbps * 1000 // sample_rate) + padding

        if frame_len < 4 or pos + frame_len > length:
            break

        frame_bytes = data[pos : pos + frame_len]
        frame_dur = samples_per_frame / sample_rate

        # Skip any leading Xing/Info VBR metadata header frame so concatenated audio stays clean
        if not out and (b"Xing" in frame_bytes[:48] or b"Info" in frame_bytes[:48]):
            pos += frame_len
            continue

        if template_header is None:
            # Build a clean silent-frame template: keep MPEG/bitrate/sample_rate,
            # set protection_bit=1 (no CRC) and clear padding_bit=0.
            hdr = bytearray(frame_bytes[:4])
            hdr[1] = hdr[1] | 0x01
            hdr[2] = hdr[2] & 0xFD
            template_header = bytes(hdr)
            template_frame_duration = frame_dur
            template_frame_size = (
                (144 * bitrate_kbps * 1000 // sample_rate)
                if version_id == 3
                else (72 * bitrate_kbps * 1000 // sample_rate)
            )

        out.extend(frame_bytes)
        total_duration += frame_dur
        pos += frame_len

    if template_header is None or total_duration <= 0:
        raise RuntimeError("Failed to parse valid MP3 audio frames from edge-tts output.")

    return Mp3StreamInfo(
        frames_bytes=bytes(out),
        duration_sec=total_duration,
        template_header=template_header,
        frame_duration_sec=template_frame_duration,
        frame_size_bytes=template_frame_size,
    )


def _synthesize_silence(
    duration_sec: float,
    template_header: bytes,
    frame_duration_sec: float,
    frame_size_bytes: int,
) -> tuple[bytes, float]:
    """Generates exact-format silent MP3 frames for clean inter-line pauses."""
    if duration_sec <= 0:
        return b"", 0.0
    frame_count = max(1, round(duration_sec / frame_duration_sec))
    silent_frame = template_header + (b"\x00" * max(0, frame_size_bytes - 4))
    return silent_frame * frame_count, frame_count * frame_duration_sec


async def _tts_line(text: str, voice: str, rate: str) -> Mp3StreamInfo:
    """Synthesizes one Japanese utterance via edge-tts and returns parsed MP3 frames."""
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    audio_buffer = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buffer.extend(chunk["data"])
    if not audio_buffer:
        raise RuntimeError(f"edge-tts returned empty audio for: {text!r}")
    return _parse_mp3_frames(bytes(audio_buffer))


def _resolve_voice(speaker: str) -> str:
    key = speaker.strip().lower()
    if key in VOICE_MAP:
        return VOICE_MAP[key]
    return VOICE_MAP["sensei"]


async def build_episode(script_path: Path, audio_out_path: Path, json_out_path: Path) -> dict[str, Any]:
    raw_script = json.loads(script_path.read_text(encoding="utf-8"))

    episode_number: str = raw_script.get("episodeNumber", "EP. 01")
    title: str = raw_script.get("title", "JungGo Podcast Episode")
    jlpt_level: str = raw_script.get("jlptLevel", "JLPT N5")
    rate: str = raw_script.get("speechRate", "+0%")
    lead_in_target: float = float(raw_script.get("leadInSec", 0.36))
    outro_target: float = float(raw_script.get("outroSec", 0.72))
    raw_sections: list[dict[str, Any]] = list(raw_script.get("sections", []))
    raw_lines: list[dict[str, Any]] = list(raw_script.get("lines", []))

    if not raw_lines:
        raise ValueError("episode_script.json must contain at least one entry in 'lines'.")

    # Synthesize all lines concurrently for speed while keeping deterministic ordering
    tasks = [
        _tts_line(
            text=line["japanese"],
            voice=line.get("voice") or _resolve_voice(line.get("speaker", "Sensei")),
            rate=line.get("rate", rate),
        )
        for line in raw_lines
    ]
    synthesized: list[Mp3StreamInfo] = await asyncio.gather(*tasks)

    # Use first stream's MPEG format for clean silent frame synthesis
    ref = synthesized[0]
    combined_audio = bytearray()
    cursor_sec = 0.0

    lead_bytes, lead_dur = _synthesize_silence(
        lead_in_target, ref.template_header, ref.frame_duration_sec, ref.frame_size_bytes
    )
    combined_audio.extend(lead_bytes)
    cursor_sec += lead_dur

    subtitles: list[dict[str, Any]] = []
    section_spans: dict[str, list[float]] = {}

    for idx, (line, stream) in enumerate(zip(raw_lines, synthesized)):
        start_sec = round(cursor_sec, 3)
        combined_audio.extend(stream.frames_bytes)
        cursor_sec += stream.duration_sec
        end_sec = round(cursor_sec, 3)

        subtitles.append(
            {
                "id": line.get("id", f"sub-{idx + 1}"),
                "startSec": start_sec,
                "endSec": end_sec,
                "speaker": line.get("speaker", "Sensei"),
                "japanese": line["japanese"],
                "romaji": line.get("romaji", ""),
                "english": line.get("english", ""),
            }
        )

        sec_id = line.get("sectionId")
        if sec_id:
            if sec_id not in section_spans:
                section_spans[sec_id] = [start_sec, end_sec]
            else:
                section_spans[sec_id][1] = end_sec

        # Append inter-line pause (except after last line, which gets outro silence)
        if idx < len(raw_lines) - 1:
            pause_target = float(line.get("pauseSec", 0.45))
            pause_bytes, pause_dur = _synthesize_silence(
                pause_target,
                ref.template_header,
                ref.frame_duration_sec,
                ref.frame_size_bytes,
            )
            combined_audio.extend(pause_bytes)
            cursor_sec += pause_dur

    outro_bytes, outro_dur = _synthesize_silence(
        outro_target, ref.template_header, ref.frame_duration_sec, ref.frame_size_bytes
    )
    combined_audio.extend(outro_bytes)
    cursor_sec += outro_dur

    total_duration_sec = round(cursor_sec, 3)

    # Build contiguous non-overlapping sections covering [0, total_duration_sec]
    sections: list[dict[str, Any]] = []
    if not raw_sections:
        sections.append(
            {
                "id": "sec-main",
                "type": "intro",
                "label": "LESSON",
                "startSec": 0.0,
                "endSec": total_duration_sec,
            }
        )
    else:
        for s_idx, sec in enumerate(raw_sections):
            sec_id = sec["id"]
            span = section_spans.get(sec_id)
            if s_idx == 0:
                sec_start = 0.0
            elif span is not None:
                # Start smoothly right at midpoint of previous pause
                prev_end = sections[-1]["endSec"]
                sec_start = round((prev_end + span[0]) / 2.0, 3) if span[0] > prev_end else prev_end
            else:
                sec_start = sections[-1]["endSec"]

            if s_idx > 0:
                sections[-1]["endSec"] = sec_start

            sec_end = (
                total_duration_sec
                if s_idx == len(raw_sections) - 1
                else (span[1] if span is not None else round(sec_start + 1.0, 3))
            )

            built_sec: dict[str, Any] = {
                "id": sec_id,
                "type": sec["type"],
                "label": sec.get("label", sec["type"].upper()),
                "startSec": sec_start,
                "endSec": sec_end,
            }
            if "vocab" in sec:
                built_sec["vocab"] = sec["vocab"]
            if "imageSrc" in sec:
                built_sec["imageSrc"] = sec["imageSrc"]
            if "quiz" in sec:
                quiz = dict(sec["quiz"])
                sec_dur = max(1.0, sec_end - sec_start)
                quiz.setdefault("countdownStartSec", round(sec_start + sec_dur * 0.2, 3))
                quiz.setdefault("countdownDurationSec", round(sec_dur * 0.48, 3))
                quiz.setdefault(
                    "revealSec",
                    round(quiz["countdownStartSec"] + quiz["countdownDurationSec"], 3),
                )
                built_sec["quiz"] = quiz
            sections.append(built_sec)

        sections[-1]["endSec"] = total_duration_sec

    episode_data: dict[str, Any] = {
        "episodeNumber": episode_number,
        "title": title,
        "jlptLevel": jlpt_level,
        "durationSec": total_duration_sec,
        "audioSrc": "audio/current_episode.mp3",
        "sections": sections,
        "subtitles": subtitles,
    }

    audio_out_path.parent.mkdir(parents=True, exist_ok=True)
    audio_out_path.write_bytes(bytes(combined_audio))

    json_out_path.parent.mkdir(parents=True, exist_ok=True)
    json_out_path.write_text(
        json.dumps(episode_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return episode_data


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Generate free Japanese edge-tts MP3 + synced Remotion episode JSON."
    )
    parser.add_argument(
        "--script",
        type=Path,
        default=root / "scripts" / "episode_script.json",
        help="Path to input episode script JSON.",
    )
    parser.add_argument(
        "--audio-out",
        type=Path,
        default=root / "public" / "audio" / "current_episode.mp3",
        help="Path to output combined MP3 audio.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=root / "src" / "data" / "currentEpisode.json",
        help="Path to output synced Remotion episode JSON.",
    )
    args = parser.parse_args()

    episode = asyncio.run(build_episode(args.script, args.audio_out, args.json_out))

    print(f"\nGenerated audio: {args.audio_out} ({args.audio_out.stat().st_size / 1024:.1f} KB)")
    print(f"Generated JSON : {args.json_out}")
    print(f"Total duration : {episode['durationSec']:.3f}s ({round(episode['durationSec'] * 30)} frames @ 30fps)\n")
    for cue in episode["subtitles"]:
        print(
            f"  [{cue['startSec']:6.3f}s -> {cue['endSec']:6.3f}s] "
            f"{cue['speaker']:<7} | {cue['japanese']}"
        )


if __name__ == "__main__":
    main()
