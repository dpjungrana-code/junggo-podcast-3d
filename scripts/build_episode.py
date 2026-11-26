#!/usr/bin/env python3
"""
Free Japanese "Yukkuri" TTS + Whisper QA + Timestamp Generator for JungGo Podcast Studio.

Pipeline:
1. Audits `scripts/episode_script.json` with `fugashi` (`unidic-lite`) + `pykakasi`
   for morphological accuracy, Romaji consistency, and 100% English (zero Nepali).
2. Synthesizes each line using `edge-tts` (`ja-JP-KeitaNeural` & `ja-JP-NanamiNeural`
   at slow learner-friendly `rate="-16%"`), capturing `WordBoundary` metadata and
   inserting crisp inter-sentence silent pauses (450ms–650ms).
3. Verifies EVERY clip with `faster-whisper` (`language="ja"`, `word_timestamps=True`),
   auto-correcting any TTS reading discrepancy via `ttsText` phonetic Kana if needed.
4. Projects true Whisper acoustic word timestamps onto display Japanese & Romaji spans,
   writes `public/audio/current_episode.mp3`, generates custom colorful SVG station
   diagrams into `public/images/generated/`, and writes `src/data/currentEpisode.json`.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import math
import re
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import edge_tts
import numpy as np

from qa_engine import (
    align_word_timings,
    audit_script_morphology,
    compare_phonetics,
    decode_mp3_to_pcm16k,
    furigana_tokens_to_tts_text,
    japanese_to_spoken_kana,
    parse_furigana_markup,
    transcribe_clip_whisper,
)

VOICE_PROFILE_MAP: dict[str, tuple[str, str, str]] = {
    "sensei": ("ja-JP-KeitaNeural", "-16%", "-2Hz"),
    "junggo": ("ja-JP-KeitaNeural", "-16%", "-2Hz"),
    "maria": ("ja-JP-NanamiNeural", "-16%", "+0Hz"),
    "yuki": ("ja-JP-NanamiNeural", "-16%", "+0Hz"),
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
    word_boundaries: tuple[tuple[str, float, float], ...] = ()


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


def _parse_mp3_frames(
    raw_data: bytes,
    word_boundaries: tuple[tuple[str, float, float], ...] = (),
) -> Mp3StreamInfo:
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
        word_boundaries=word_boundaries,
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
    """Splits a Japanese cue into sentences while keeping punctuation attached."""
    raw_parts = [part.strip() for part in SENTENCE_SPLIT_RE.split(text) if part.strip()]
    # Reattach closing quote if split left `」` on its own element
    parts: list[str] = []
    for part in raw_parts:
        if part in ("」", "』", "）", ")") and parts:
            parts[-1] = parts[-1] + part
        else:
            parts.append(part)
    return parts if parts else [text.strip()]


async def _tts_clause(text: str, voice: str, rate: str, pitch: str) -> Mp3StreamInfo:
    """Synthesizes one Japanese clause via edge-tts and captures WordBoundary metadata."""
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        boundary="WordBoundary",
    )
    audio_buffer = bytearray()
    boundaries: list[tuple[str, float, float]] = []
    async for chunk in communicate.stream():
        ctype = chunk.get("type")
        if ctype == "audio":
            audio_buffer.extend(chunk["data"])
        elif ctype == "WordBoundary":
            offset_sec = float(chunk.get("offset", 0)) / 10_000_000.0
            dur_sec = float(chunk.get("duration", 0)) / 10_000_000.0
            word_txt = str(chunk.get("text", "")).strip()
            if word_txt:
                boundaries.append((word_txt, offset_sec, offset_sec + dur_sec))
    if not audio_buffer:
        raise RuntimeError(f"edge-tts returned empty audio for: {text!r}")
    return _parse_mp3_frames(bytes(audio_buffer), tuple(boundaries))


async def _tts_line_with_micro_pauses(
    text: str,
    voice: str,
    rate: str,
    pitch: str,
    micro_pause_sec: float = 0.45,
) -> Mp3StreamInfo:
    """Synthesizes a line sentence-by-sentence with learner-friendly breath pauses."""
    sentences = _split_japanese_sentences(text)
    clauses = await asyncio.gather(
        *[_tts_clause(sentence, voice=voice, rate=rate, pitch=pitch) for sentence in sentences]
    )

    ref = clauses[0]
    combined = bytearray()
    total_dur = 0.0
    combined_boundaries: list[tuple[str, float, float]] = []

    for idx, clause in enumerate(clauses):
        clause_offset = total_dur
        combined.extend(clause.frames_bytes)
        for b_word, b_s, b_e in clause.word_boundaries:
            combined_boundaries.append((b_word, clause_offset + b_s, clause_offset + b_e))
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
        word_boundaries=tuple(combined_boundaries),
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
    """Generates a custom colorful vector SVG diagram in `public/images/generated/`."""
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{_safe_slug(slug)}.svg"
    out_file = out_dir / safe_name

    kanji_char = str((kanji_data or {}).get("kanji", "")).strip()
    meaning = str((kanji_data or {}).get("meaningEn", "")).strip()
    haystack = f"{slug} {visual_prompt} {kanji_char} {meaning}".lower()

    if "station_exits_map" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            '<rect x="10" y="10" width="300" height="220" rx="14" fill="#0f1b28" stroke="#22c55e" stroke-width="2" stroke-opacity="0.45"/>'
            # Railway tracks horizontally behind station
            '<line x1="16" y1="120" x2="304" y2="120" stroke="#334155" stroke-width="10"/>'
            '<line x1="16" y1="120" x2="304" y2="120" stroke="#94a3b8" stroke-width="2" stroke-dasharray="10 8"/>'
            # Four Exit Pills
            '<rect x="114" y="20" width="92" height="34" rx="10" fill="#148c53" stroke="#34d399" stroke-width="2"/>'
            '<text x="160" y="42" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="800">北口 N</text>'
            '<rect x="114" y="186" width="92" height="34" rx="10" fill="#148c53" stroke="#34d399" stroke-width="2"/>'
            '<text x="160" y="208" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="800">南口 S</text>'
            '<rect x="18" y="102" width="76" height="36" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>'
            '<text x="56" y="125" text-anchor="middle" fill="#e0f2fe" font-size="15" font-weight="800">西口 W</text>'
            '<rect x="226" y="102" width="76" height="36" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>'
            '<text x="264" y="125" text-anchor="middle" fill="#e0f2fe" font-size="15" font-weight="800">東口 E</text>'
            # Compass connecting lines
            '<path d="M160 56 V80 M160 160 V184 M96 120 H116 M204 120 H224" stroke="#34d399" stroke-width="3" stroke-linecap="round"/>'
            # Center Station Hub + Entrance/Exit badges
            '<circle cx="160" cy="120" r="38" fill="#102536" stroke="#34d399" stroke-width="3"/>'
            '<text x="160" y="129" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="900">駅</text>'
            '<rect x="18" y="22" width="76" height="26" rx="7" fill="#0d9488"/>'
            '<text x="56" y="40" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">入口 IN</text>'
            '<rect x="226" y="22" width="76" height="26" rx="7" fill="#facc15"/>'
            '<text x="264" y="40" text-anchor="middle" fill="#111827" font-size="12" font-weight="900">出口 OUT</text>'
        )
    elif "ticket_machine_ic" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            # Ticket Machine Kiosk (券売機)
            '<rect x="22" y="22" width="166" height="196" rx="14" fill="#182534" stroke="#34d399" stroke-width="2.5"/>'
            '<rect x="34" y="32" width="142" height="26" rx="6" fill="#0f766e"/>'
            '<text x="105" y="50" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">券売機 TICKETS</text>'
            # LCD Touch Screen
            '<rect x="36" y="66" width="138" height="90" rx="8" fill="#0b121c" stroke="#38bdf8" stroke-width="1.8"/>'
            '<rect x="44" y="76" width="58" height="32" rx="6" fill="#0284c7"/>'
            '<text x="73" y="96" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">片道</text>'
            '<rect x="108" y="76" width="58" height="32" rx="6" fill="#148c53"/>'
            '<text x="137" y="96" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">往復</text>'
            '<rect x="44" y="116" width="122" height="30" rx="6" fill="#1e293b" stroke="#fbbf24" stroke-width="1.5"/>'
            '<text x="105" y="136" text-anchor="middle" fill="#fde68a" font-size="13" font-weight="800">運賃 ¥200  EN</text>'
            # Ticket slot
            '<rect x="52" y="174" width="106" height="26" rx="6" fill="#0f172a" stroke="#64748b" stroke-width="1.5"/>'
            '<rect x="82" y="182" width="46" height="10" rx="3" fill="#34d399"/>'
            # Suica / PASMO IC Card & Contactless Charge Pad
            '<circle cx="250" cy="158" r="40" fill="#0f2922" stroke="#34d399" stroke-width="2.5" stroke-dasharray="6 4"/>'
            '<text x="250" y="163" text-anchor="middle" fill="#34d399" font-size="13" font-weight="900">IC チャージ</text>'
            '<rect x="206" y="34" width="92" height="62" rx="10" fill="#22c55e" stroke="#bbf7d0" stroke-width="2"/>'
            '<rect x="206" y="48" width="92" height="14" fill="#15803d"/>'
            '<text x="252" y="78" text-anchor="middle" fill="#ffffff" font-size="15" font-weight="900">Suica / IC</text>'
            # Tap Waves
            '<path d="M236 106 Q250 116 264 106 M228 114 Q250 128 272 114" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>'
        )
    elif "ticket_gate_fare_adjust" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            # Left: Ticket Gate (改札口)
            '<rect x="18" y="24" width="148" height="192" rx="14" fill="#132231" stroke="#38bdf8" stroke-width="2"/>'
            '<text x="92" y="48" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">改札口 GATE</text>'
            # Two silver gate pillars + open pass lane
            '<rect x="34" y="64" width="38" height="130" rx="8" fill="#334155" stroke="#64748b" stroke-width="1.5"/>'
            '<rect x="112" y="64" width="38" height="130" rx="8" fill="#334155" stroke="#64748b" stroke-width="1.5"/>'
            # Glowing blue IC reader on top
            '<ellipse cx="53" cy="76" rx="14" ry="8" fill="#38bdf8"/>'
            '<circle cx="131" cy="76" r="8" fill="#22c55e"/>'
            # Green pass arrow
            '<path d="M92 178 V88 M78 104 L92 86 L106 104" fill="none" stroke="#34d399" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
            '<rect x="44" y="186" width="96" height="20" rx="6" fill="#0f766e"/>'
            '<text x="92" y="200" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800">IC タッチ PASS</text>'
            # Right: Fare Adjustment Machine (精算機)
            '<rect x="182" y="24" width="120" height="192" rx="14" fill="#3b2f0b" stroke="#facc15" stroke-width="2.5"/>'
            '<rect x="194" y="34" width="96" height="26" rx="6" fill="#facc15"/>'
            '<text x="242" y="52" text-anchor="middle" fill="#111827" font-size="14" font-weight="900">精算機</text>'
            '<rect x="196" y="70" width="92" height="58" rx="8" fill="#111827" stroke="#fbbf24" stroke-width="1.5"/>'
            '<text x="242" y="94" text-anchor="middle" fill="#fde68a" font-size="13" font-weight="800">残高不足</text>'
            '<text x="242" y="116" text-anchor="middle" fill="#34d399" font-size="16" font-weight="900">+¥180 OK</text>'
            '<rect x="200" y="142" width="84" height="24" rx="6" fill="#1f2937"/>'
            '<text x="242" y="158" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">FARE ADJUST</text>'
            '<rect x="212" y="178" width="60" height="22" rx="6" fill="#f59e0b"/>'
            '<text x="242" y="193" text-anchor="middle" fill="#111827" font-size="11" font-weight="900">精算券</text>'
        )
    elif "train_types_stops" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            # Platform header
            '<rect x="16" y="16" width="288" height="32" rx="8" fill="#132533" stroke="#34d399" stroke-width="1.8"/>'
            '<text x="160" y="37" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">3番線 PLATFORM 3  →  新宿</text>'
            # Stop columns header (Stations A B C D E)
            '<text x="122" y="64" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700">S1</text>'
            '<text x="162" y="64" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700">S2</text>'
            '<text x="202" y="64" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700">S3</text>'
            '<text x="242" y="64" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700">S4</text>'
            '<text x="282" y="64" text-anchor="middle" fill="#34d399" font-size="10" font-weight="900">新宿</text>'
            # 1. 各駅停車 (Blue - all 5 stops)
            '<rect x="16" y="72" width="84" height="30" rx="7" fill="#0284c7"/>'
            '<text x="58" y="92" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="900">各駅停車</text>'
            '<line x1="122" y1="87" x2="282" y2="87" stroke="#38bdf8" stroke-width="4"/>'
            '<circle cx="122" cy="87" r="6" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>'
            '<circle cx="162" cy="87" r="6" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>'
            '<circle cx="202" cy="87" r="6" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>'
            '<circle cx="242" cy="87" r="6" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>'
            '<circle cx="282" cy="87" r="7" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>'
            # 2. 快速 (Green - skips S2, S4)
            '<rect x="16" y="112" width="84" height="30" rx="7" fill="#148c53"/>'
            '<text x="58" y="132" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">快速</text>'
            '<line x1="122" y1="127" x2="282" y2="127" stroke="#34d399" stroke-width="4"/>'
            '<circle cx="122" cy="127" r="6" fill="#ffffff" stroke="#148c53" stroke-width="3"/>'
            '<circle cx="202" cy="127" r="6" fill="#ffffff" stroke="#148c53" stroke-width="3"/>'
            '<circle cx="282" cy="127" r="7" fill="#ffffff" stroke="#148c53" stroke-width="3"/>'
            # 3. 急行 (Amber - S1, S3, Shinjuku or S1 & S3/S5)
            '<rect x="16" y="152" width="84" height="30" rx="7" fill="#d97706"/>'
            '<text x="58" y="172" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">急行</text>'
            '<line x1="122" y1="167" x2="282" y2="167" stroke="#fbbf24" stroke-width="4"/>'
            '<circle cx="122" cy="167" r="6" fill="#ffffff" stroke="#d97706" stroke-width="3"/>'
            '<circle cx="202" cy="167" r="6" fill="#ffffff" stroke="#d97706" stroke-width="3"/>'
            '<circle cx="282" cy="167" r="7" fill="#ffffff" stroke="#d97706" stroke-width="3"/>'
            # 4. 特急 (Rose - terminal to terminal)
            '<rect x="16" y="192" width="84" height="30" rx="7" fill="#e11d48"/>'
            '<text x="58" y="212" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="900">特急</text>'
            '<line x1="122" y1="207" x2="282" y2="207" stroke="#fb7185" stroke-width="4"/>'
            '<circle cx="122" cy="207" r="6" fill="#ffffff" stroke="#e11d48" stroke-width="3"/>'
            '<circle cx="282" cy="207" r="7" fill="#ffffff" stroke="#e11d48" stroke-width="3"/>'
        )
    elif "yellow_exit_transfer" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            # Official Japanese bright yellow overhead EXIT sign
            '<rect x="20" y="20" width="280" height="66" rx="10" fill="#facc15" stroke="#fde047" stroke-width="2.5"/>'
            '<rect x="28" y="28" width="46" height="50" rx="8" fill="#148c53"/>'
            '<text x="51" y="61" text-anchor="middle" fill="#ffffff" font-size="22" font-weight="900">↗</text>'
            '<text x="186" y="52" text-anchor="middle" fill="#111827" font-size="24" font-weight="900">出口  EXIT</text>'
            '<text x="186" y="74" text-anchor="middle" fill="#1f2937" font-size="11.5" font-weight="800">南口 South Exit · Yellow Standard</text>'
            # Transfer lines box (乗り換え)
            '<rect x="20" y="102" width="280" height="72" rx="12" fill="#132230" stroke="#38bdf8" stroke-width="2"/>'
            '<text x="36" y="126" fill="#38bdf8" font-size="13" font-weight="900">乗り換え TRANSFER</text>'
            '<rect x="34" y="136" width="94" height="26" rx="13" fill="#16a34a"/>'
            '<text x="81" y="154" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">JR 山手線</text>'
            '<path d="M138 149 H178 M168 141 L180 149 L168 157" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
            '<rect x="190" y="136" width="96" height="26" rx="13" fill="#e11d48"/>'
            '<text x="238" y="154" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">東京メトロ</text>'
            # Last Train badge (終電)
            '<rect x="20" y="186" width="280" height="36" rx="10" fill="#1e1b4b" stroke="#a78bfa" stroke-width="1.8"/>'
            '<text x="160" y="210" text-anchor="middle" fill="#fde68a" font-size="15" font-weight="900">終電 LAST TRAIN  23:58 Check!</text>'
        )
    elif "roleplay_shinjuku_gate" in haystack:
        body = (
            '<rect width="320" height="240" rx="18" fill="#0b131d"/>'
            '<rect x="18" y="18" width="284" height="44" rx="10" fill="#148c53" stroke="#34d399" stroke-width="2"/>'
            '<text x="160" y="46" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="900">新宿  SHINJUKU  3番線</text>'
            '<rect x="26" y="78" width="128" height="66" rx="12" fill="#1f2937" stroke="#f59e0b" stroke-width="2"/>'
            '<text x="90" y="102" text-anchor="middle" fill="#fde68a" font-size="12" font-weight="800">MARIA (Traveler)</text>'
            '<text x="90" y="126" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="800">新宿に行きますか？</text>'
            '<rect x="166" y="78" width="128" height="66" rx="12" fill="#132533" stroke="#34d399" stroke-width="2"/>'
            '<text x="230" y="102" text-anchor="middle" fill="#34d399" font-size="12" font-weight="800">SENSEI (Staff)</text>'
            '<text x="230" y="126" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="800">3番線の快速です!</text>'
            '<rect x="26" y="160" width="268" height="58" rx="12" fill="#facc15"/>'
            '<text x="160" y="185" text-anchor="middle" fill="#111827" font-size="16" font-weight="900">出口 南口 SOUTH EXIT  ↑</text>'
            '<text x="160" y="206" text-anchor="middle" fill="#1f2937" font-size="12" font-weight="800">Miss a stop? → Use the 精算機 Fare Machine</text>'
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
    else:
        badge_text = html.escape(kanji_char or "駅")
        sub_text = html.escape((meaning or visual_prompt)[:24])
        body = (
            '<rect width="240" height="240" rx="22" fill="#0c141d"/>'
            '<rect x="26" y="26" width="188" height="188" rx="18" fill="#121b22" stroke="#36f2ae" stroke-width="2.5"/>'
            '<line x1="120" y1="30" x2="120" y2="210" stroke="rgba(54,242,174,0.28)" stroke-dasharray="6 5" stroke-width="1.5"/>'
            '<line x1="30" y1="120" x2="210" y2="120" stroke="rgba(54,242,174,0.28)" stroke-dasharray="6 5" stroke-width="1.5"/>'
            f'<text x="120" y="138" text-anchor="middle" fill="#ffffff" font-size="92" font-weight="900">{badge_text}</text>'
            f'<text x="120" y="198" text-anchor="middle" fill="#36f2ae" font-size="16" font-weight="700">{sub_text}</text>'
        )

    is_wide = any(
        tag in haystack
        for tag in (
            "station_exits_map",
            "ticket_machine_ic",
            "ticket_gate_fare_adjust",
            "train_types_stops",
            "yellow_exit_transfer",
            "roleplay_shinjuku_gate",
        )
    )
    w, h = (320, 240) if is_wide else (240, 240)
    svg_doc = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        f"  {body}\n"
        "</svg>\n"
    )
    out_file.write_text(svg_doc, encoding="utf-8")
    return f"images/generated/{safe_name}"


async def _synthesize_and_verify_line(
    line: dict[str, Any],
    default_rate: str,
    micro_pause_sec: float,
    whisper_model: str,
) -> tuple[Mp3StreamInfo, Any, list[dict[str, Any]] | None]:
    """
    Synthesizes a cue clip with Edge-TTS (`rate="-16%"`), checks it blindly with
    `faster-whisper`, and auto-retries using canonical spoken hiragana if similarity < 0.88.
    """
    voice, rate, pitch = _resolve_voice_profile(line.get("speaker", "Sensei"))
    rate = line.get("rate") or default_rate or rate
    pitch = line.get("pitch") or pitch
    pause_in_line = float(line.get("microPauseSec", micro_pause_sec))

    display_jp, parsed_tokens = parse_furigana_markup(str(line["japanese"]))
    auto_tts = furigana_tokens_to_tts_text(parsed_tokens)
    line["japanese"] = display_jp
    line["_furigana_tokens"] = parsed_tokens
    primary_text = str(line.get("ttsText") or auto_tts)
    line["ttsText"] = primary_text
    stream = await _tts_line_with_micro_pauses(
        text=primary_text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        micro_pause_sec=pause_in_line,
    )
    pcm = decode_mp3_to_pcm16k(stream.frames_bytes)
    whisper_res = transcribe_clip_whisper(pcm, model_size=whisper_model)
    sim = compare_phonetics(primary_text, whisper_res.transcript)

    if sim < 0.88:
        auto_kana = auto_tts or japanese_to_spoken_kana(display_jp)
        print(
            f"[QA AUTO-FIX] {line.get('id')}: low Whisper similarity ({sim:.2%}) "
            f"| expected={japanese_to_spoken_kana(primary_text)} vs heard={whisper_res.kana}. "
            f"Retrying with pure kana ttsText..."
        )
        retry_stream = await _tts_line_with_micro_pauses(
            text=auto_kana,
            voice=voice,
            rate=rate,
            pitch=pitch,
            micro_pause_sec=pause_in_line,
        )
        retry_pcm = decode_mp3_to_pcm16k(retry_stream.frames_bytes)
        retry_whisper = transcribe_clip_whisper(retry_pcm, model_size=whisper_model)
        retry_sim = compare_phonetics(primary_text, retry_whisper.transcript)
        if retry_sim > sim:
            stream = retry_stream
            pcm = retry_pcm
            whisper_res = retry_whisper
            sim = retry_sim
            line["ttsText"] = auto_kana

    return stream, (pcm, whisper_res, sim), parsed_tokens


def _write_wav_pcm16(path: Path, samples: np.ndarray, sample_rate: int = 44100) -> None:
    """Writes normalized float32/float64 audio samples [-1, 1] to 16-bit mono WAV."""
    clipped = np.clip(samples, -1.0, 1.0)
    pcm16 = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())


def _generate_sfx_library(sfx_dir: Path) -> dict[str, str]:
    """
    Synthesizes 6 clean, royalty-free procedural WAV sound effects in `public/audio/sfx/`
    so UI switches, train chimes, IC card taps, coins, and quiz reveals stay lively.
    """
    sfx_dir.mkdir(parents=True, exist_ok=True)
    sr = 44100

    # 1. whoosh.wav: airy soft filtered-noise + subtle pitch glide (0.32s)
    t_w = np.linspace(0.0, 0.32, int(sr * 0.32), endpoint=False)
    rng = np.random.default_rng(42)
    noise = rng.normal(0.0, 1.0, size=t_w.shape[0])
    # Smooth moving-average lowpass + gentle bandpass character
    kernel = np.ones(48) / 48.0
    smooth_noise = np.convolve(noise, kernel, mode="same")
    env_w = np.sin(np.pi * (t_w / 0.32)) ** 1.4
    sweep = np.sin(2.0 * np.pi * (240.0 + 380.0 * (t_w / 0.32)) * t_w) * 0.12
    _write_wav_pcm16(sfx_dir / "whoosh.wav", (smooth_noise * 0.75 + sweep) * env_w * 0.55, sr)

    # 2. ic_beep.wav: crisp Japanese IC gate double-chirp "ピッ！" (0.20s)
    t_ic = np.linspace(0.0, 0.20, int(sr * 0.20), endpoint=False)
    sig_ic = np.zeros_like(t_ic)
    m1 = t_ic < 0.065
    m2 = (t_ic >= 0.085) & (t_ic < 0.175)
    sig_ic[m1] = np.sin(2.0 * np.pi * 2280.0 * t_ic[m1]) * np.exp(-t_ic[m1] * 26.0)
    sig_ic[m2] = (
        0.75 * np.sin(2.0 * np.pi * 2280.0 * (t_ic[m2] - 0.085))
        + 0.35 * np.sin(2.0 * np.pi * 3420.0 * (t_ic[m2] - 0.085))
    ) * np.exp(-(t_ic[m2] - 0.085) * 20.0)
    _write_wav_pcm16(sfx_dir / "ic_beep.wav", sig_ic * 0.65, sr)

    # 3. coin_clink.wav: sparkling yen coin metallic chime (0.36s)
    t_c = np.linspace(0.0, 0.36, int(sr * 0.36), endpoint=False)
    c1 = (
        0.6 * np.sin(2.0 * np.pi * 2637.0 * t_c)
        + 0.4 * np.sin(2.0 * np.pi * 3951.0 * t_c)
    ) * np.exp(-t_c * 14.0)
    delay = (t_c >= 0.075).astype(np.float64)
    t_c2 = np.maximum(0.0, t_c - 0.075)
    c2 = delay * (
        0.55 * np.sin(2.0 * np.pi * 3136.0 * t_c2)
        + 0.35 * np.sin(2.0 * np.pi * 4698.0 * t_c2)
    ) * np.exp(-t_c2 * 11.0)
    _write_wav_pcm16(sfx_dir / "coin_clink.wav", (c1 + c2) * 0.55, sr)

    # 4. error_buzz.wav: soft gentle two-tone low-balance alert (0.30s)
    t_e = np.linspace(0.0, 0.30, int(sr * 0.30), endpoint=False)
    sig_e = np.zeros_like(t_e)
    e1 = t_e < 0.12
    e2 = t_e >= 0.14
    sig_e[e1] = (
        0.7 * np.sin(2.0 * np.pi * 340.0 * t_e[e1])
        + 0.3 * np.sin(2.0 * np.pi * 510.0 * t_e[e1])
    ) * np.exp(-t_e[e1] * 14.0)
    sig_e[e2] = (
        0.75 * np.sin(2.0 * np.pi * 255.0 * (t_e[e2] - 0.14))
        + 0.25 * np.sin(2.0 * np.pi * 382.0 * (t_e[e2] - 0.14))
    ) * np.exp(-(t_e[e2] - 0.14) * 12.0)
    _write_wav_pcm16(sfx_dir / "error_buzz.wav", sig_e * 0.65, sr)

    # 5. train_chime.wav: warm JR-inspired ascending 4-note station chime (0.70s)
    t_t = np.linspace(0.0, 0.70, int(sr * 0.70), endpoint=False)
    sig_t = np.zeros_like(t_t)
    notes_train = [(0.0, 783.99), (0.14, 987.77), (0.28, 1174.66), (0.42, 1567.98)]
    for onset, freq in notes_train:
        mask = t_t >= onset
        dt = np.maximum(0.0, t_t - onset)
        tone = (
            0.75 * np.sin(2.0 * math.pi * freq * dt)
            + 0.25 * np.sin(2.0 * math.pi * (freq * 2.0) * dt)
        ) * np.exp(-dt * 8.5)
        sig_t += mask * tone
    _write_wav_pcm16(sfx_dir / "train_chime.wav", sig_t * 0.5, sr)

    # 6. quiz_correct.wav: crisp cheerful "ピンポン！" major triad chime (0.58s)
    t_q = np.linspace(0.0, 0.58, int(sr * 0.58), endpoint=False)
    sig_q = np.zeros_like(t_q)
    for onset, freq in [(0.0, 1046.5), (0.11, 1318.51), (0.22, 1567.98)]:
        mask = t_q >= onset
        dt = np.maximum(0.0, t_q - onset)
        sig_q += mask * (
            0.8 * np.sin(2.0 * math.pi * freq * dt)
            + 0.2 * np.sin(2.0 * math.pi * (freq * 2.0) * dt)
        ) * np.exp(-dt * 8.0)
    _write_wav_pcm16(sfx_dir / "quiz_correct.wav", sig_q * 0.52, sr)

    return {
        "whoosh": "audio/sfx/whoosh.wav",
        "ic_beep": "audio/sfx/ic_beep.wav",
        "coin_clink": "audio/sfx/coin_clink.wav",
        "error_buzz": "audio/sfx/error_buzz.wav",
        "train_chime": "audio/sfx/train_chime.wav",
        "quiz_correct": "audio/sfx/quiz_correct.wav",
    }


def _compute_cue_subtopic_switches(
    cue_start_sec: float,
    word_timings: list[dict[str, Any]],
    sub_topics: list[dict[str, Any]],
    default_index: int | None,
) -> list[dict[str, Any]]:
    """
    Maps Whisper word timestamps onto `subTopics` triggers so the active pill
    and Left Spotlight follow Sensei & Maria's spoken words dynamically.
    """
    if not sub_topics:
        return []

    hits: list[tuple[float, int]] = []
    for wt in word_timings:
        word_text = str(wt.get("word", "")).strip()
        if not word_text:
            continue
        w_start = float(wt.get("startSec", cue_start_sec))
        for idx, topic in enumerate(sub_topics):
            keywords = topic.get("triggerKeywords") or [topic.get("jp", "")]
            if any(str(kw) and (str(kw) in word_text or word_text in str(kw)) and len(word_text) >= 2 for kw in keywords):
                hits.append((round(w_start, 3), idx))
                break

    base_idx = int(default_index) if default_index is not None else 0
    base_idx = max(0, min(len(sub_topics) - 1, base_idx))

    switches: list[dict[str, Any]] = [{"timeSec": round(cue_start_sec, 3), "subTopicIndex": base_idx}]
    for t_sec, idx in sorted(hits, key=lambda pair: pair[0]):
        if t_sec <= switches[-1]["timeSec"] + 0.15:
            if len(switches) == 1:
                switches[0]["subTopicIndex"] = idx
            continue
        if idx != switches[-1]["subTopicIndex"]:
            switches.append({"timeSec": t_sec, "subTopicIndex": idx})
    return switches


async def build_episode(
    script_path: Path,
    audio_out_path: Path,
    json_out_path: Path,
    whisper_model: str = "small",
) -> dict[str, Any]:
    raw_script = json.loads(script_path.read_text(encoding="utf-8"))

    # Pre-TTS Morphological & Zero-Nepali Gate
    morph_errors = audit_script_morphology(raw_script)
    if morph_errors:
        joined = "\n  - ".join(morph_errors)
        raise RuntimeError(f"Pre-TTS morphological/Nepali audit failed:\n  - {joined}")
    print("[QA] Pre-TTS morphological, Romaji & zero-Nepali check PASSED (0 errors).")

    episode_number: str = raw_script.get("episodeNumber", "EP. 01")
    title: str = raw_script.get("title", "JungGo Podcast Episode")
    jlpt_level: str = raw_script.get("jlptLevel", "JLPT N4")
    raw_studio_mode: str = str(raw_script.get("studioMode", "solo")).strip().lower()
    studio_mode: str = raw_studio_mode if raw_studio_mode in ("solo", "dual") else "solo"
    speech_rate: str = str(raw_script.get("speechRate", "-16%"))
    lead_in_target: float = float(raw_script.get("leadInSec", 0.45))
    outro_target: float = float(raw_script.get("outroSec", 0.75))
    micro_pause_sec: float = float(raw_script.get("sentenceMicroPauseSec", 0.45))
    raw_sections: list[dict[str, Any]] = list(raw_script.get("sections", []))
    raw_lines: list[dict[str, Any]] = list(raw_script.get("lines", []))

    if not raw_lines:
        raise ValueError("episode_script.json must contain at least one entry in 'lines'.")

    sfx_dir = audio_out_path.parent / "sfx"
    sfx_map = _generate_sfx_library(sfx_dir)
    print(f"[SFX] Generated {len(sfx_map)} procedural WAV sound effects in {sfx_dir}")

    raw_sections_by_id: dict[str, dict[str, Any]] = {
        str(sec.get("id", "")): sec for sec in raw_sections if sec.get("id")
    }

    # Step 1: Synthesize all lines concurrently via Edge-TTS
    synthesized: list[Mp3StreamInfo] = []
    pcms: list[Any] = []
    whisper_results: list[Any] = []
    parsed_lines: list[dict[str, Any]] = []
    for line in raw_lines:
        line_dict = dict(line)
        stream, (pcm, wres, sim), line_tokens = await _synthesize_and_verify_line(
            line=line_dict,
            default_rate=speech_rate,
            micro_pause_sec=micro_pause_sec,
            whisper_model=whisper_model,
        )
        line_dict["_furigana_tokens"] = line_tokens
        synthesized.append(stream)
        pcms.append(pcm)
        whisper_results.append((wres, sim))
        parsed_lines.append(line_dict)
        print(
            f"  [TTS+Whisper] {line.get('id', '?'):<7} ({line.get('speaker', '?'):<6}) "
            f"dur={stream.duration_sec:5.2f}s | match={sim * 100:5.1f}% | {wres.transcript}"
        )

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

    for idx, (line, stream, pcm, (wres, _sim)) in enumerate(
        zip(parsed_lines, synthesized, pcms, whisper_results)
    ):
        start_sec = round(cursor_sec, 3)
        combined_audio.extend(stream.frames_bytes)
        cursor_sec += stream.duration_sec
        end_sec = round(cursor_sec, 3)

        display_jp = str(line["japanese"])
        furi_tokens = line.get("_furigana_tokens") or []

        word_timings = align_word_timings(
            japanese=display_jp,
            romaji=str(line.get("romaji", "")),
            clip_start_sec=start_sec,
            clip_duration_sec=stream.duration_sec,
            pcm_16k=pcm,
            whisper_words=wres.words,
            edge_boundaries=list(stream.word_boundaries),
        )

        cue_obj: dict[str, Any] = {
            "id": line.get("id", f"sub-{idx + 1}"),
            "startSec": start_sec,
            "endSec": end_sec,
            "speaker": line.get("speaker", "Sensei"),
            "japanese": display_jp,
            "furiganaTokens": furi_tokens,
            "romaji": line.get("romaji", ""),
            "english": line.get("english", ""),
            "wordTimings": word_timings,
        }
        if line.get("ttsText"):
            cue_obj["ttsText"] = line["ttsText"]
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
        if line.get("animationScene"):
            cue_obj["animationScene"] = line["animationScene"]
        if "activeSubTopicIndex" in line:
            cue_obj["activeSubTopicIndex"] = int(line["activeSubTopicIndex"])
        if line.get("activeSubTopic"):
            cue_obj["activeSubTopic"] = line["activeSubTopic"]

        sec_id = line.get("sectionId")
        sec_def = raw_sections_by_id.get(str(sec_id or ""), {})
        sec_subtopics: list[dict[str, Any]] = list(
            (sec_def.get("stationGuide") or {}).get("subTopics")
            or sec_def.get("subTopics")
            or []
        )
        if sec_subtopics:
            cue_switches = _compute_cue_subtopic_switches(
                cue_start_sec=start_sec,
                word_timings=word_timings,
                sub_topics=sec_subtopics,
                default_index=line.get("activeSubTopicIndex"),
            )
            if cue_switches:
                cue_obj["subTopicSwitches"] = cue_switches

        subtitles.append(cue_obj)

        if sec_id:
            section_line_starts.setdefault(sec_id, []).append(start_sec)
            if sec_id not in section_spans:
                section_spans[sec_id] = [start_sec, end_sec]
            else:
                section_spans[sec_id][1] = end_sec

        if idx < len(raw_lines) - 1:
            pause_target = float(line.get("pauseSec", 0.55))
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

            station_payload: dict[str, Any] | None = (
                dict(sec["stationGuide"]) if isinstance(sec.get("stationGuide"), dict) else None
            )
            kanji_payload: dict[str, Any] | None = (
                dict(sec["kanji"]) if isinstance(sec.get("kanji"), dict) else None
            )

            sec_image_url = (
                sec.get("imageUrl")
                or sec.get("imageSrc")
                or (station_payload.get("imageUrl") if station_payload else None)
                or (kanji_payload.get("imageUrl") if kanji_payload else None)
            )
            sec_image_caption = (
                sec.get("imageCaption")
                or (station_payload.get("imageCaption") if station_payload else None)
                or (kanji_payload.get("imageCaption") if kanji_payload else None)
            )
            sec_animation_scene = (
                sec.get("animationScene")
                or (station_payload.get("animationScene") if station_payload else None)
                or (kanji_payload.get("animationScene") if kanji_payload else None)
                or (
                    sec["vocab"].get("animationScene")
                    if isinstance(sec.get("vocab"), dict)
                    else None
                )
            )

            prompt_text = str(
                sec.get("visualPrompt")
                or (station_payload.get("visualPrompt") if station_payload else "")
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

            if station_payload is not None:
                title_disp, title_toks = parse_furigana_markup(str(station_payload.get("titleJp", "")))
                station_payload["titleJp"] = title_disp
                station_payload["titleTokens"] = title_toks
                kp_disp, kp_toks = parse_furigana_markup(str(station_payload.get("keyPhraseJp", "")))
                station_payload["keyPhraseJp"] = kp_disp
                station_payload["keyPhraseTokens"] = kp_toks

                parsed_subtopics: list[dict[str, Any]] = []
                for st in station_payload.get("subTopics", []):
                    st_copy = dict(st)
                    jp_d, jp_t = parse_furigana_markup(str(st_copy.get("jp", "")))
                    ex_d, ex_t = parse_furigana_markup(str(st_copy.get("exampleJp", "")))
                    pill_d, _ = parse_furigana_markup(str(st_copy.get("pillLabel", "")))
                    st_copy["jp"] = jp_d
                    st_copy["jpTokens"] = jp_t
                    st_copy["exampleJp"] = ex_d
                    st_copy["exampleTokens"] = ex_t
                    st_copy["pillLabel"] = pill_d
                    parsed_subtopics.append(st_copy)
                if parsed_subtopics:
                    station_payload["subTopics"] = parsed_subtopics

                if sec_image_url and not station_payload.get("imageUrl"):
                    station_payload["imageUrl"] = sec_image_url
                if sec_animation_scene and not station_payload.get("animationScene"):
                    station_payload["animationScene"] = sec_animation_scene
                built_sec["stationGuide"] = station_payload

            if kanji_payload is not None:
                if sec_image_url and not kanji_payload.get("imageUrl"):
                    kanji_payload["imageUrl"] = sec_image_url
                if sec_animation_scene and not kanji_payload.get("animationScene"):
                    kanji_payload["animationScene"] = sec_animation_scene
                built_sec["kanji"] = kanji_payload

            if sec.get("imageUrl"):
                built_sec["imageUrl"] = sec["imageUrl"]
            elif sec_image_url:
                built_sec["imageUrl"] = sec_image_url
            if sec.get("imageSrc"):
                built_sec["imageSrc"] = sec["imageSrc"]
            if sec_image_caption:
                built_sec["imageCaption"] = sec_image_caption
            if sec_animation_scene:
                built_sec["animationScene"] = sec_animation_scene

            if "quiz" in sec:
                quiz = dict(sec["quiz"])
                q_disp, q_toks = parse_furigana_markup(str(quiz.get("questionJp", "")))
                quiz["questionJp"] = q_disp
                quiz["questionTokens"] = q_toks
                parsed_opts: list[dict[str, Any]] = []
                for opt in quiz.get("options", []):
                    opt_copy = dict(opt)
                    oj_disp, oj_toks = parse_furigana_markup(str(opt_copy.get("jp", "")))
                    opt_copy["jp"] = oj_disp
                    opt_copy["jpTokens"] = oj_toks
                    parsed_opts.append(opt_copy)
                quiz["options"] = parsed_opts
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

    # Build cleanly spaced procedural SFX triggers (-14dB = volume 0.20)
    sfx_events: list[dict[str, Any]] = []

    def _add_sfx(time_sec: float, kind: str, min_gap: float = 1.15) -> None:
        src = sfx_map.get(kind)
        if not src:
            return
        t_val = round(max(0.0, time_sec), 3)
        if any(abs(t_val - ev["timeSec"]) < min_gap for ev in sfx_events):
            return
        sfx_events.append({"timeSec": t_val, "kind": kind, "src": src, "volume": 0.20})

    sections_by_id: dict[str, dict[str, Any]] = {s["id"]: s for s in sections}
    for s in sections:
        anim = s.get("animationScene") or (s.get("stationGuide") or {}).get("animationScene")
        if anim == "ride_and_exit_train":
            _add_sfx(s["startSec"] + 0.05, "train_chime", min_gap=0.8)
        elif s.get("type") in ("station_guide", "dialogue") and s["startSec"] > 0.5:
            _add_sfx(s["startSec"] + 0.05, "whoosh", min_gap=0.8)
        if s.get("type") == "quiz" and isinstance(s.get("quiz"), dict):
            _add_sfx(float(s["quiz"]["revealSec"]) + 0.05, "quiz_correct", min_gap=0.5)

    for cue in subtitles:
        switches = cue.get("subTopicSwitches") or []
        cue_sec_id = ""
        for raw_ln in raw_lines:
            if raw_ln.get("id") == cue.get("id"):
                cue_sec_id = str(raw_ln.get("sectionId", ""))
                break
        sec_obj = sections_by_id.get(cue_sec_id, {})
        subtopics = (sec_obj.get("stationGuide") or {}).get("subTopics") or sec_obj.get("subTopics") or []
        for idx_sw, sw in enumerate(switches):
            t_sw = float(sw["timeSec"])
            topic_idx = int(sw["subTopicIndex"])
            hkey = str(subtopics[topic_idx].get("highlightKey", "")) if topic_idx < len(subtopics) else ""
            if hkey == "gate":
                _add_sfx(t_sw, "ic_beep", min_gap=1.2)
            elif hkey == "low_balance":
                _add_sfx(t_sw, "error_buzz", min_gap=1.2)
            elif hkey in ("adjust", "charge", "fare"):
                _add_sfx(t_sw, "coin_clink", min_gap=1.2)
            elif idx_sw > 0:
                _add_sfx(t_sw, "whoosh", min_gap=1.35)

    sfx_events.sort(key=lambda ev: ev["timeSec"])

    episode_data: dict[str, Any] = {
        "episodeNumber": episode_number,
        "title": title,
        "jlptLevel": jlpt_level,
        "studioMode": studio_mode,
        "durationSec": total_duration_sec,
        "audioSrc": "audio/current_episode.mp3",
        "sections": sections,
        "subtitles": subtitles,
        "sfxEvents": sfx_events,
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
        description="Generate slow Yukkuri Japanese edge-tts MP3 + Whisper QA synced Remotion JSON."
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
    parser.add_argument(
        "--whisper-model",
        type=str,
        default="small",
        help="faster-whisper model size (default: small).",
    )
    args = parser.parse_args()

    episode = asyncio.run(
        build_episode(
            args.script,
            args.audio_out,
            args.json_out,
            whisper_model=args.whisper_model,
        )
    )

    print(f"\nGenerated audio: {args.audio_out} ({args.audio_out.stat().st_size / 1024:.1f} KB)")
    print(f"Generated JSON : {args.json_out}")
    print(f"Total duration : {episode['durationSec']:.3f}s ({round(episode['durationSec'] * 30)} frames @ 30fps)\n")


if __name__ == "__main__":
    main()
