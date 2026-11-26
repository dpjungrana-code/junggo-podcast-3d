#!/usr/bin/env python3
"""
Shared Japanese Morphological, Phonetic, Whisper ASR & Word-Alignment QA Engine
for JungGo Podcast Studio.

Provides:
- Zero-Nepali / zero-Devanagari enforcement across episode scripts & outputs
- Dictionary-grounded morphological & Romaji verification (`fugashi` + `pykakasi`)
- Audio decoding to 16kHz mono PCM (`ffmpeg` / macOS `afconvert` / `av`) & RMS metrics
- Blind `faster-whisper` (`language="ja"`, `word_timestamps=True`) pronunciation checks
- Monotonic acoustic word-timing projection for real-time Karaoke & lip-sync gating
"""

from __future__ import annotations

import difflib
import re
import shutil
import subprocess
import tempfile
import unicodedata
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fugashi
import numpy as np
import pykakasi

ROOT_DIR = Path(__file__).resolve().parent.parent

# Official JR East / Tokyo Metro / MLIT railway readings & script compound overrides
STATION_READING_OVERRIDES: dict[str, tuple[str, str]] = {
    "各駅停車": ("かくえきていしゃ", "kakueki teisha"),
    "乗り過ごして": ("のりすごして", "norisugoshite"),
    "乗り過ごした": ("のりすごした", "norisugoshita"),
    "乗り過ごしたら": ("のりすごしたら", "norisugoshitara"),
    "残高不足": ("ざんだかぶそく", "zandaka busoku"),
    "乗り換え": ("のりかえ", "norikae"),
    "ポッドキャスト": ("ぽっどきゃすと", "poddokyasuto"),
    "ロールプレイ": ("ろーるぷれい", "roorupurei"),
    "サバイバル": ("さばいばる", "sabaibaru"),
    "出口案内": ("でぐちあんない", "deguchi annai"),
    "精算機": ("せいさんき", "seisanki"),
    "券売機": ("けんばいき", "kenbaiki"),
    "改札口": ("かいさつぐち", "kaisatsuguchi"),
    "東京駅": ("とうきょうえき", "toukyou-eki"),
    "特急券": ("とっきゅうけん", "tokkyuuken"),
    "第一問": ("だいいちもん", "daiichimon"),
    "第1問": ("だいいちもん", "daiichimon"),
    "第二問": ("だいにもん", "dainimon"),
    "第2問": ("だいにもん", "dainimon"),
    "何番線": ("なんばんせん", "nanbansen"),
    "三番線": ("さんばんせん", "sanbansen"),
    "一番線": ("いちばんせん", "ichibansen"),
    "3番線": ("さんばんせん", "sanbansen"),
    "1番線": ("いちばんせん", "ichibansen"),
    "JungGo": ("じゅんご", "junggo"),
    "PASMO": ("ぱすも", "pasmo"),
    "Suica": ("すいか", "suica"),
    "北口": ("きたぐち", "kitaguchi"),
    "南口": ("みなみぐち", "minamiguchi"),
    "東口": ("ひがしぐち", "higashiguchi"),
    "西口": ("にしぐち", "nishiguchi"),
    "入口": ("いりぐち", "iriguchi"),
    "出口": ("でぐち", "deguchi"),
    "運賃": ("うんちん", "unchin"),
    "片道": ("かたみち", "katamichi"),
    "往復": ("おうふく", "oufuku"),
    "終電": ("しゅうでん", "shuuden"),
    "駅員": ("えきいん", "ekiin"),
    "新宿": ("しんじゅく", "shinjuku"),
    "快速": ("かいそく", "kaisoku"),
    "急行": ("きゅうこう", "kyuukou"),
    "特急": ("とっきゅう", "tokkyuu"),
    "案内": ("あんない", "annai"),
    "方角": ("ほうがく", "hougaku"),
    "種類": ("しゅるい", "shurui"),
    "N4": ("えぬよん", "n4"),
    "N3": ("えぬさん", "n3"),
    "点字ブロック": ("てんじぶろっく", "tenji burokku"),
    "優先席": ("ゆうせんせき", "yuusenseki"),
    "マナーモード": ("まなーもーど", "manaa moodo"),
    "新宿駅": ("しんじゅくえき", "shinjuku-eki"),
    "二番線": ("にばんせん", "nibansen"),
    "2番線": ("にばんせん", "nibansen"),
    "三番線": ("さんばんせん", "sanbansen"),
    "3番線": ("さんばんせん", "sanbansen"),
    "200": ("にひゃく", "nihyaku"),
    "5秒": ("ごびょう", "gobyou"),
    "第三問": ("だいさんもん", "daisanmon"),
    "第3問": ("だいさんもん", "daisanmon"),
    "第四問": ("だいよんもん", "daiyonmon"),
    "第4問": ("だいよんもん", "daiyonmon"),
    "黄色い": ("きいろい", "kiiroi"),
    "スマートフォン": ("すまーとふぉん", "sumaatofon"),
    "スマホ": ("すまほ", "sumaho"),
    "携帯電話": ("けいたいでんわ", "keitai denwa"),
    "通話": ("つうわ", "tsuuwa"),
    "自販機": ("じはんき", "jihanki"),
    "じはんき": ("ジハンキ", "jihanki"),
}

_SORTED_OVERRIDES = sorted(
    STATION_READING_OVERRIDES.items(),
    key=lambda kv: len(kv[0]),
    reverse=True,
)

# Multi-morpheme compound words kept together when highlighting Karaoke tokens
COMPOUND_WORD_CHUNKS: tuple[str, ...] = (
    "すみません",
    "ありがとうございます",
    "ございました",
    "しまいました",
    "ポッドキャスト",
    "ロールプレイ",
    "サバイバル",
    "いらっしゃい",
    "みてください",
    "見てください",
    "乗り過ごして",
    "乗り過ごした",
    "乗り過ごしたら",
    "各駅停車",
    "残高不足",
    "出口案内",
    "乗り換え",
    "精算機",
    "券売機",
    "改札口",
    "東京駅",
    "特急券",
    "第一問",
    "第二問",
    "何番線",
    "三番線",
    "一番線",
    "3番線",
    "1番線",
    "北口",
    "南口",
    "東口",
    "西口",
    "入口",
    "出口",
    "運賃",
    "片道",
    "往復",
    "終電",
    "駅員",
    "新宿",
    "快速",
    "急行",
    "特急",
    "案内",
    "方角",
    "種類",
    "JungGo",
    "PASMO",
    "Suica",
    "チャージ",
    "チェック",
    "タッチ",
    "カード",
    "ボード",
    "ホーム",
    "クイズ",
    "N4",
    "N3",
    "点字ブロック",
    "優先席",
    "マナーモード",
    "新宿駅",
    "二番線",
    "2番線",
    "三番線",
    "3番線",
    "第三問",
    "第3問",
    "第四問",
    "第4問",
    "黄色い",
    "スマートフォン",
    "スマホ",
    "携帯電話",
    "通話",
    "自販機",
)

_PUNCTUATION_RE = re.compile(r'^[\s「」『』、。！？!?…・（）()【】「」"“”\',.\-]+$')
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_KANJI_RE = re.compile(r"[\u4e00-\u9faf\u3005]")
_FURIGANA_BRACKET_RE = re.compile(r"\[([^\[\]]+)\]")


def _is_kanji_char(ch: str) -> bool:
    return bool(_KANJI_RE.match(ch))


def _is_hiragana_char(ch: str) -> bool:
    code = ord(ch)
    return 0x3041 <= code <= 0x309F


def _is_digit_char(ch: str) -> bool:
    return ch.isdigit()


def _find_explicit_base_start(prefix: str, reading_hira: str) -> int:
    """
    Finds the start index in `prefix` of the Japanese word annotated by `[reading_hira]`.
    Handles Kanji compounds (`改札口`), counters (`3番線`), and okurigana verbs (`行く`, `乗り換え`).
    """
    if not prefix:
        return 0
    idx = len(prefix)
    rem = reading_hira

    # Case A: trailing okurigana matching the tail of `[reading_hira]` (e.g., 行く[いく], 乗り換え[のりかえ])
    trailing_hira_start = idx
    while trailing_hira_start > 0 and _is_hiragana_char(prefix[trailing_hira_start - 1]):
        ch = prefix[trailing_hira_start - 1]
        if len(rem) > 1 and rem.endswith(ch):
            trailing_hira_start -= 1
            rem = rem[:-1]
        else:
            break

    # Only accept trailing hiragana as okurigana if a Kanji immediately precedes it
    if trailing_hira_start < idx and trailing_hira_start > 0 and _is_kanji_char(prefix[trailing_hira_start - 1]):
        idx = trailing_hira_start
    elif not _is_kanji_char(prefix[idx - 1]) and not (idx >= 2 and _is_digit_char(prefix[idx - 1])):
        #Fallback: consume backward until whitespace/punctuation/kanji
        return max(0, idx - 1)

    # Walk backward across contiguous Kanji / digits / compound-internal okurigana (like `り` in 乗り換え)
    while idx > 0:
        ch = prefix[idx - 1]
        if _is_kanji_char(ch):
            idx -= 1
            continue
        if ch in ("ヶ", "ヵ") and idx >= 2 and _is_kanji_char(prefix[idx - 2]):
            idx -= 1
            continue
        if _is_digit_char(ch):
            # Include numeric counters attached immediately before Kanji (e.g. `1番線`, `3番線`)
            if idx < len(prefix) and _is_kanji_char(prefix[idx]):
                idx -= 1
                continue
            if idx < len(prefix) and _is_digit_char(prefix[idx]):
                idx -= 1
                continue
            break
        if _is_hiragana_char(ch) and idx >= 2 and _is_kanji_char(prefix[idx - 2]) and ch in rem[:-1]:
            idx -= 1
            continue
        break

    return idx


def _tokenize_fallback_furigana(span: str) -> list[dict[str, str | None]]:
    """
    Priority 2 Fallback (`fugashi` + `unidic-lite` + station overrides):
    Resolves context-aware Hiragana readings ONLY for unbracketed Kanji tokens,
    keeping `furigana: None` on all pure Hiragana, Katakana, ASCII, and punctuation.
    """
    if not span:
        return []

    tagger = _get_tagger()
    kks = _get_kakasi()
    tokens: list[dict[str, str | None]] = []
    pos = 0
    n = len(span)

    while pos < n:
        # Check exact station compound override at current position first if it contains Kanji
        matched_surf: str | None = None
        matched_kana: str | None = None
        for surf, (kana, _) in _SORTED_OVERRIDES:
            if _KANJI_RE.search(surf) and span.startswith(surf, pos):
                matched_surf = surf
                matched_kana = kana
                break
        if matched_surf is not None and matched_kana is not None:
            tokens.append({"text": matched_surf, "furigana": matched_kana})
            pos += len(matched_surf)
            continue

        # Advance until next compound override or end of span
        next_override = n
        for surf, _ in _SORTED_OVERRIDES:
            if _KANJI_RE.search(surf):
                found = span.find(surf, pos + 1)
                if found != -1 and found < next_override:
                    next_override = found

        chunk = span[pos:next_override]
        cursor = 0
        for tok in tagger(chunk):
            surf = tok.surface
            found_i = chunk.find(surf, cursor)
            if found_i > cursor:
                # Preserve exact whitespace / unmatched chars
                tokens.append({"text": chunk[cursor:found_i], "furigana": None})
            cursor = (found_i if found_i >= 0 else cursor) + len(surf)

            if not _KANJI_RE.search(surf):
                tokens.append({"text": surf, "furigana": None})
            else:
                pron = getattr(tok.feature, "kana", None) or getattr(tok.feature, "pron", None)
                if pron and pron != "*":
                    hira = katakana_to_hiragana(pron)
                else:
                    hira = "".join(item.get("hira", item.get("orig", "")) for item in kks.convert(surf))
                tokens.append({"text": surf, "furigana": hira or surf})

        if cursor < len(chunk):
            tokens.append({"text": chunk[cursor:], "furigana": None})
        pos = next_override

    return tokens


def strip_furigana_brackets(raw_text: str) -> str:
    """Removes inline `[reading]` brackets to produce clean Japanese display text."""
    return _FURIGANA_BRACKET_RE.sub("", raw_text)


def parse_furigana_markup(raw_text: str) -> tuple[str, list[dict[str, str | None]]]:
    """
    Hybrid Explicit-First Furigana Parser:
    - Priority 1: Explicit `漢字[ふりがな]` markup becomes `{ "text": 漢字, "furigana": ふりがな }`.
    - Priority 2: Unbracketed spans resolve Kanji readings via `fugashi` (`unidic-lite`) +
      station overrides, keeping `furigana: None` for Hiragana, Katakana, ASCII, and punctuation.
    Returns `(display_text, tokens)` with `"".join(t["text"] for t in tokens) == display_text`.
    """
    if not raw_text:
        return "", []

    tokens: list[dict[str, str | None]] = []
    pos = 0
    n = len(raw_text)

    while pos < n:
        match = _FURIGANA_BRACKET_RE.search(raw_text, pos)
        if match is None:
            tokens.extend(_tokenize_fallback_furigana(raw_text[pos:]))
            break

        before = raw_text[pos:match.start()]
        reading_hira = katakana_to_hiragana(match.group(1).strip())
        base_start = _find_explicit_base_start(before, reading_hira)

        unmarked_prefix = before[:base_start]
        base_text = before[base_start:]
        if unmarked_prefix:
            tokens.extend(_tokenize_fallback_furigana(unmarked_prefix))
        if base_text:
            tokens.append({"text": base_text, "furigana": reading_hira})
        pos = match.end()

    # Merge consecutive `furigana: None` tokens for cleaner DOM nodes
    merged: list[dict[str, str | None]] = []
    for tok in tokens:
        if (
            merged
            and merged[-1]["furigana"] is None
            and tok["furigana"] is None
        ):
            merged[-1]["text"] = str(merged[-1]["text"]) + str(tok["text"])
        elif tok["text"]:
            merged.append(tok)

    display_text = "".join(str(t["text"]) for t in merged)
    return display_text, merged


def furigana_tokens_to_tts_text(tokens: list[dict[str, str | None]]) -> str:
    """
    Builds exact `ttsText` from Furigana tokens so `edge-tts` speaks EVERY bracketed
    Kanji/counter using its authoritative explicit reading.
    """
    parts: list[str] = []
    for tok in tokens:
        if tok.get("furigana"):
            parts.append(str(tok["furigana"]))
        else:
            txt = str(tok.get("text", ""))
            txt = (
                txt.replace("JungGo", "ジュンゴ")
                .replace("PASMO", "パスモ")
                .replace("Suica", "スイカ")
                .replace("N4", "エヌよん")
                .replace("N3", "エヌさん")
            )
            txt = re.sub(r"(?<![A-Za-z])A(?![A-Za-z])", "エー", txt)
            txt = re.sub(r"(?<![A-Za-z])B(?![A-Za-z])", "ビー", txt)
            txt = re.sub(r"(?<![A-Za-z])C(?![A-Za-z])", "しー", txt)
            txt = re.sub(r"(?<![A-Za-z])D(?![A-Za-z])", "ディー", txt)
            parts.append(txt)
    return "".join(parts)


def furigana_tokens_to_expected_kana(tokens: list[dict[str, str | None]]) -> str:
    """
    Converts `{text, furigana}` display tokens directly into normalized Hiragana
    phonetics for Whisper Audio-vs-Furigana triple-check verification.
    """
    parts: list[str] = []
    for tok in tokens:
        if tok.get("furigana"):
            parts.append(str(tok["furigana"]))
        else:
            parts.append(japanese_to_spoken_kana(str(tok.get("text", ""))))
    return normalize_kana_phonetic("".join(parts))

_TAGGER: fugashi.Tagger | None = None
_KAKASI: pykakasi.Kakasi | None = None
_WHISPER_MODELS: dict[str, Any] = {}


def _get_tagger() -> fugashi.Tagger:
    global _TAGGER
    if _TAGGER is None:
        _TAGGER = fugashi.Tagger()
    return _TAGGER


def _get_kakasi() -> pykakasi.Kakasi:
    global _KAKASI
    if _KAKASI is None:
        _KAKASI = pykakasi.kakasi()
    return _KAKASI


def get_whisper_model(model_size: str = "small") -> Any:
    """Lazy-loads and caches faster-whisper model on CPU int8."""
    if model_size not in _WHISPER_MODELS:
        from faster_whisper import WhisperModel

        _WHISPER_MODELS[model_size] = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
        )
    return _WHISPER_MODELS[model_size]


def find_nepali_violations(obj: Any, path: str = "root") -> list[str]:
    """Recursively checks JSON data for any Devanagari text or `meaningNp` keys."""
    violations: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "meaningNp" and v:
                violations.append(f"{path}.{k}: deprecated Nepali field must be removed")
            violations.extend(find_nepali_violations(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            violations.extend(find_nepali_violations(item, f"{path}[{idx}]"))
    elif isinstance(obj, str):
        if _DEVANAGARI_RE.search(obj):
            violations.append(f"{path}: contains Devanagari text {obj!r}")
    return violations


def katakana_to_hiragana(text: str) -> str:
    """Converts katakana characters to hiragana while preserving other glyphs."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def _expand_long_vowels(hiragana: str) -> str:
    """Expands `ー` to the matching vowel kana so ASR/TTS comparisons align."""
    a_row = set("あかさたなはまやらわがざだばぱぁゃ")
    i_row = set("いきしちにひみりゐぎじぢびぴぃ")
    u_row = set("うくすつぬふむゆるぐずづぶぷぅゅゔ")
    e_row = set("えけせてねへめれゑげぜでべぺぇ")
    o_row = set("おこそとのほもよろをごぞどぼぽぉょ")

    out: list[str] = []
    for ch in hiragana:
        if ch == "ー" and out:
            prev = out[-1]
            if prev in a_row:
                out.append("あ")
            elif prev in i_row:
                out.append("い")
            elif prev in u_row:
                out.append("う")
            elif prev in e_row:
                out.append("い")
            elif prev in o_row:
                out.append("う")
        else:
            out.append(ch)
    return "".join(out)


def normalize_kana_phonetic(text: str) -> str:
    """Normalizes spoken Japanese kana for robust phonetic comparison."""
    h = katakana_to_hiragana(text)
    h = _expand_long_vowels(h)
    h = h.replace("づ", "ず").replace("ぢ", "じ")
    # Strip punctuation and whitespace
    h = re.sub(r"[\s\W_]+", "", h)
    # Collapse common TTS/ASR vowel-elongation variance (`えい` vs `ええ`)
    h = h.replace("えい", "ええ")
    return h


def _apply_reading_overrides(text: str) -> str:
    """Replaces railway compounds and station acronyms with canonical spoken kana."""
    out = text
    for surf, (kana, _) in _SORTED_OVERRIDES:
        if surf in out:
            out = out.replace(surf, kana)
    out = re.sub(r"(?<![A-Za-z])[Aa](?![A-Za-z])", "えー", out)
    out = re.sub(r"(?<![A-Za-z])[Bb](?![A-Za-z])", "びー", out)
    out = re.sub(r"(?<![A-Za-z])[Cc](?![A-Za-z])", "しー", out)
    out = re.sub(r"(?<![A-Za-z])[Dd](?![A-Za-z])", "でぃー", out)
    return out


def japanese_to_spoken_kana(text: str) -> str:
    """
    Converts Japanese text (including kanji, numbers, and railway terms) into
    clean spoken hiragana using railway overrides + UniDic (`fugashi`) + `pykakasi`.
    """
    if not text.strip():
        return ""
    overridden = _apply_reading_overrides(text)
    tagger = _get_tagger()
    kks = _get_kakasi()

    kana_parts: list[str] = []
    for tok in tagger(overridden):
        surf = tok.surface
        if _PUNCTUATION_RE.match(surf):
            continue
        pos1 = getattr(tok.feature, "pos1", "") or ""
        pron = getattr(tok.feature, "pron", None) or getattr(tok.feature, "kana", None)
        if pron and pron != "*":
            part = katakana_to_hiragana(pron)
        else:
            # pykakasi fallback
            part = "".join(item.get("hira", item.get("orig", "")) for item in kks.convert(surf))
        # Ensure spoken particles は/へ/を map to わ/え/お
        if pos1 == "助詞":
            if surf == "は":
                part = "わ"
            elif surf == "へ":
                part = "え"
            elif surf == "を":
                part = "お"
        kana_parts.append(part)

    return "".join(kana_parts)


def japanese_to_romaji(text: str) -> str:
    """Converts Japanese text to lowercase Hepburn Romaji using overrides + UniDic."""
    spoken_kana = japanese_to_spoken_kana(text)
    if not spoken_kana:
        return ""
    # Since particles は/へ/を are already normalized to わ/え/お, convert hiragana to katakana
    # so pykakasi does not misread syllable は inside pure-kana words as particle 'wa'.
    kata_spoken = "".join(
        chr(ord(ch) + 0x60) if "\u3041" <= ch <= "\u3096" else ch for ch in spoken_kana
    )
    kks = _get_kakasi()
    raw = "".join(item.get("hepburn", item.get("orig", "")) for item in kks.convert(kata_spoken))
    return raw.lower()


def normalize_romaji_compare(text: str) -> str:
    """
    Normalizes Hepburn Romaji for morphological accuracy checks so punctuation,
    spacing, and valid transcription variants match while typos still fail loudly.
    """
    s = unicodedata.normalize("NFKC", text).lower()
    # Apply Latin script terms before stripping non-letters
    s = re.sub(r"\bjunggo\b", "jungo", s)
    s = re.sub(r"\bn4\b", "enuyon", s)
    s = re.sub(r"\bn3\b", "enusan", s)
    s = re.sub(r"\ba\b", "ee", s)
    s = re.sub(r"\bb\b", "bii", s)
    s = re.sub(r"\bc\b", "shii", s)
    s = re.sub(r"\bd\b", "dii", s)
    s = s.replace("ō", "ou").replace("ū", "uu").replace("ā", "aa").replace("ī", "ii").replace("ē", "ee")
    # Remove spaces, hyphens, quotes, punctuation
    s = re.sub(r"[^a-z0-9]", "", s)
    # Harmonize valid Hepburn variants (`du`/`dzu` -> `zu`, `ei`/`eei`/`ee` -> `ee`, `oo` -> `ou`)
    s = s.replace("dzu", "zu").replace("du", "zu").replace("n'", "n")
    s = s.replace("eei", "ee").replace("ei", "ee").replace("oo", "ou")
    return s


def compare_phonetics(expected_jp_or_kana: str, observed_jp_or_kana: str) -> float:
    """Computes phonetic similarity [0..1] in normalized hiragana space."""
    exp_kana = normalize_kana_phonetic(japanese_to_spoken_kana(expected_jp_or_kana))
    obs_kana = normalize_kana_phonetic(japanese_to_spoken_kana(observed_jp_or_kana))
    if not exp_kana or not obs_kana:
        return 0.0
    return difflib.SequenceMatcher(None, exp_kana, obs_kana).ratio()


def audit_script_morphology(raw_script: dict[str, Any]) -> list[str]:
    """
    Triple-checks:
    1. Zero Nepali characters / keys anywhere
    2. `japanese` vs `ttsText` phonetic equivalence
    3. `japanese` vs `romaji` dictionary similarity
    4. Station terms (`jp`, `reading`, `romaji`) and quiz options (`jp`, `romaji`)
    """
    errors: list[str] = []
    errors.extend(find_nepali_violations(raw_script, "script"))

    for sec in raw_script.get("sections", []):
        sec_id = sec.get("id", "unknown")
        sg = sec.get("stationGuide")
        if isinstance(sg, dict):
            for term in sg.get("terms", []):
                jp = strip_furigana_brackets(str(term.get("jp", "")))
                reading = str(term.get("reading", ""))
                romaji = str(term.get("romaji", ""))
                exp_kana = normalize_kana_phonetic(japanese_to_spoken_kana(jp))
                got_kana = normalize_kana_phonetic(reading)
                if exp_kana != got_kana:
                    errors.append(
                        f"{sec_id}.term({jp}): reading {reading!r} ({got_kana}) != expected {exp_kana!r}"
                    )
                dict_rom = normalize_romaji_compare(japanese_to_romaji(jp))
                got_rom = normalize_romaji_compare(romaji)
                sim = difflib.SequenceMatcher(None, dict_rom, got_rom).ratio()
                if sim < 0.92:
                    errors.append(
                        f"{sec_id}.term({jp}): romaji {romaji!r} mismatches dictionary {dict_rom!r} (sim={sim:.2f})"
                    )
            kp_jp_raw = str(sg.get("keyPhraseJp", ""))
            _, kp_tokens = parse_furigana_markup(kp_jp_raw)
            kp_rom = str(sg.get("keyPhraseRomaji", ""))
            if kp_tokens and kp_rom:
                dict_kp = normalize_romaji_compare(japanese_to_romaji(furigana_tokens_to_tts_text(kp_tokens)))
                got_kp = normalize_romaji_compare(kp_rom)
                sim = difflib.SequenceMatcher(None, dict_kp, got_kp).ratio()
                if sim < 0.88:
                    errors.append(
                        f"{sec_id}.keyPhrase: romaji {kp_rom!r} mismatches {dict_kp!r} (sim={sim:.2f})"
                    )
            for st_idx, st in enumerate(sg.get("subTopics", [])):
                st_jp_disp, st_jp_toks = parse_furigana_markup(str(st.get("jp", "")))
                if _KANJI_RE.search(st_jp_disp) and any(_KANJI_RE.search(str(t["text"])) and not t.get("furigana") for t in st_jp_toks):
                    errors.append(f"{sec_id}.subTopics[{st_idx}]: Kanji missing Furigana in {st_jp_disp!r}")
                ex_disp, ex_toks = parse_furigana_markup(str(st.get("exampleJp", "")))
                ex_rom = str(st.get("exampleRomaji", ""))
                if ex_toks and ex_rom:
                    dict_ex = normalize_romaji_compare(japanese_to_romaji(furigana_tokens_to_tts_text(ex_toks)))
                    got_ex = normalize_romaji_compare(ex_rom)
                    sim = difflib.SequenceMatcher(None, dict_ex, got_ex).ratio()
                    if sim < 0.85:
                        errors.append(
                            f"{sec_id}.subTopics[{st_idx}].example: romaji {ex_rom!r} mismatches {dict_ex!r} (sim={sim:.2f})"
                        )

        quiz = sec.get("quiz")
        if isinstance(quiz, dict):
            for opt in quiz.get("options", []):
                _, opt_toks = parse_furigana_markup(str(opt.get("jp", "")))
                jp = "".join(str(t["text"]) for t in opt_toks)
                romaji = str(opt.get("romaji", ""))
                dict_opt = normalize_romaji_compare(japanese_to_romaji(furigana_tokens_to_tts_text(opt_toks)))
                got_opt = normalize_romaji_compare(romaji)
                sim = difflib.SequenceMatcher(None, dict_opt, got_opt).ratio()
                if sim < 0.90:
                    errors.append(
                        f"{sec_id}.quiz({jp}): romaji {romaji!r} mismatches {dict_opt!r} (sim={sim:.2f})"
                    )

    for line in raw_script.get("lines", []):
        cid = line.get("id", "unknown")
        raw_jp = str(line.get("japanese", ""))
        jp, line_tokens = parse_furigana_markup(raw_jp)
        auto_tts = furigana_tokens_to_tts_text(line_tokens)
        tts = str(line.get("ttsText") or auto_tts)
        rom = str(line.get("romaji", ""))

        for t in line_tokens:
            if _KANJI_RE.search(str(t["text"])) and not t.get("furigana"):
                errors.append(f"{cid}: Kanji token {t['text']!r} missing Furigana reading")

        tts_sim = compare_phonetics(auto_tts, tts)
        if tts_sim < 0.90:
            errors.append(
                f"{cid}: ttsText phonetic mismatch vs Furigana reading (sim={tts_sim:.2f}): {tts!r} vs {auto_tts!r}"
            )

        dict_rom = normalize_romaji_compare(japanese_to_romaji(auto_tts))
        got_rom = normalize_romaji_compare(rom)
        rom_sim = difflib.SequenceMatcher(None, dict_rom, got_rom).ratio()
        if rom_sim < 0.88:
            errors.append(
                f"{cid}: romaji mismatch vs Furigana reading (sim={rom_sim:.2f}): got={got_rom!r} dict={dict_rom!r}"
            )

    return errors


def _find_ffmpeg_binary() -> str | None:
    bundled = list((ROOT_DIR / "node_modules" / "@remotion").glob("compositor-*/ffmpeg"))
    for p in bundled:
        if p.exists():
            return str(p)
    return shutil.which("ffmpeg")


def decode_mp3_to_pcm16k(mp3_source: bytes | Path) -> np.ndarray:
    """Decodes MP3 bytes or file path into a 1D float32 16kHz mono PCM array."""
    ffmpeg_bin = _find_ffmpeg_binary()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        if isinstance(mp3_source, bytes):
            in_file = tmp_path / "clip.mp3"
            in_file.write_bytes(mp3_source)
        else:
            in_file = Path(mp3_source)

        if ffmpeg_bin:
            proc = subprocess.run(
                [
                    ffmpeg_bin,
                    "-v",
                    "error",
                    "-i",
                    str(in_file),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-f",
                    "f32le",
                    "pipe:1",
                ],
                capture_output=True,
                check=False,
            )
            if proc.returncode == 0 and proc.stdout:
                return np.frombuffer(proc.stdout, dtype=np.float32).copy()

        afconvert = shutil.which("afconvert")
        if afconvert:
            wav_file = tmp_path / "clip.wav"
            proc = subprocess.run(
                [afconvert, "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(in_file), str(wav_file)],
                capture_output=True,
                check=False,
            )
            if proc.returncode == 0 and wav_file.exists():
                with wave.open(str(wav_file), "rb") as wf:
                    raw = wf.readframes(wf.getnframes())
                return (np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0).copy()

    raise RuntimeError("Neither Remotion ffmpeg nor macOS afconvert could decode MP3 to 16kHz PCM.")


def compute_segment_rms(pcm: np.ndarray, start_sec: float, end_sec: float, sr: int = 16000) -> float:
    """Computes RMS energy over `[start_sec, end_sec]` in a 16kHz mono PCM array."""
    i0 = max(0, int(round(start_sec * sr)))
    i1 = min(len(pcm), int(round(end_sec * sr)))
    if i1 <= i0:
        return 0.0
    seg = pcm[i0:i1]
    return float(np.sqrt(np.mean(seg * seg)))


@dataclass(frozen=True)
class WhisperWord:
    word: str
    start: float
    end: float
    prob: float


@dataclass(frozen=True)
class WhisperClipResult:
    transcript: str
    kana: str
    words: list[WhisperWord]


def transcribe_clip_whisper(
    pcm_16k: np.ndarray,
    model_size: str = "small",
) -> WhisperClipResult:
    """
    Runs blind Japanese Whisper ASR (`language="ja"`, `word_timestamps=True`,
    `vad_filter=False`, no initial_prompt) to audit real TTS pronunciation and word timings.
    """
    model = get_whisper_model(model_size)
    segments, _ = model.transcribe(
        pcm_16k,
        language="ja",
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
    )
    texts: list[str] = []
    words: list[WhisperWord] = []
    for seg in segments:
        if seg.text:
            texts.append(seg.text.strip())
        if seg.words:
            for w in seg.words:
                w_text = (w.word or "").strip()
                if not w_text:
                    continue
                words.append(
                    WhisperWord(
                        word=w_text,
                        start=float(w.start),
                        end=max(float(w.start), float(w.end)),
                        prob=float(getattr(w, "probability", 1.0)),
                    )
                )
    full_text = "".join(texts)
    return WhisperClipResult(
        transcript=full_text,
        kana=japanese_to_spoken_kana(full_text),
        words=words,
    )


@dataclass(frozen=True)
class DisplayToken:
    word: str
    char_start: int
    char_end: int
    kana: str
    romaji: str


def tokenize_display_japanese(japanese: str) -> list[DisplayToken]:
    """
    Splits `japanese` into learner-friendly spoken tokens (preserving exact character
    indices into `japanese` while grouping compound station words & conjugated verb phrases).
    """
    # 1. Greedy longest-match split against COMPOUND_WORD_CHUNKS vs single fugashi tokens
    spans: list[tuple[int, int]] = []
    pos = 0
    n = len(japanese)
    sorted_compounds = sorted(COMPOUND_WORD_CHUNKS, key=len, reverse=True)
    tagger = _get_tagger()

    while pos < n:
        ch = japanese[pos]
        if _PUNCTUATION_RE.match(ch):
            pos += 1
            continue

        matched_comp: str | None = None
        for comp in sorted_compounds:
            if japanese.startswith(comp, pos):
                matched_comp = comp
                break
        if matched_comp is not None:
            spans.append((pos, pos + len(matched_comp)))
            pos += len(matched_comp)
            continue

        # Otherwise consume until the next compound or punctuation and split via fugashi
        next_stop = pos
        while next_stop < n:
            if _PUNCTUATION_RE.match(japanese[next_stop]):
                break
            if any(japanese.startswith(c, next_stop) for c in sorted_compounds):
                break
            next_stop += 1

        chunk = japanese[pos:next_stop]
        cursor = pos
        raw_tokens = list(tagger(chunk))
        merged_idx = 0
        while merged_idx < len(raw_tokens):
            tok = raw_tokens[merged_idx]
            surf = tok.surface
            idx_in_jp = japanese.find(surf, cursor)
            if idx_in_jp < 0:
                idx_in_jp = cursor
            start_i = idx_in_jp
            end_i = start_i + len(surf)
            pos1 = getattr(tok.feature, "pos1", "") or ""
            # Merge trailing auxiliary verbs/suffixes (です, ます, ました, ない, たい, て, た) onto preceding verb/adj
            while merged_idx + 1 < len(raw_tokens):
                nxt = raw_tokens[merged_idx + 1]
                nxt_pos1 = getattr(nxt.feature, "pos1", "") or ""
                nxt_surf = nxt.surface
                can_attach = (
                    (pos1 in ("動詞", "形容詞", "助動詞") and nxt_pos1 in ("助動詞", "接尾辞"))
                    or (pos1 in ("動詞", "形容詞") and nxt_surf in ("て", "で", "た", "たら", "てい", "ます", "ましょう", "ません"))
                    or (pos1 == "名詞" and nxt_surf in ("さん", "駅"))
                )
                if not can_attach:
                    break
                nxt_pos = japanese.find(nxt_surf, end_i)
                if nxt_pos != end_i:
                    break
                end_i += len(nxt_surf)
                pos1 = nxt_pos1
                merged_idx += 1
            spans.append((start_i, end_i))
            cursor = end_i
            merged_idx += 1

        pos = max(pos + 1, next_stop)

    tokens: list[DisplayToken] = []
    for s_idx, e_idx in spans:
        w = japanese[s_idx:e_idx]
        if not w or _PUNCTUATION_RE.match(w):
            continue
        kana = normalize_kana_phonetic(japanese_to_spoken_kana(w))
        rom = japanese_to_romaji(w)
        tokens.append(
            DisplayToken(
                word=w,
                char_start=s_idx,
                char_end=e_idx,
                kana=kana or normalize_kana_phonetic(w),
                romaji=rom,
            )
        )
    return tokens


def _find_romaji_spans(romaji: str, tokens: list[DisplayToken]) -> list[tuple[int, int]]:
    """
    Aligns each DisplayToken's romaji sequentially onto whitespace/punctuation
    words inside `romaji` so Karaoke highlights Japanese and Romaji in sync.
    """
    word_matches = [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"[^\s]+", romaji)]
    if not word_matches or not tokens:
        return [(0, len(romaji)) for _ in tokens]

    results: list[tuple[int, int]] = []
    w_cursor = 0
    total_w = len(word_matches)
    total_t = len(tokens)

    for t_idx, tok in enumerate(tokens):
        if w_cursor >= total_w:
            last_end = word_matches[-1][1]
            results.append((last_end, last_end))
            continue

        remaining_tokens = total_t - t_idx
        target_norm = normalize_romaji_compare(tok.romaji)
        # Try grouping 1..3 consecutive romaji words to find best phonetic fit
        best_span = (word_matches[w_cursor][0], word_matches[w_cursor][1])
        best_next = w_cursor + 1
        best_score = -1.0

        max_group = min(3, total_w - w_cursor - max(0, remaining_tokens - 1))
        if max_group < 1:
            max_group = 1

        for k in range(1, max_group + 1):
            combined = "".join(word_matches[i][2] for i in range(w_cursor, w_cursor + k))
            comb_norm = normalize_romaji_compare(combined)
            sim = difflib.SequenceMatcher(None, target_norm, comb_norm).ratio()
            # Slightly prefer exact match & shorter group unless extra word improves match cleanly
            score = sim - 0.04 * (k - 1)
            if score > best_score:
                best_score = score
                best_span = (
                    word_matches[w_cursor][0],
                    word_matches[w_cursor + k - 1][1],
                )
                best_next = w_cursor + k

        # Lookahead safety: if remaining words slightly misaligned, check next word
        if best_score < 0.45 and w_cursor + 1 < total_w - max(0, remaining_tokens - 1):
            alt_norm = normalize_romaji_compare(word_matches[w_cursor + 1][2])
            alt_sim = difflib.SequenceMatcher(None, target_norm, alt_norm).ratio()
            if alt_sim > best_score + 0.35:
                # Include skipped filler/orphan word in previous span if possible
                if results:
                    prev_s, _ = results[-1]
                    results[-1] = (prev_s, word_matches[w_cursor][1])
                best_span = (word_matches[w_cursor + 1][0], word_matches[w_cursor + 1][1])
                best_next = w_cursor + 2

        results.append(best_span)
        w_cursor = best_next

    # Ensure trailing punctuation / final romaji word is covered cleanly
    if results and w_cursor < total_w:
        prev_s, _ = results[-1]
        results[-1] = (prev_s, word_matches[-1][1])

    return results


def _find_voice_active_intervals(
    pcm: np.ndarray,
    clip_dur: float,
    sr: int = 16000,
    hop_sec: float = 0.02,
    rms_thresh: float = 0.015,
) -> list[tuple[float, float]]:
    """Finds active speech intervals in a clip via short-window RMS energy."""
    win_samples = max(1, int(round(hop_sec * sr)))
    total_hops = max(1, int(len(pcm) // win_samples))
    active: list[bool] = []
    for i in range(total_hops):
        seg = pcm[i * win_samples : (i + 1) * win_samples]
        rms = float(np.sqrt(np.mean(seg * seg))) if len(seg) else 0.0
        active.append(rms >= rms_thresh)

    # Bridge tiny consonant closures <= 140ms (7 hops) inside a single word
    bridged = active[:]
    gap = 0
    for i in range(len(bridged)):
        if not bridged[i]:
            gap += 1
        else:
            if 0 < gap <= 7 and i - gap > 0:
                for g in range(i - gap, i):
                    bridged[g] = True
            gap = 0

    intervals: list[tuple[float, float]] = []
    in_seg = False
    seg_start = 0.0
    for i, flag in enumerate(bridged):
        t = min(clip_dur, i * hop_sec)
        if flag and not in_seg:
            seg_start = t
            in_seg = True
        elif not flag and in_seg:
            intervals.append((seg_start, min(clip_dur, (i + 1) * hop_sec)))
            in_seg = False
    if in_seg:
        intervals.append((seg_start, clip_dur))
    return intervals or [(0.0, clip_dur)]


def align_word_timings(
    japanese: str,
    romaji: str,
    clip_start_sec: float,
    clip_duration_sec: float,
    pcm_16k: np.ndarray,
    whisper_words: list[WhisperWord],
    edge_boundaries: list[tuple[str, float, float]] | None = None,
) -> list[dict[str, Any]]:
    """
    Projects true Whisper acoustic timestamps (with Edge-TTS `WordBoundary` &
    waveform RMS tightening) onto display Japanese tokens + aligned Romaji spans.
    """
    display_tokens = tokenize_display_japanese(japanese)
    if not display_tokens:
        return []

    romaji_spans = _find_romaji_spans(romaji, display_tokens)
    voice_intervals = _find_voice_active_intervals(pcm_16k, clip_duration_sec)
    speech_start = voice_intervals[0][0]
    speech_end = voice_intervals[-1][1]

    # Build character-to-time piecewise linear timeline from Whisper acoustic words
    anchors: list[tuple[str, float, float]] = []
    for w in whisper_words:
        wk = normalize_kana_phonetic(japanese_to_spoken_kana(w.word))
        if wk:
            anchors.append((wk, max(0.0, w.start), min(clip_duration_sec, max(w.start + 0.02, w.end))))

    # Fall back to edge-tts boundaries if Whisper produced too few anchor characters
    if sum(len(a[0]) for a in anchors) < 2 and edge_boundaries:
        anchors = []
        for b_text, b_s, b_e in edge_boundaries:
            bk = normalize_kana_phonetic(japanese_to_spoken_kana(b_text))
            if bk:
                anchors.append((bk, max(0.0, b_s), min(clip_duration_sec, max(b_s + 0.02, b_e))))

    # Cumulative normalized kana spans for DisplayTokens and Acoustic Anchors
    disp_total = max(1, sum(max(1, len(t.kana)) for t in display_tokens))
    disp_ranges: list[tuple[float, float]] = []
    c = 0.0
    for tok in display_tokens:
        ln = max(1, len(tok.kana))
        disp_ranges.append((c / disp_total, (c + ln) / disp_total))
        c += ln

    if anchors:
        # Build piecewise-linear mapping from normalized progression u in [0, 1] -> clip local sec
        anc_total = max(1, sum(len(a[0]) for a in anchors))
        pts_u: list[float] = [0.0]
        pts_t: list[float] = [min(speech_start, anchors[0][1])]
        ac = 0.0
        for wk, ws, we in anchors:
            u0 = ac / anc_total
            u1 = (ac + len(wk)) / anc_total
            if u0 > pts_u[-1]:
                pts_u.append(u0)
                pts_t.append(max(pts_t[-1], ws))
            else:
                pts_t[-1] = min(pts_t[-1], max(0.0, ws))
            pts_u.append(u1)
            pts_t.append(max(pts_t[-1], we))
            ac += len(wk)
        if pts_u[-1] < 1.0:
            pts_u.append(1.0)
            pts_t.append(max(pts_t[-1], speech_end))
        else:
            pts_t[-1] = max(pts_t[-1], min(clip_duration_sec, anchors[-1][2]))

        def map_u_to_time(u: float) -> float:
            return float(np.interp(u, pts_u, pts_t))
    else:
        total_voiced = sum(e - s for s, e in voice_intervals)

        def map_u_to_time(u: float) -> float:
            target = u * total_voiced
            acc = 0.0
            for s, e in voice_intervals:
                dur = e - s
                if acc + dur >= target:
                    return s + (target - acc)
                acc += dur
            return speech_end

    raw_timings: list[tuple[float, float]] = []
    for u0, u1 in disp_ranges:
        t0 = map_u_to_time(u0)
        t1 = max(t0 + 0.04, map_u_to_time(u1))
        raw_timings.append((t0, t1))

    # Snap/trim long silent micro-pauses inside a token edge using actual 16kHz PCM RMS
    out: list[dict[str, Any]] = []
    prev_end_abs = clip_start_sec
    clip_end_abs = clip_start_sec + clip_duration_sec

    for idx, tok in enumerate(display_tokens):
        local_s, local_e = raw_timings[idx]
        # Tighten leading edge past initial silence if needed
        while local_s + 0.025 < local_e and compute_segment_rms(pcm_16k, local_s, local_s + 0.025) < 0.012:
            local_s += 0.02
        # Tighten trailing edge past trailing pause silence if needed
        while local_e - 0.025 > local_s and compute_segment_rms(pcm_16k, local_e - 0.025, local_e) < 0.012:
            local_e -= 0.02

        s_abs = round(max(prev_end_abs, min(clip_end_abs - 0.02, clip_start_sec + local_s)), 3)
        e_abs = round(max(s_abs + 0.02, min(clip_end_abs, clip_start_sec + local_e)), 3)
        prev_end_abs = e_abs

        rom_s, rom_e = romaji_spans[idx]
        out.append(
            {
                "word": tok.word,
                "startSec": s_abs,
                "endSec": e_abs,
                "charStart": tok.char_start,
                "charEnd": tok.char_end,
                "romaji": tok.romaji,
                "romajiStart": rom_s,
                "romajiEnd": rom_e,
            }
        )

    return out
