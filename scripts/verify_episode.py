#!/usr/bin/env python3
"""
Standalone Automated QA Audit for JungGo Podcast Studio (`scripts/verify_episode.py`).

Checks:
1. Zero Nepali characters / keys across script & built JSON
2. Morphological & Romaji consistency (`fugashi` + `pykakasi`)
3. Blind `faster-whisper` (`language="ja"`, `word_timestamps=True`) back-transcription
   on every cue slice directly from the combined `public/audio/current_episode.mp3`
4. Monotonic `wordTimings` bounds & inter-cue silence RMS verification (`RMS < 0.01`)
5. Generated SVG asset presence check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from qa_engine import (
    audit_script_morphology,
    compare_phonetics,
    compute_segment_rms,
    decode_mp3_to_pcm16k,
    find_nepali_violations,
    transcribe_clip_whisper,
)


def verify_episode(
    script_path: Path,
    episode_path: Path,
    audio_path: Path,
    public_dir: Path,
    whisper_model: str = "small",
    min_phonetic_sim: float = 0.88,
) -> int:
    raw_script = json.loads(script_path.read_text(encoding="utf-8"))
    episode = json.loads(episode_path.read_text(encoding="utf-8"))

    errors: list[str] = []

    # 1. Zero Nepali across both files
    errors.extend(find_nepali_violations(raw_script, "script"))
    errors.extend(find_nepali_violations(episode, "currentEpisode"))

    # 2. Morphological & Romaji audit
    errors.extend(audit_script_morphology(raw_script))

    # 3. Verify generated SVGs exist
    for sec in episode.get("sections", []):
        img = sec.get("imageUrl") or (sec.get("stationGuide") or {}).get("imageUrl")
        if img and not img.startswith("http"):
            svg_path = public_dir / img
            if not svg_path.exists():
                errors.append(f"Missing visual asset for {sec.get('id')}: {svg_path}")

    # 4. Load final MP3 PCM & run blind Whisper back-transcription + RMS silence checks
    pcm = decode_mp3_to_pcm16k(audio_path)
    subtitles = episode.get("subtitles", [])
    sr = 16000

    print("\n================ JUNGGO EPISODE WHISPER QA AUDIT SUMMARY ================")
    print(
        f"Episode : {episode.get('episodeNumber')} — {episode.get('title')} ({episode.get('jlptLevel')})"
    )
    print(f"Duration: {episode.get('durationSec')}s | Cues: {len(subtitles)} | Model: {whisper_model}")
    print("-" * 74)
    print(f"{'ID':<7} {'Spk':<7} {'Span':<14} {'Words':>5} {'Match':>7} {'GapRMS':>8}  Status & Whisper ASR")
    print("-" * 74)

    for idx, cue in enumerate(subtitles):
        cid = cue["id"]
        spk = cue["speaker"]
        s_sec = float(cue["startSec"])
        e_sec = float(cue["endSec"])
        expected_tts = str(cue.get("ttsText") or cue["japanese"])

        i0 = max(0, int(round(s_sec * sr)))
        i1 = min(len(pcm), int(round(e_sec * sr)))
        clip_pcm = pcm[i0:i1]
        wres = transcribe_clip_whisper(clip_pcm, model_size=whisper_model)
        sim = compare_phonetics(expected_tts, wres.transcript)

        # Check wordTimings monotonic & valid bounds
        wt = cue.get("wordTimings") or []
        if not wt:
            errors.append(f"{cid}: missing wordTimings array")
        prev_e = s_sec
        for w_idx, w in enumerate(wt):
            ws = float(w["startSec"])
            we = float(w["endSec"])
            if ws < s_sec - 0.005 or we > e_sec + 0.005 or ws > we or ws + 0.005 < prev_e:
                errors.append(
                    f"{cid}.word[{w_idx}]({w.get('word')}): invalid bounds [{ws:.3f}, {we:.3f}] inside [{s_sec:.3f}, {e_sec:.3f}]"
                )
            prev_e = max(prev_e, we)

        # Check inter-cue pause RMS (excluding last cue)
        gap_rms = 0.0
        if idx < len(subtitles) - 1:
            next_s = float(subtitles[idx + 1]["startSec"])
            if next_s - e_sec >= 0.15:
                gap_rms = compute_segment_rms(pcm, e_sec + 0.04, next_s - 0.04, sr=sr)
                if gap_rms >= 0.01:
                    errors.append(
                        f"{cid}->next pause [{e_sec:.2f}s..{next_s:.2f}s] is NOT silent (RMS={gap_rms:.4f})"
                    )

        ok = sim >= min_phonetic_sim and (idx == len(subtitles) - 1 or gap_rms < 0.01)
        if sim < min_phonetic_sim:
            errors.append(
                f"{cid}: Whisper phonetic match {sim:.2%} < {min_phonetic_sim:.0%} "
                f"(expected={expected_tts!r}, heard={wres.transcript!r})"
            )

        status_str = "PASS" if ok else "FAIL"
        print(
            f"{cid:<7} {spk:<7} {s_sec:5.2f}-{e_sec:5.2f}s {len(wt):>5} {sim*100:6.1f}% "
            f"{gap_rms:8.4f}  [{status_str}] {wres.transcript}"
        )

    print("-" * 74)
    print(f"TOTAL PRONUNCIATION / READING / TIMING ERRORS: {len(errors)}")
    if errors:
        print("\nERROR DETAILS:")
        for err in errors:
            print(f"  * {err}")
    else:
        print("ALL QA CHECKS PASSED CLEANLY WITH 0 ERRORS.")
    print("=" * 74 + "\n")
    return 0 if not errors else 1


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Verify built episode audio & JSON against Japanese linguistic & Whisper ASR checks.")
    parser.add_argument("--script", type=Path, default=root / "scripts" / "episode_script.json")
    parser.add_argument("--episode", type=Path, default=root / "src" / "data" / "currentEpisode.json")
    parser.add_argument("--audio", type=Path, default=root / "public" / "audio" / "current_episode.mp3")
    parser.add_argument("--public", type=Path, default=root / "public")
    parser.add_argument("--whisper-model", type=str, default="small")
    args = parser.parse_args()

    code = verify_episode(
        script_path=args.script,
        episode_path=args.episode,
        audio_path=args.audio,
        public_dir=args.public,
        whisper_model=args.whisper_model,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
