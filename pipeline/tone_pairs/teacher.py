"""Measure the workbook's own recordings of the drilled words, for comparing with the synthesized
voices on a development page (web/src/DevTeacher.tsx, shown only under `just dev`).

Each lesson's second audio file (NN-2.mp3, under $TONE_PAIRS_WORKBOOK_AUDIO) reads the
pronunciation exercise; its last items are the tone-marking ones the drill uses, each a spoken
number followed by the word, said once or twice. Every reading is measured with the same timing
and track code as the synthesized recordings, scaled to that reader's range. Which printed option
the reader says is transcribed by an audio model through OpenRouter ($OPENROUTER_API_KEY) and
cached, since an option cannot be told from its pitch alone.

The workbook audio is copyrighted, so everything this writes stays in .cache/teacher, which the
repository and the build both leave out.
"""

import base64
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import parselmouth

from . import resynthesis, sound, timing
from .cli import CACHE, PUBLIC, TRANSCRIPTS_VAR

AUDIO_VAR = "TONE_PAIRS_WORKBOOK_AUDIO"
OUT = CACHE / "teacher"
# Pitch limits wide enough for a man's or a woman's voice.
FLOOR, CEILING = 75.0, 500.0
# Silence that separates segments, and the pause that separates one item from the next.
_SILENCE = "silencedetect=noise=-35dB:d=0.35"
_ITEM_GAP = 2.5
_MODEL = "google/gemini-2.5-flash"
_ITEM = re.compile(r"^(\d+)\.\s+(.+)$")

Segment = tuple[float, float]


def speech_segments(path: Path) -> list[Segment]:
    """Stretches of speech between silences, by ffmpeg's silence detector."""
    log = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-af", _SILENCE, "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", log)]
    return list(zip(ends, starts[1:], strict=False))


def item_readings(segments: list[Segment], count: int) -> list[list[Segment]]:
    """The readings of the word in each of the last ``count`` items.

    Segments closer than _ITEM_GAP belong to one item. An item is its number and then the word,
    once or twice; the first can run on from the instructions before it, so only an item's last
    three segments count, and the first of those is the number.
    """
    groups: list[list[Segment]] = []
    for segment in segments:
        if groups and segment[0] - groups[-1][-1][1] < _ITEM_GAP:
            groups[-1].append(segment)
        else:
            groups.append([segment])
    items = [group[-3:] for group in groups[-count:]]
    return [item[1:] if len(item) > 1 else item for item in items]


def tone_marking_items(path: Path) -> list[tuple[int, list[str]]]:
    """The transcript's numbered items and their printed options (comments dropped)."""
    items = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        match = _ITEM.match(raw.split("#", 1)[0].strip())
        if match:
            items.append((int(match.group(1)), [o.strip() for o in match.group(2).split("/")]))
    return items


def transcribe(clip: Path, options: list[str]) -> str:
    """The word read in ``clip``, in characters, as heard by an audio model."""
    prompt = (
        "This clip is a Mandarin teacher reading one two-syllable word from a workbook, possibly "
        f"twice. The printed choices (pinyin without tones) were: {' / '.join(options)}. Reply "
        "with only the word you hear, in simplified Chinese characters."
    )
    payload = {
        "model": _MODEL,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": base64.b64encode(clip.read_bytes()).decode(),
                            "format": "wav",
                        },
                    },
                ],
            }
        ],
    }
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)["choices"][0]["message"]["content"].strip()


def reader_span(sounds: list[parselmouth.Sound]) -> tuple[float, float]:
    """The reader's pitch range, as resynthesis.voice_range finds a synthesized voice's."""
    semitones = sorted(
        12 * math.log2(f / 100)
        for s in sounds
        for f in s.to_pitch_ac(
            time_step=0.01, pitch_floor=FLOOR, pitch_ceiling=CEILING
        ).selected_array["frequency"]
        if f > 0
    )
    low, high = (semitones[len(semitones) * p // 100] for p in resynthesis._RANGE_PERCENTILES)
    return low, high


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    audio_dir = Path(os.environ[AUDIO_VAR])
    transcripts = Path(os.environ[TRANSCRIPTS_VAR])
    words = json.loads((PUBLIC / "data" / "words.json").read_text(encoding="utf-8"))
    clips = OUT / "clips"
    clips.mkdir(parents=True, exist_ok=True)
    heard_path = OUT / "heard.json"
    heard: dict[str, str] = (
        json.loads(heard_path.read_text(encoding="utf-8")) if heard_path.exists() else {}
    )
    members: dict[str, list[dict]] = {}
    for word in words["words"]:
        members.setdefault(word["family"], []).append(word)

    entries = []
    for transcript in sorted(transcripts.glob("hsk1-*.txt")):
        lesson = transcript.stem
        items = tone_marking_items(transcript)
        recordings = sorted(audio_dir.glob(f"**/{lesson.removeprefix('hsk1-')}-2.mp3"))
        if not items or not recordings:
            print(f"{lesson}: {'no items' if not items else 'no NN-2.mp3'}; skipped")
            continue
        whole = sound.decode(recordings[0])
        readings = item_readings(speech_segments(recordings[0]), len(items))
        cut = [
            [whole.extract_part(a - 0.05, b + 0.05, preserve_times=False) for a, b in reading]
            for reading in readings
        ]
        span = reader_span([s for reading in cut for s in reading])
        for (number, options), reading, sounds in zip(items, readings, cut, strict=True):
            name = f"{lesson}-{number}"
            clip = clips / f"{name}.wav"
            start, end = reading[0][0] - 0.1, reading[-1][1] + 0.1
            subprocess.run(
                [
                    "ffmpeg",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    f"{start:.2f}",
                    "-to",
                    f"{end:.2f}",
                    "-i",
                    str(recordings[0]),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    str(clip),
                ],
                check=True,
            )
            if name not in heard:
                heard[name] = transcribe(clip, options)
                heard_path.write_text(json.dumps(heard, ensure_ascii=False, indent=1), "utf-8")
            families = {f["key"] for f in words["families"] if set(f["printed"]) & set(options)}
            word = next(
                (w for key in families for w in members.get(key, []) if w["hanzi"] == heard[name]),
                None,
            )
            takes = []
            for k, s in enumerate(sounds, start=1):
                take = clips / f"{name}-{k}.wav"
                s.save(str(take), "WAV")
                bounds = timing.measure(s, FLOOR, CEILING)
                takes.append(
                    {
                        "clip": f"clips/{take.name}",
                        "t": [bounds.start, bounds.split, bounds.end],
                        "p": timing.track(s, FLOOR, CEILING, bounds, span),
                    }
                )
            entries.append(
                {
                    "lesson": lesson,
                    "item": number,
                    "options": options,
                    "heard": heard[name],
                    "word": word["id"] if word else None,
                    "takes": takes,
                }
            )
            missing = "" if word else "  (no such word)"
            print(f"{name:12} {' / '.join(options):24} {heard[name]}{missing}")
    (OUT / "teacher.json").write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT / 'teacher.json'}: {len(entries)} items")


if __name__ == "__main__":
    main()
