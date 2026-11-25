#!/usr/bin/env python3
"""
Free Japanese TTS + Timestamp Generator for JungGo Podcast Studio.

Reads `scripts/episode_script.json`, synthesizes each line via `edge-tts`
(`ja-JP-KeitaNeural` with warm, measured Sensei delivery `rate="-6%", pitch="-2Hz"`
and `ja-JP-NanamiNeural` for Maria), inserts natural human micro-pauses between
sentences, parses exact MPEG audio frame durations in pure Python (no ffmpeg
required), writes combined MP3 audio to `public/audio/current_episode.mp3`, and
outputs synced timestamps + section ranges to `src/data/currentEpisode.json`.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import edge_tts

VOICE_PROFILE_MAP: dict[str, tuple[str, str, str]] = {
    "sensei": ("ja-JP-KeitaNeural", "-6%", "-2Hz"),
    "junggo": ("ja-JP-KeitaNeural", "-6%", "-2Hz"),
    "maria": ("ja-JP-NanamiNeural", "-3%", "+0Hz"),
    "yuki": ("ja-JP-NanamiNeural", "-3%", "+0Hz"),
}

# MPEG Layer III lookup tables
_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SAMPLE_RATES: dict[int, tuple[int, int, int]] = {
    3: (44100, 48000, 32000),  # MPEG 1
    2: (22050, 24000, 16000),  # MPEG 2
    0: (11025, 12000, 8000),   # MPEG 2.5
}

SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?])")


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

        # Skip any leading Xing/Info VBR metadata header frame
        if not out and (b"Xing" in frame_bytes[:48] or b"Info" in frame_bytes[:48]):
            pos += frame_len
            continue

        if template_header is None:
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
    """Generates exact-format silent MP3 frames for clean natural pauses."""
    if duration_sec <= 0:
        return b"", 0.0
    frame_count = max(1, round(duration_sec / frame_duration_sec))
    silent_frame = template_header + (b"\x00" * max(0, frame_size_bytes - 4))
    return silent_frame * frame_count, frame_count * frame_duration_sec


def _split_japanese_sentences(text: str) -> list[str]:
    """Splits a Japanese cue into natural sentences while keeping punctuation attached."""
    parts = [part.strip() for part in SENTENCE_SPLIT_RE.split(text) if part.strip()]
    return parts if parts else [text.strip()]


async def _tts_clause(text: str, voice: str, rate: str, pitch: str) -> Mp3StreamInfo:
    """Synthesizes one Japanese clause via edge-tts with tuned rate and pitch."""
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    audio_buffer = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buffer.extend(chunk["data"])
    if not audio_buffer:
        raise RuntimeError(f"edge-tts returned empty audio for: {text!r}")
    return _parse_mp3_frames(bytes(audio_buffer))


async def _tts_line_with_micro_pauses(
    text: str,
    voice: str,
    rate: str,
    pitch: str,
    micro_pause_sec: float = 0.22,
) -> Mp3StreamInfo:
    """Synthesizes a line sentence-by-sentence with natural human breath micro-pauses."""
    sentences = _split_japanese_sentences(text)
    clauses = await asyncio.gather(
        *[_tts_clause(sentence, voice=voice, rate=rate, pitch=pitch) for sentence in sentences]
    )

    ref = clauses[0]
    combined = bytearray()
    total_dur = 0.0

    for idx, clause in enumerate(clauses):
        combined.extend(clause.frames_bytes)
        total_dur += clause.duration_sec
        if idx < len(clauses) - 1 and micro_pause_sec > 0:
            pause_bytes, pause_dur = _synthesize_silence(
                micro_pause_sec,
                ref.template_header,
                ref.frame_duration_sec,
                ref.frame_size_bytes,
            )
            combined.extend(pause_bytes)
            total_dur += pause_dur

    return Mp3StreamInfo(
        frames_bytes=bytes(combined),
        duration_sec=total_dur,
        template_header=ref.template_header,
        frame_duration_sec=ref.frame_duration_sec,
        frame_size_bytes=ref.frame_size_bytes,
    )


def _resolve_voice_profile(speaker: str) -> tuple[str, str, str]:
    key = speaker.strip().lower()
    return VOICE_PROFILE_MAP.get(key, VOICE_PROFILE_MAP["sensei"])


def _safe_slug(raw: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", raw).strip("-").lower()
    return cleaned or "visual"


def _generate_visual_svg(
    slug: str,
    visual_prompt: str,
    kanji_data: dict[str, Any] | None,
    out_dir: Path,
) -> str:
    """Generates a clean vector SVG diagram into `public/images/generated/` when no manual image exists."""
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{_safe_slug(slug)}.svg"
    out_file = out_dir / safe_name

    kanji_char = str((kanji_data or {}).get("kanji", "")).strip()
    meaning = str((kanji_data or {}).get("meaningEn", "")).strip()
    haystack = f"{visual_prompt} {kanji_char} {meaning}".lower()

    if any(k in haystack for k in ("朝", "morning", "sunrise", "dawn", "sun")):
        body = (
            '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0%" stop-color="#0f172a"/><stop offset="65%" stop-color="#1e3a5f"/>'
            '<stop offset="100%" stop-color="#7c2d12"/></linearGradient></defs>'
            '<rect width="240" height="240" rx="22" fill="url(#sky)"/>'
            '<circle cx="176" cy="56" r="18" fill="#fde68a" opacity="0.88"/>'
            '<circle cx="184" cy="52" r="15" fill="#13223b"/>'
            '<circle cx="118" cy="142" r="46" fill="#f59e0b" opacity="0.22"/>'
            '<circle cx="118" cy="142" r="32" fill="#ef4444"/>'
            '<path d="M118 96 V84 M82 110 L73 101 M154 110 L163 101" '
            'stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>'
            '<path d="M0 172 Q65 136 128 166 T240 156 V240 H0 Z" fill="#0d5434"/>'
            '<path d="M0 194 Q95 162 175 186 T240 180 V240 H0 Z" fill="#148c53"/>'
            '<circle cx="52" cy="60" r="3" fill="#36f2ae"/>'
            '<circle cx="94" cy="44" r="2.5" fill="#ffffff" opacity="0.8"/>'
        )
    elif any(k in haystack for k in ("駅", "station", "train", "rail", "platform")):
        body = (
            '<rect width="240" height="240" rx="22" fill="#0c1522"/>'
            '<rect x="24" y="28" width="192" height="42" rx="10" fill="#132230" stroke="#36f2ae" stroke-width="2.5"/>'
            '<rect x="44" y="45" width="152" height="8" rx="4" fill="#148c53"/>'
            '<rect x="92" y="37" width="56" height="24" rx="6" fill="#36f2ae"/>'
            '<path d="M72 216 L96 168 M168 216 L144 168" stroke="#64748b" stroke-width="5" stroke-linecap="round"/>'
            '<path d="M78 202 H162 M86 186 H154" stroke="#334155" stroke-width="4"/>'
            '<rect x="64" y="84" width="112" height="86" rx="22" fill="#e2e8f0" stroke="#36f2ae" stroke-width="3"/>'
            '<rect x="78" y="98" width="84" height="34" rx="9" fill="#0f172a"/>'
            '<rect x="64" y="138" width="112" height="10" fill="#148c53"/>'
            '<circle cx="88" cy="157" r="7" fill="#fbbf24"/>'
            '<circle cx="152" cy="157" r="7" fill="#fbbf24"/>'
        )
    elif any(k in haystack for k in ("勉", "強", "study", "notebook", "book", "pencil", "effort")):
        body = (
            '<rect width="240" height="240" rx="22" fill="#0d1520"/>'
            '<path d="M36 68 Q78 54 120 74 Q162 54 204 68 V184 Q162 170 120 190 Q78 170 36 184 Z" '
            'fill="#162230" stroke="#36f2ae" stroke-width="3"/>'
            '<line x1="120" y1="74" x2="120" y2="190" stroke="#36f2ae" stroke-width="2.5"/>'
            '<path d="M54 96 H104 M54 116 H100 M54 136 H96 M136 96 H186 M136 116 H180" '
            'stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>'
            '<g transform="translate(154 114) rotate(32)">'
            '<rect x="-9" y="-42" width="18" height="68" rx="4" fill="#f59e0b"/>'
            '<polygon points="-9,26 9,26 0,44" fill="#fde68a"/>'
            '<rect x="-9" y="-42" width="18" height="12" rx="3" fill="#ef4444"/></g>'
            '<polygon points="62,36 66,46 76,46 68,52 71,62 62,56 53,62 56,52 48,46 58,46" fill="#fbbf24"/>'
            '<circle cx="182" cy="44" r="5" fill="#36f2ae"/>'
        )
    elif any(k in haystack for k in ("料", "理", "食", "cook", "food", "bowl", "kitchen", "meal")):
        body = (
            '<rect width="240" height="240" rx="22" fill="#0d151d"/>'
            '<path d="M84 74 C76 58 94 48 86 34 M120 70 C112 52 130 42 122 26 M156 74 C148 58 166 48 158 34" '
            'fill="none" stroke="#36f2ae" stroke-width="4.5" stroke-linecap="round" opacity="0.85"/>'
            '<line x1="138" y1="102" x2="206" y2="62" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>'
            '<line x1="144" y1="112" x2="212" y2="82" stroke="#fbbf24" stroke-width="6" stroke-linecap="round"/>'
            '<ellipse cx="118" cy="116" rx="70" ry="20" fill="#f8fafc"/>'
            '<ellipse cx="118" cy="118" rx="60" ry="14" fill="#c27832"/>'
            '<path d="M48 118 C48 182 188 182 188 118 Z" fill="#148c53" stroke="#36f2ae" stroke-width="2.5"/>'
            '<rect x="86" y="174" width="64" height="14" rx="5" fill="#0e663c"/>'
            '<circle cx="98" cy="115" r="9" fill="#fde68a"/>'
            '<circle cx="132" cy="114" r="8" fill="#ef4444"/>'
        )
    elif any(k in haystack for k in ("話", "語", "speak", "talk", "conversation", "bubble", "chat")):
        body = (
            '<rect width="240" height="240" rx="22" fill="#0c151f"/>'
            '<rect x="28" y="44" width="130" height="82" rx="20" fill="#148c53" stroke="#36f2ae" stroke-width="2.5"/>'
            '<polygon points="56,124 44,148 80,124" fill="#148c53"/>'
            '<rect x="88" y="106" width="124" height="78" rx="20" fill="#1e293b" stroke="#fbbf24" stroke-width="2.5"/>'
            '<polygon points="184,182 196,204 162,182" fill="#1e293b"/>'
            '<circle cx="68" cy="85" r="7" fill="#ffffff"/>'
            '<circle cx="93" cy="85" r="7" fill="#ffffff"/>'
            '<circle cx="118" cy="85" r="7" fill="#ffffff"/>'
            '<path d="M114 145 H184 M114 162 H164" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>'
            '<path d="M196 58 Q210 72 196 86 M206 48 Q226 72 206 96" '
            'fill="none" stroke="#36f2ae" stroke-width="4" stroke-linecap="round"/>'
        )
    elif any(k in haystack for k in ("雨", "天", "気", "weather", "rain", "cloud")):
        body = (
            '<rect width="240" height="240" rx="22" fill="#0c1522"/>'
            '<circle cx="158" cy="68" r="24" fill="#f59e0b"/>'
            '<path d="M54 136 H182 A26 26 0 0 0 182 86 A38 38 0 0 0 110 74 A30 30 0 0 0 54 136 Z" '
            'fill="#e2e8f0"/>'
            '<path d="M76 154 L66 184 M112 154 L102 184 M148 154 L138 184 M182 154 L172 184" '
            'stroke="#60a5fa" stroke-width="5" stroke-linecap="round"/>'
        )
    else:
        badge_text = html.escape(kanji_char or "漢")
        sub_text = html.escape((meaning or visual_prompt)[:24])
        body = (
            '<rect width="240" height="240" rx="22" fill="#0c141d"/>'
            '<rect x="26" y="26" width="188" height="188" rx="18" fill="#121b22" stroke="#36f2ae" stroke-width="2.5"/>'
            '<line x1="120" y1="30" x2="120" y2="210" stroke="rgba(54,242,174,0.28)" stroke-dasharray="6 5" stroke-width="1.5"/>'
            '<line x1="30" y1="120" x2="210" y2="120" stroke="rgba(54,242,174,0.28)" stroke-dasharray="6 5" stroke-width="1.5"/>'
            f'<text x="120" y="138" text-anchor="middle" fill="#ffffff" font-size="92" font-weight="900">{badge_text}</text>'
            f'<text x="120" y="198" text-anchor="middle" fill="#36f2ae" font-size="16" font-weight="700">{sub_text}</text>'
        )

    svg_doc = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">\n'
        f"  {body}\n"
        "</svg>\n"
    )
    out_file.write_text(svg_doc, encoding="utf-8")
    return f"images/generated/{safe_name}"


async def build_episode(script_path: Path, audio_out_path: Path, json_out_path: Path) -> dict[str, Any]:
    raw_script = json.loads(script_path.read_text(encoding="utf-8"))

    episode_number: str = raw_script.get("episodeNumber", "EP. 01")
    title: str = raw_script.get("title", "JungGo Podcast Episode")
    jlpt_level: str = raw_script.get("jlptLevel", "JLPT N5")
    raw_studio_mode: str = str(raw_script.get("studioMode", "solo")).strip().lower()
    studio_mode: str = raw_studio_mode if raw_studio_mode in ("solo", "dual") else "solo"
    lead_in_target: float = float(raw_script.get("leadInSec", 0.40))
    outro_target: float = float(raw_script.get("outroSec", 0.72))
    micro_pause_sec: float = float(raw_script.get("sentenceMicroPauseSec", 0.22))
    raw_sections: list[dict[str, Any]] = list(raw_script.get("sections", []))
    raw_lines: list[dict[str, Any]] = list(raw_script.get("lines", []))

    if not raw_lines:
        raise ValueError("episode_script.json must contain at least one entry in 'lines'.")

    tasks = []
    for line in raw_lines:
        default_voice, default_rate, default_pitch = _resolve_voice_profile(
            line.get("speaker", "Sensei")
        )
        tasks.append(
            _tts_line_with_micro_pauses(
                text=line["japanese"],
                voice=line.get("voice") or default_voice,
                rate=line.get("rate") or raw_script.get("speechRate") or default_rate,
                pitch=line.get("pitch") or default_pitch,
                micro_pause_sec=float(line.get("microPauseSec", micro_pause_sec)),
            )
        )
    synthesized: list[Mp3StreamInfo] = await asyncio.gather(*tasks)

    ref = synthesized[0]
    combined_audio = bytearray()
    cursor_sec = 0.0

    lead_bytes, lead_dur = _synthesize_silence(
        lead_in_target, ref.template_header, ref.frame_duration_sec, ref.frame_size_bytes
    )
    combined_audio.extend(lead_bytes)
    cursor_sec += lead_dur

    generated_dir = audio_out_path.parent.parent / "images" / "generated"
    subtitles: list[dict[str, Any]] = []
    section_spans: dict[str, list[float]] = {}
    section_line_starts: dict[str, list[float]] = {}

    for idx, (line, stream) in enumerate(zip(raw_lines, synthesized)):
        start_sec = round(cursor_sec, 3)
        combined_audio.extend(stream.frames_bytes)
        cursor_sec += stream.duration_sec
        end_sec = round(cursor_sec, 3)

        cue_obj: dict[str, Any] = {
            "id": line.get("id", f"sub-{idx + 1}"),
            "startSec": start_sec,
            "endSec": end_sec,
            "speaker": line.get("speaker", "Sensei"),
            "japanese": line["japanese"],
            "romaji": line.get("romaji", ""),
            "english": line.get("english", ""),
        }
        if line.get("gesture"):
            cue_obj["gesture"] = line["gesture"]
        if line.get("imageUrl"):
            cue_obj["imageUrl"] = line["imageUrl"]
        elif line.get("visualPrompt"):
            cue_obj["imageUrl"] = _generate_visual_svg(
                slug=f"cue-{cue_obj['id']}",
                visual_prompt=str(line["visualPrompt"]),
                kanji_data=None,
                out_dir=generated_dir,
            )
        if line.get("imageCaption"):
            cue_obj["imageCaption"] = line["imageCaption"]
        subtitles.append(cue_obj)

        sec_id = line.get("sectionId")
        if sec_id:
            section_line_starts.setdefault(sec_id, []).append(start_sec)
            if sec_id not in section_spans:
                section_spans[sec_id] = [start_sec, end_sec]
            else:
                section_spans[sec_id][1] = end_sec

        if idx < len(raw_lines) - 1:
            pause_target = float(line.get("pauseSec", 0.50))
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
            if sec.get("gesture"):
                built_sec["gesture"] = sec["gesture"]
            if "vocab" in sec:
                built_sec["vocab"] = sec["vocab"]

            kanji_payload: dict[str, Any] | None = (
                dict(sec["kanji"]) if isinstance(sec.get("kanji"), dict) else None
            )

            sec_image_url = sec.get("imageUrl") or sec.get("imageSrc")
            if not sec_image_url and kanji_payload is not None:
                sec_image_url = kanji_payload.get("imageUrl")

            prompt_text = str(
                sec.get("visualPrompt")
                or (kanji_payload.get("visualPrompt") if kanji_payload else "")
                or ""
            ).strip()

            if not sec_image_url and (prompt_text or kanji_payload is not None):
                sec_image_url = _generate_visual_svg(
                    slug=sec_id,
                    visual_prompt=prompt_text,
                    kanji_data=kanji_payload,
                    out_dir=generated_dir,
                )

            if kanji_payload is not None:
                if sec_image_url and not kanji_payload.get("imageUrl"):
                    kanji_payload["imageUrl"] = sec_image_url
                built_sec["kanji"] = kanji_payload

            if sec.get("imageUrl"):
                built_sec["imageUrl"] = sec["imageUrl"]
            elif sec_image_url:
                built_sec["imageUrl"] = sec_image_url
            if sec.get("imageSrc"):
                built_sec["imageSrc"] = sec["imageSrc"]
            if sec.get("imageCaption"):
                built_sec["imageCaption"] = sec["imageCaption"]
            if "quiz" in sec:
                quiz = dict(sec["quiz"])
                sec_dur = max(1.0, sec_end - sec_start)
                quiz_line_starts = section_line_starts.get(sec_id, [])
                if "revealSec" not in quiz and len(quiz_line_starts) >= 2:
                    default_cd_start = round(quiz_line_starts[0] + 0.3, 3)
                    default_reveal = round(quiz_line_starts[-1], 3)
                    quiz.setdefault("countdownStartSec", default_cd_start)
                    quiz.setdefault("revealSec", default_reveal)
                    quiz.setdefault(
                        "countdownDurationSec",
                        round(max(0.8, default_reveal - quiz["countdownStartSec"]), 3),
                    )
                else:
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
        "studioMode": studio_mode,
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
