"""Build the drill's word list and audio from the homework transcripts.

    uv run tone-pairs [--no-audio]

Reads the workbook transcripts (hsk*.txt, in $TONE_PAIRS_TRANSCRIPTS) and
homework/extra-words.tsv. Writes web/public/data/words.json, which depends only on those and
the dictionary, and so is committed. Synthesizes missing speech into .cache/speech, builds the
served recordings from it (web/public/audio/*.m4a, recordings.py), and writes what was
measured in them to web/public/data/recordings.json. The speech and the recordings are kept
out of the repository.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from wordfreq import get_frequency_dict

from . import cedict, recordings, resynthesis, tts
from .families import (
    CONTRAST_CHAR_ZIPF,
    RARE_CHAR_ZIPF,
    Family,
    Word,
    build_families,
    candidates,
    characters,
)
from .homework import read_exercise, read_extra_words

ROOT = Path(__file__).resolve().parents[2]
HOMEWORK = ROOT / "homework"
# The workbook transcripts (hsk*.txt) are excerpts of a copyrighted book, kept outside the
# repository; TONE_PAIRS_TRANSCRIPTS names their directory (set in .env, which just loads).
TRANSCRIPTS_VAR = "TONE_PAIRS_TRANSCRIPTS"
CACHE = ROOT / ".cache"
PUBLIC = ROOT / "web" / "public"
# Speech as synthesized: the source of the served recordings, kept out of the repository.
SPEECH = CACHE / "speech"
AUDIO = PUBLIC / "audio"


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
        **({"madeFrom": f"{word.source.pinyin} {word.source.hanzi}"} if word.source else {}),
    }


def manifest(exercises: list[tuple[str, str]], families: list[Family]) -> dict[str, object]:
    """The word list. A word's recording in a voice is audio/<id>-<voice>.m4a."""
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
    }


def main() -> None:
    # Progress appears as it happens even when output goes to a log file, not only to a terminal.
    sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-audio", action="store_true", help="skip speech synthesis")
    args = parser.parse_args()

    entries = cedict.load(cedict.ensure_downloaded(CACHE / "cedict.txt.gz"))
    valid = frozenset(s for e in entries for s in e.syllables)
    transcripts = Path(os.environ.get(TRANSCRIPTS_VAR, HOMEWORK))
    paths = sorted(transcripts.glob("hsk*.txt"))
    if not paths:
        raise SystemExit(
            f"no transcripts (hsk*.txt) in {transcripts}; set {TRANSCRIPTS_VAR} in .env "
            "to the directory that holds them"
        )
    exercises = [read_exercise(p, valid) for p in paths]
    frequencies = get_frequency_dict("zh")
    by_key = candidates(entries, frequencies)
    chars = characters(entries, frequencies)
    contrast_chars = characters(entries, frequencies, min_zipf=CONTRAST_CHAR_ZIPF)
    rare_chars = characters(entries, frequencies, min_zipf=RARE_CHAR_ZIPF)
    extras = read_extra_words(HOMEWORK / "extra-words.tsv")

    items = [(ex.id, item) for ex in exercises for item in ex.items]
    families = build_families(items, by_key, extras, chars, contrast_chars, rare_chars)
    report(families)

    spoken = [w for f in families for w in (*f.words, *f.contrasts)]
    if not args.no_audio:
        created = tts.synthesize(spoken, SPEECH)
        print(f"synthesized {created} recordings")

    # A pattern no word has is re-pitched from another recording. It is listed whether or not
    # every voice could be made; the app treats a voice with no entry in recordings.json as
    # having no recording.
    for item in resynthesis.plan(families):
        item.family.contrasts.append(item.word)
    recorded = [w for f in families for w in (*f.words, *f.contrasts)]

    out = PUBLIC / "data" / "words.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = manifest([(ex.id, ex.title) for ex in exercises], families)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    measured = recordings.build(recorded, SPEECH, AUDIO, CACHE / "measured.json")
    recordings_out = PUBLIC / "data" / "recordings.json"
    recordings_out.write_text(json.dumps(measured, separators=(",", ":")) + "\n", encoding="utf-8")
    missing = len(recorded) * len(tts.VOICES) - len(measured)
    if missing:
        print(f"WARNING {missing} word-voice pairs have no recording")

    # Recordings of words no longer in any family would otherwise be deployed for nothing.
    stale = [p for p in AUDIO.iterdir() if p.is_file() and f"audio/{p.name}" not in measured]
    for path in stale:
        path.unlink()
    if stale:
        print(f"removed {len(stale)} recordings no word uses")
    drill = sum(len(f.words) for f in families)
    print(f"wrote {out.relative_to(ROOT)}: {drill} drill words, {len(recorded)} recorded words")
