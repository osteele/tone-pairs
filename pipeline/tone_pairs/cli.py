"""Build the drill's word list and audio from the homework transcripts.

    uv run tone-pairs [--no-audio]

Reads homework/*.txt and homework/extra-words.tsv; writes web/public/data/words.json and
web/public/audio/*.mp3.
"""

import argparse
import json
from pathlib import Path

from wordfreq import get_frequency_dict

from . import cedict, timing, tts
from .families import (
    CONTRAST_CHAR_ZIPF,
    Family,
    Word,
    build_families,
    candidates,
    characters,
)
from .homework import read_exercise, read_extra_words

ROOT = Path(__file__).resolve().parents[2]
HOMEWORK = ROOT / "homework"
CACHE = ROOT / ".cache"
PUBLIC = ROOT / "web" / "public"


def report(families: list[Family]) -> None:
    for family in families:
        print(f"{family.key:14} printed: {', '.join(family.printed)}")
        for word in family.words:
            spoken = "" if word.spoken == word.tones else f"  (said {word.spoken})"
            kind = f"zipf {word.zipf:4}" if word.real else "pseudo   "
            print(f"    {word.hanzi}  {word.pinyin:12} {kind}{spoken}  {word.gloss}")
        real = sum(w.real for w in family.contrasts)
        print(f"    + {len(family.contrasts)} contrast recordings ({real} real words)")
        for warning in family.warnings:
            print(f"    WARNING {warning}")


def word_json(word: Word, family: Family) -> dict[str, object]:
    return {
        "id": word.id,
        "hanzi": word.hanzi,
        "pinyin": word.pinyin,
        "syllables": list(word.syllables),
        "tones": list(word.tones),
        "spoken": list(word.spoken),
        "gloss": word.gloss,
        "real": word.real,
        "family": family.key,
        "exercises": family.exercises,
        "audio": {v.key: f"audio/{tts.filename(word, v)}" for v in tts.VOICES},
    }


def manifest(
    exercises: list[tuple[str, str]],
    families: list[Family],
    timings: dict[str, timing.Timing],
) -> dict[str, object]:
    return {
        "exercises": [{"id": id, "title": title} for id, title in exercises],
        "voices": [{"key": v.key, "label": v.label} for v in tts.VOICES],
        "families": [
            {
                "key": f.key,
                "printed": f.printed,
                "exercises": f.exercises,
                "words": [w.id for w in f.words],
                "contrasts": [word_json(w, f) for w in f.contrasts],
            }
            for f in families
        ],
        "words": [word_json(w, f) for f in families for w in f.words],
        "timing": {path: [t.start, t.split, t.end] for path, t in sorted(timings.items())},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-audio", action="store_true", help="skip speech synthesis")
    args = parser.parse_args()

    entries = cedict.load(cedict.ensure_downloaded(CACHE / "cedict.txt.gz"))
    valid = frozenset(s for e in entries for s in e.syllables)
    exercises = [read_exercise(p, valid) for p in sorted(HOMEWORK.glob("*.txt"))]
    frequencies = get_frequency_dict("zh")
    by_key = candidates(entries, frequencies)
    chars = characters(entries, frequencies)
    contrast_chars = characters(entries, frequencies, min_zipf=CONTRAST_CHAR_ZIPF)
    extras = read_extra_words(HOMEWORK / "extra-words.tsv")

    items = [(ex.id, item) for ex in exercises for item in ex.items]
    families = build_families(items, by_key, extras, chars, contrast_chars)
    report(families)

    recorded = [w for f in families for w in (*f.words, *f.contrasts)]
    audio = PUBLIC / "audio"
    if not args.no_audio:
        created = tts.synthesize(recorded, audio)
        print(f"synthesized {created} recordings")

    timings: dict[str, timing.Timing] = {}
    for word in recorded:
        for voice in tts.VOICES:
            path = audio / tts.filename(word, voice)
            if path.exists():
                timings[f"audio/{path.name}"] = timing.measure(
                    path, voice.pitch_floor, voice.pitch_ceiling
                )

    out = PUBLIC / "data" / "words.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = manifest([(ex.id, ex.title) for ex in exercises], families, timings)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    drill = sum(len(f.words) for f in families)
    print(f"wrote {out.relative_to(ROOT)}: {drill} drill words, {len(recorded)} recorded words")
