"""Recordings of the tone patterns no word in a family has, made by re-pitching one that exists.

When an answer names a pattern that no real word or pseudo-word in the family has, the
feedback would have nothing to play. Here another recording of the family, in the same
voice, is given that pattern's pitch with Praat's overlap-add resynthesis. Only the syllable
whose tone differs is changed: a syllable that already has the right tone keeps its recorded
pitch, and with it the creak of a spoken third tone, which resynthesis cannot produce. The
new pitch is the idealized contour of web/src/contour.ts on the five-level scale, spread
across the voice's measured range.
"""

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import parselmouth
from parselmouth.praat import call

from . import timing
from .families import Family, Pattern, Word
from .pinyin import NEUTRAL
from .tts import Voice

# Every spoken pattern an answer without a neutral tone can name; written 3-3 is said 2-3.
ANSWERS: tuple[Pattern, ...] = tuple(
    (a, b) for a in range(1, 5) for b in range(1, 5) if (a, b) != (3, 3)
)

_TIME_STEP = 0.01
_CONTOUR_POINTS = 20
# Percentiles of a voice's pitch taken as levels 1 and 5 of the five-level scale.
_RANGE_PERCENTILES = (5, 95)


def syllable_levels(tone: int, previous: int | None, last: bool) -> tuple[float, ...]:
    """Pitch levels at evenly spaced points through one syllable (contour.ts)."""
    match tone:
        case 1:
            return (5, 5)
        case 2:
            return (3, 5)
        case 3:
            return (2, 1, 2) if last else (2, 1, 1)
        case 4:
            return (5, 1)
    raise ValueError(f"no contour for tone {tone}")


def level_at(levels: Sequence[float], f: float) -> float:
    """Level at fraction ``f`` through a syllable, eased between control points (contour.ts)."""
    segments = len(levels) - 1
    position = min(max(f, 0.0), 1.0) * segments
    i = min(math.floor(position), segments - 1)
    local = position - i
    eased = (1 - math.cos(math.pi * local)) / 2
    return levels[i] + (levels[i + 1] - levels[i]) * eased


@dataclass(frozen=True)
class Plan:
    """A pattern to make for a family, and the recording to make it from."""

    family: Family
    pattern: Pattern
    source: Word

    @property
    def word(self) -> Word:
        return Word(
            hanzi="",
            syllables=self.family.syllables,
            tones=self.pattern,
            spoken=self.pattern,
            gloss="",
            zipf=0.0,
            real=False,
            source=self.source,
        )


def _differences(a: Pattern, b: Pattern) -> int:
    return sum(x != y for x, y in zip(a, b, strict=True))


def plan(families: Iterable[Family]) -> list[Plan]:
    """For each family, every answer pattern it has no recording of, with the closest source.

    The source differs from the pattern in as few syllables as possible, and is a real word
    where one is as close. Sources with a neutral tone are passed over: a neutral syllable is
    too short to carry a full tone.
    """
    plans: list[Plan] = []
    for family in families:
        recorded = [*family.words, *family.contrasts]
        have = {w.spoken for w in recorded}
        sources = [w for w in recorded if NEUTRAL not in w.spoken and w.source is None]
        if not sources:
            continue
        for pattern in ANSWERS:
            if pattern in have:
                continue
            source = min(
                sources,
                key=lambda w: (_differences(w.spoken, pattern), not w.real, recorded.index(w)),
            )
            plans.append(Plan(family, pattern, source))
    return plans


def voice_range(sounds: Iterable[parselmouth.Sound], voice: Voice) -> tuple[float, float]:
    """Semitones above 100 Hz of the low and high ends of a voice's pitch, over a sample of
    its recordings."""
    semitones: list[float] = []
    for sound in sounds:
        pitch = sound.to_pitch_ac(
            time_step=_TIME_STEP, pitch_floor=voice.pitch_floor, pitch_ceiling=voice.pitch_ceiling
        )
        semitones.extend(
            12 * math.log2(f / 100) for f in pitch.selected_array["frequency"] if f > 0
        )
    if not semitones:
        raise ValueError(f"{voice.key}: no voiced frames in the sample")
    semitones.sort()
    low, high = (semitones[len(semitones) * p // 100] for p in _RANGE_PERCENTILES)
    return low, high


def _hertz(level: float, span: tuple[float, float]) -> float:
    low, high = span
    return 100 * 2 ** ((low + (level - 1) / 4 * (high - low)) / 12)


def repitch(
    sound: parselmouth.Sound,
    spoken: Pattern,
    pattern: Pattern,
    voice: Voice,
    span: tuple[float, float],
) -> parselmouth.Sound | None:
    """``sound``, a recording said with tones ``spoken``, re-pitched to ``pattern``: each
    syllable whose tone differs takes the idealized contour, spread across ``span``. None
    when a syllable to change has too little voicing to carry a contour."""
    bounds = timing.measure(sound, voice.pitch_floor, voice.pitch_ceiling)
    manipulation = call(
        sound, "To Manipulation", _TIME_STEP, voice.pitch_floor, voice.pitch_ceiling
    )
    tier = call(manipulation, "Extract pitch tier")
    times = [
        call(tier, "Get time from index", i)
        for i in range(1, call(tier, "Get number of points") + 1)
    ]
    syllables = (
        [t for t in times if bounds.start <= t < bounds.split],
        [t for t in times if bounds.split < t <= bounds.end],
    )
    for i, voiced in enumerate(syllables):
        if spoken[i] == pattern[i]:
            continue
        if len(voiced) < 2:
            return None
        start, end = voiced[0], voiced[-1]
        call(tier, "Remove points between", start, end)
        levels = syllable_levels(pattern[i], pattern[i - 1] if i else None, i == 1)
        for k in range(_CONTOUR_POINTS + 1):
            f = k / _CONTOUR_POINTS
            call(tier, "Add point", start + f * (end - start), _hertz(level_at(levels, f), span))
    call([tier, manipulation], "Replace pitch tier")
    return call(manipulation, "Get resynthesis (overlap-add)")
