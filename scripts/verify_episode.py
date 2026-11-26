#!/usr/bin/env python3
"""
Standalone Automated QA Audit for JungGo Podcast Studio (`scripts/verify_episode.py`).

Checks:
1. Zero Nepali characters / keys across script & built JSON
2. Zero leaked `[...]` Furigana brackets in built display fields + complete Kanji Furigana tokens
3. Morphological & Romaji consistency (`fugashi` + `pykakasi`)
4. Blind `faster-whisper` (`language="ja"`, `word_timestamps=True`) Audio-vs-Furigana triple-check
   on every cue slice directly from `public/audio/current_episode.mp3`
5. Monotonic `wordTimings` bounds & inter-cue silence RMS verification (`RMS < 0.01`)
6. Generated SVG & procedural SFX asset presence check
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import Any

from qa_engine import (
    audit_script_morphology,
    compare_phonetics,
    compute_segment_rms,
    decode_mp3_to_pcm16k,
    find_nepali_violations,
    furigana_tokens_to_expected_kana,
    normalize_kana_phonetic,
    transcribe_clip_whisper,
)

_KANJI_RE = re.compile(r"[\u4e00-\u9faf\u3005]")


def _find_bracket_leaks(obj: Any, path: str = "episode") -> list[str]:
    """Ensures no raw `[reading]` Furigana brackets leaked into rendered episode JSON text."""
    leaks: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            leaks.extend(_find_bracket_leaks(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            leaks.extend(_find_bracket_leaks(item, f"{path}[{idx}]"))
    elif isinstance(obj, str):
        if "[" in obj or "]" in obj:
            leaks.append(f"{path}: leaked bracket in {obj!r}")
    return leaks


def _audit_furigana_tokens(
    label: str,
    display_text: str,
    tokens: Any,
) -> list[str]:
    errs: list[str] = []
    if not isinstance(tokens, list) or not tokens:
        errs.append(f"{label}: missing furigana tokens for {display_text!r}")
        return errs
    joined = "".join(str(t.get("text", "")) for t in tokens if isinstance(t, dict))
    if joined != display_text:
        errs.append(f"{label}: furigana tokens concat {joined!r} != display {display_text!r}")
    for t_idx, t in enumerate(tokens):
        txt = str(t.get("text", ""))
        furi = t.get("furigana")
        if _KANJI_RE.search(txt) and not furi:
            errs.append(f"{label}.tok[{t_idx}]({txt}): Kanji missing furigana")
        if not _KANJI_RE.search(txt) and furi is not None:
            errs.append(f"{label}.tok[{t_idx}]({txt}): non-Kanji token should have furigana=None, got {furi!r}")
    return errs


def verify_episode(
    script_path: Path,
    episode_path: Path,
    audio_path: Path,
    public_dir: Path,
    whisper_model: str = "small",
    min_phonetic_sim: float = 0.88,
    min_duration_sec: float = 420.0,
) -> int:
    raw_script = json.loads(script_path.read_text(encoding="utf-8"))
    episode = json.loads(episode_path.read_text(encoding="utf-8"))

    errors: list[str] = []

    # 1. Zero Nepali across both files
    errors.extend(find_nepali_violations(raw_script, "script"))
    errors.extend(find_nepali_violations(episode, "currentEpisode"))

    # 2. Zero leaked Furigana brackets in rendered JSON
    errors.extend(_find_bracket_leaks(episode, "currentEpisode"))

    # 3. Morphological & Romaji audit
    errors.extend(audit_script_morphology(raw_script))

    # 4. Verify generated SVGs, subTopic Furigana tokens, and SFX WAV files exist
    for sec in episode.get("sections", []):
        img = sec.get("imageUrl") or (sec.get("stationGuide") or {}).get("imageUrl")
        if img and not img.startswith("http"):
            svg_path = public_dir / img
            if not svg_path.exists():
                errors.append(f"Missing visual asset for {sec.get('id')}: {svg_path}")
        sg = sec.get("stationGuide") or {}
        for st_idx, st in enumerate(sg.get("subTopics", [])):
            errors.extend(
                _audit_furigana_tokens(
                    f"{sec.get('id')}.subTopics[{st_idx}].jp",
                    str(st.get("jp", "")),
                    st.get("jpTokens"),
                )
            )
            errors.extend(
                _audit_furigana_tokens(
                    f"{sec.get('id')}.subTopics[{st_idx}].exampleJp",
                    str(st.get("exampleJp", "")),
                    st.get("exampleTokens"),
                )
            )

    for ev in episode.get("sfxEvents", []):
        sfx_path = public_dir / str(ev.get("src", ""))
        if not sfx_path.exists():
            errors.append(f"Missing SFX asset: {sfx_path}")

    # 4b. Check 3: Duration >= 420s, 1:1 visual scene mapping, all 8 SFX WAVs & 5s quiz sync
    duration_sec = float(episode.get("durationSec", 0.0))
    if min_duration_sec > 0 and duration_sec < min_duration_sec:
        errors.append(f"Episode duration {duration_sec:.2f}s < minimum {min_duration_sec:.2f}s")

    for req_sfx in (
        "whoosh.wav",
        "ic_beep.wav",
        "coin_clink.wav",
        "error_buzz.wav",
        "train_chime.wav",
        "quiz_correct.wav",
        "timer_tick.wav",
        "timer_urgent.wav",
    ):
        req_path = public_dir / "audio" / "sfx" / req_sfx
        if not req_path.exists():
            errors.append(f"Missing required SFX library file: {req_path}")

    sfx_events = episode.get("sfxEvents", [])
    for sec in episode.get("sections", []):
        sid = str(sec.get("id", "?"))
        stype = str(sec.get("type", ""))
        if stype in ("station_guide", "dialogue"):
            anim = sec.get("animationScene") or (sec.get("stationGuide") or {}).get("animationScene")
            if not anim:
                errors.append(f"{sid}: missing animationScene for {stype}")
        if stype == "quiz":
            q = sec.get("quiz") or {}
            opts = q.get("options") or []
            if len(opts) != 4:
                errors.append(f"{sid}: expected 4 quiz options A/B/C/D, got {len(opts)}")
            cd_dur = float(q.get("countdownDurationSec", 0.0))
            cd_start = float(q.get("countdownStartSec", 0.0))
            rev_sec = float(q.get("revealSec", 0.0))
            if abs(cd_dur - 5.0) > 0.05:
                errors.append(f"{sid}: quiz countdownDurationSec={cd_dur} != 5.0")
            if rev_sec < cd_start + 4.9:
                errors.append(f"{sid}: revealSec={rev_sec} < countdownStartSec+4.9 ({cd_start + 4.9:.2f})")
            s_start = float(sec.get("startSec", 0.0))
            s_end = float(sec.get("endSec", 0.0))
            sec_sfx = [ev for ev in sfx_events if s_start - 0.1 <= float(ev.get("timeSec", -1)) <= s_end + 0.1]
            tick_cnt = sum(1 for ev in sec_sfx if ev.get("kind") == "timer_tick")
            urg_cnt = sum(1 for ev in sec_sfx if ev.get("kind") == "timer_urgent")
            rev_cnt = sum(1 for ev in sec_sfx if ev.get("kind") == "quiz_correct")
            if tick_cnt < 4 or urg_cnt < 1 or rev_cnt < 1:
                errors.append(
                    f"{sid}: quiz SFX incomplete (timer_tick={tick_cnt}, timer_urgent={urg_cnt}, quiz_correct={rev_cnt})"
                )

    # 5. Load final MP3 PCM & run blind Whisper Audio-vs-Furigana triple-check + RMS silence check
    pcm = decode_mp3_to_pcm16k(audio_path)
    subtitles = episode.get("subtitles", [])
    sr = 16000

    print("\n================ JUNGGO AUDIO-VS-FURIGANA WHISPER QA REPORT ================")
    print(
        f"Episode : {episode.get('episodeNumber')} — {episode.get('title')} ({episode.get('jlptLevel')})"
    )
    print(f"Duration: {episode.get('durationSec')}s | Cues: {len(subtitles)} | Model: {whisper_model}")
    print("-" * 86)
    print(
        f"{'ID':<7} {'Spk':<7} {'Span':<13} {'Words':>5} {'TTS%':>7} {'Furi%':>7} {'GapRMS':>8}  Status & Whisper ASR"
    )
    print("-" * 86)

    for idx, cue in enumerate(subtitles):
        cid = cue["id"]
        spk = cue["speaker"]
        s_sec = float(cue["startSec"])
        e_sec = float(cue["endSec"])
        expected_tts = str(cue.get("ttsText") or cue["japanese"])
        furi_tokens = cue.get("furiganaTokens")

        errors.extend(_audit_furigana_tokens(f"{cid}.japanese", str(cue.get("japanese", "")), furi_tokens))

        i0 = max(0, int(round(s_sec * sr)))
        i1 = min(len(pcm), int(round(e_sec * sr)))
        clip_pcm = pcm[i0:i1]
        wres = transcribe_clip_whisper(clip_pcm, model_size=whisper_model)
        sim = compare_phonetics(expected_tts, wres.transcript)

        # Direct Audio-vs-Furigana verification
        exp_furi_kana = (
            furigana_tokens_to_expected_kana(furi_tokens)
            if isinstance(furi_tokens, list) and furi_tokens
            else ""
        )
        obs_kana = normalize_kana_phonetic(wres.kana)
        furi_sim = (
            difflib.SequenceMatcher(None, exp_furi_kana, obs_kana).ratio()
            if exp_furi_kana and obs_kana
            else 0.0
        )

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

        ok = (
            sim >= min_phonetic_sim
            and furi_sim >= min_phonetic_sim
            and (idx == len(subtitles) - 1 or gap_rms < 0.01)
        )
        if sim < min_phonetic_sim:
            errors.append(
                f"{cid}: Whisper phonetic match {sim:.2%} < {min_phonetic_sim:.0%} "
                f"(expected={expected_tts!r}, heard={wres.transcript!r})"
            )
        if furi_sim < min_phonetic_sim:
            errors.append(
                f"{cid}: Audio-vs-Furigana match {furi_sim:.2%} < {min_phonetic_sim:.0%} "
                f"(furigana_kana={exp_furi_kana!r}, heard_kana={obs_kana!r})"
            )

        status_str = "PASS" if ok else "FAIL"
        print(
            f"{cid:<7} {spk:<7} {s_sec:5.2f}-{e_sec:5.2f}s {len(wt):>5} "
            f"{sim*100:6.1f}% {furi_sim*100:6.1f}% {gap_rms:8.4f}  [{status_str}] {wres.transcript}"
        )

    print("-" * 86)
    print(f"TOTAL FURIGANA / PRONUNCIATION / TIMING ERRORS: {len(errors)}")
    if errors:
        print("\nERROR DETAILS:")
        for err in errors:
            print(f"  * {err}")
    else:
        print("ALL FURIGANA & AUDIO CHECKS PASSED CLEANLY WITH 0 ERRORS.")
    print("=" * 86 + "\n")
    return 0 if not errors else 1


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Verify built episode audio & Furigana JSON against Japanese linguistic & Whisper ASR checks."
    )
    parser.add_argument("--script", type=Path, default=root / "scripts" / "episode_script.json")
    parser.add_argument("--episode", type=Path, default=root / "src" / "data" / "currentEpisode.json")
    parser.add_argument("--audio", type=Path, default=root / "public" / "audio" / "current_episode.mp3")
    parser.add_argument("--public", type=Path, default=root / "public")
    parser.add_argument("--whisper-model", type=str, default="small")
    parser.add_argument("--min-duration-sec", type=float, default=420.0)
    args = parser.parse_args()

    code = verify_episode(
        script_path=args.script,
        episode_path=args.episode,
        audio_path=args.audio,
        public_dir=args.public,
        whisper_model=args.whisper_model,
        min_duration_sec=args.min_duration_sec,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
