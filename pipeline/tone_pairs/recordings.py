"""Build the served recordings from the synthesized speech, and measure them.

Each served recording is made once: synthesized speech, trimmed (sound.trim), or for a word
with a ``source``, that word's trimmed speech re-pitched (resynthesis.repitch); then encoded
as .m4a (sound.encode). Measurements are taken from the served file as decoded, the timeline
the listener hears, and cached by the file's content digest, so a later run decodes only new
recordings.
"""

import json
import random
from collections.abc import Callable
from pathlib import Path

import parselmouth

from . import resynthesis, sound, timing, tts
from .families import Word
from .tts import Voice

# Part of every measurement's cache key: raise it when the timing or track code changes what
# it measures, so the next run measures every recording again.
_MEASURE_VERSION = 3
# Recordings per voice sampled to find the voice's pitch range (resynthesis.voice_range).
_RANGE_SAMPLE = 60

Measured = dict[str, object]


def _made(
    word: Word,
    voice: Voice,
    speech: Path,
    span: tuple[float, float],
    trimmed: dict[str, parselmouth.Sound | None],
) -> parselmouth.Sound | None:
    """The served recording of ``word`` in ``voice`` as samples, or None if it cannot be made
    (no speech synthesized, or too little voicing to re-pitch). ``trimmed`` memoizes the
    trimmed speech of words that are the source of re-pitched recordings, each of which is
    the source of several."""
    if word.source is None:
        path = speech / tts.speech_filename(word, voice)
        return sound.trim(sound.decode(path)) if path.exists() else None
    if word.source.id not in trimmed:
        trimmed[word.source.id] = _made(word.source, voice, speech, span, trimmed)
    base = trimmed[word.source.id]
    if base is None:
        return None
    return resynthesis.repitch(base, word.source.spoken, word.tones, voice, span)


def build(
    words: list[Word],
    speech: Path,
    audio: Path,
    cache_path: Path,
    progress: Callable[[str], None] = print,
) -> dict[str, Measured]:
    """Make any missing served recordings, and return what was measured in each, keyed by its
    path relative to the site root."""
    audio.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Measured] = (
        json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    )
    measured: dict[str, Measured] = {}
    for voice in tts.VOICES:
        spoken = sorted(
            path
            for w in words
            if w.source is None and (path := speech / tts.speech_filename(w, voice)).exists()
        )
        # Without speech (a cleared cache), the served recordings are still measured and kept;
        # the voice's range is then taken from them. Speech is needed only to make a recording.
        served = sorted(path for w in words if (path := audio / tts.filename(w, voice)).exists())
        sources = spoken or served
        if not sources:
            progress(f"{voice.key}: no synthesized speech and no recordings")
            continue
        if not spoken:
            progress(f"{voice.key}: no synthesized speech; measuring the existing recordings")
        sample = random.Random(voice.key).sample(sources, min(_RANGE_SAMPLE, len(sources)))
        span = resynthesis.voice_range((sound.trim(sound.decode(p)) for p in sample), voice)
        made = 0
        trimmed: dict[str, parselmouth.Sound | None] = {}
        for word in words:
            out = audio / tts.filename(word, voice)
            if not out.exists():
                samples = _made(word, voice, speech, span, trimmed)
                if samples is None:
                    continue
                sound.encode(samples, out)
                made += 1
            digest = tts.version(out)
            key = f"{_MEASURE_VERSION}:{digest}:{span[0]:.2f}:{span[1]:.2f}"
            if key not in cache:
                heard = sound.decode(out)
                bounds = timing.measure(heard, voice.pitch_floor, voice.pitch_ceiling)
                cache[key] = {
                    "t": [bounds.start, bounds.split, bounds.end],
                    "p": timing.track(heard, voice.pitch_floor, voice.pitch_ceiling, bounds, span),
                }
            measured[f"audio/{out.name}"] = {"v": digest, **cache[key]}
        progress(f"{voice.key}: made {made} recordings")
        # Saved after each voice, so an interrupted run loses at most one voice's measurements.
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
    return dict(sorted(measured.items()))
