"""Build the drill's word list and audio from the homework transcripts.

    uv run tone-pairs [--no-audio]

Reads homework/*.txt and homework/extra-words.tsv. Writes web/public/data/words.json, which
depends only on those and the dictionary, and so is committed; web/public/audio/*.mp3; and
web/public/data/recordings.json, what was measured in each recording, which like the
recordings themselves is kept out of the repository.
"""

import argparse
import json
from pathlib import Path

from wordfreq import get_frequency_dict

from . import cedict, resynthesis, timing, tts
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
        **({"madeFrom": f"{word.source.pinyin} {word.source.hanzi}"} if word.source else {}),
    }


def manifest(exercises: list[tuple[str, str]], families: list[Family]) -> dict[str, object]:
    """The word list. A word's recording in a voice is audio/<id>-<voice>.mp3."""
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
    rare_chars = characters(entries, frequencies, min_zipf=RARE_CHAR_ZIPF)
    extras = read_extra_words(HOMEWORK / "extra-words.tsv")

    items = [(ex.id, item) for ex in exercises for item in ex.items]
    families = build_families(items, by_key, extras, chars, contrast_chars, rare_chars)
    report(families)

    recorded = [w for f in families for w in (*f.words, *f.contrasts)]
    audio = PUBLIC / "audio"
    if not args.no_audio:
        created = tts.synthesize(recorded, audio)
        print(f"synthesized {created} recordings")

    plans = resynthesis.plan(families)
    if not args.no_audio:
        made = resynthesis.render_all(plans, audio)
        print(f"re-pitched {made} recordings for {len(plans)} patterns no word has")
    # A re-pitched pattern is listed whether or not every voice could be made; the app treats
    # a voice with no entry in recordings.json as having no recording.
    for item in plans:
        item.family.contrasts.append(item.word)
    recorded = [w for f in families for w in (*f.words, *f.contrasts)]

    out = PUBLIC / "data" / "words.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = manifest([(ex.id, ex.title) for ex in exercises], families)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    measured = measure_recordings(recorded, audio)
    recordings_out = PUBLIC / "data" / "recordings.json"
    recordings_out.write_text(json.dumps(measured, separators=(",", ":")) + "\n", encoding="utf-8")
    missing = len(recorded) * len(tts.VOICES) - len(measured)
    if missing:
        print(f"WARNING {missing} word-voice pairs have no recording")

    # Recordings of words no longer in any family would otherwise be deployed for nothing.
    stale = [p for p in audio.glob("*.mp3") if f"audio/{p.name}" not in measured]
    for path in stale:
        path.unlink()
    if stale:
        print(f"removed {len(stale)} recordings no word uses")
    drill = sum(len(f.words) for f in families)
    print(f"wrote {out.relative_to(ROOT)}: {drill} drill words, {len(recorded)} recorded words")


def measure_recordings(words: list[Word], audio: Path) -> dict[str, dict[str, object]]:
    """For each recording on disk: a digest of its content, so a re-recorded clip gets a new
    URL; its timing (timing.measure); and its measured pitch (timing.track)."""
    measured: dict[str, dict[str, object]] = {}
    for voice in tts.VOICES:
        spoken = [audio / tts.filename(w, voice) for w in words if w.source is None]
        span = resynthesis.voice_range([p for p in spoken if p.exists()], voice)
        for word in words:
            path = audio / tts.filename(word, voice)
            if not path.exists():
                continue
            bounds = timing.measure(path, voice.pitch_floor, voice.pitch_ceiling)
            measured[f"audio/{path.name}"] = {
                "v": tts.version(path),
                "t": [bounds.start, bounds.split, bounds.end],
                "p": timing.track(path, voice.pitch_floor, voice.pitch_ceiling, bounds, span),
            }
    return dict(sorted(measured.items()))
