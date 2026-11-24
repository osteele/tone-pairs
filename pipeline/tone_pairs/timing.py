"""Where speech starts, where the syllables divide, and where speech ends, in each recording,
and the pitch measured through each syllable.

The times pace the animation along the contour and trim trailing silence when clips play
back to back. The measured pitch is drawn faintly behind the idealized contour, so the
listener can see what the recording itself does.
"""

import math
from dataclasses import dataclass

import parselmouth

_STEP = 0.01
# Below Praat's default (0.45), so the creaky low part of a third tone counts as voiced.
_VOICING_THRESHOLD = 0.3
# Points sampled through each syllable for the measured pitch.
_TRACK_POINTS = 16
# A jump of this many semitones between neighbouring voiced points is a pitch-tracking error: the
# tracker has read an octave (12 semitones) high or low, as it does in creak at the end of a word.
# No tone moves this far in a sixteenth of a syllable.
_OCTAVE_JUMP = 7.0
# The longest run of points so read that is dropped, when the syllable has a longer one.
_STRAY_RUN = 3


@dataclass(frozen=True)
class Timing:
    start: float
    split: float
    end: float


def measure(sound: parselmouth.Sound, pitch_floor: float, pitch_ceiling: float) -> Timing:
    """Voiced span of a two-syllable clip, split at the widest voicing gap near its middle.

    Without a gap (a voiced initial such as m, n, l, r), the split is the intensity minimum
    in the middle of the span.
    """
    pitch = sound.to_pitch_ac(
        time_step=_STEP,
        pitch_floor=pitch_floor,
        pitch_ceiling=pitch_ceiling,
        voicing_threshold=_VOICING_THRESHOLD,
    )
    times = pitch.xs()
    voiced = pitch.selected_array["frequency"] > 0
    indices = [i for i, v in enumerate(voiced) if v]
    if not indices:
        raise ValueError("no voiced frames")
    start, end = float(times[indices[0]]), float(times[indices[-1]])
    low, high = start + 0.3 * (end - start), start + 0.7 * (end - start)

    gaps: list[tuple[float, float]] = []
    for before, after in zip(indices, indices[1:], strict=False):
        if after - before > 1:
            gap_start, gap_end = float(times[before]), float(times[after])
            middle = (gap_start + gap_end) / 2
            if low <= middle <= high:
                gaps.append((gap_end - gap_start, middle))
    if gaps:
        split = max(gaps)[1]
    else:
        intensity = sound.to_intensity(minimum_pitch=pitch_floor, time_step=_STEP)
        frames = [
            (float(value), float(t))
            for t, value in zip(intensity.xs(), intensity.values[0], strict=True)
            if low <= t <= high
        ]
        split = min(frames)[1] if frames else (start + end) / 2
    return Timing(round(start, 3), round(split, 3), round(end, 3))


def syllable_pitches(
    sound: parselmouth.Sound, pitch_floor: float, pitch_ceiling: float, bounds: Timing
) -> list[list[float | None]]:
    """Measured pitch at evenly spaced points through each syllable, in semitones above 100 Hz,
    without octave-jump errors (drop_octave_jumps). Unvoiced points are None."""
    pitch = sound.to_pitch_ac(
        time_step=_STEP,
        pitch_floor=pitch_floor,
        pitch_ceiling=pitch_ceiling,
        voicing_threshold=_VOICING_THRESHOLD,
    )
    syllables: list[list[float | None]] = []
    for start, end in ((bounds.start, bounds.split), (bounds.split, bounds.end)):
        semitones: list[float | None] = []
        for k in range(_TRACK_POINTS):
            hertz = pitch.get_value_at_time(start + (k + 0.5) / _TRACK_POINTS * (end - start))
            semitones.append(None if math.isnan(hertz) else 12 * math.log2(hertz / 100))
        syllables.append(drop_octave_jumps(semitones))
    return syllables


def track(
    sound: parselmouth.Sound,
    pitch_floor: float,
    pitch_ceiling: float,
    bounds: Timing,
    span: tuple[float, float],
) -> list[list[int | None]]:
    """Measured pitch at evenly spaced points through each syllable, in tenths of a level on
    the five-level scale (35 is level 3.5): finer than the staff can show, and compact as JSON.

    ``span`` gives the voice's pitch at levels 1 and 5, in semitones above 100 Hz
    (resynthesis.voice_range). Unvoiced points are None, and so are points _OCTAVE_JUMP or more
    beyond either end of the range: a run read an octave off, at the end of a syllable, can be
    as long as the run it follows, so drop_octave_jumps cannot tell which to keep, but speech
    stays within a few semitones of the voice's range.
    """
    low, high = span
    return [
        [
            None
            if s is None or not low - _OCTAVE_JUMP < s < high + _OCTAVE_JUMP
            else round(10 * (1 + 4 * (s - low) / (high - low)))
            for s in points
        ]
        for points in syllable_pitches(sound, pitch_floor, pitch_ceiling, bounds)
    ]


def drop_octave_jumps(points: list[float | None]) -> list[float | None]:
    """``points`` (semitones, None where unvoiced) without short runs that sit an octave or so
    away from the rest of the syllable, which are pitch-tracking errors rather than speech.

    The voiced points divide into runs wherever one is _OCTAVE_JUMP or more from the voiced point
    before it. A tone moves only a few semitones between neighbouring points, so a steep fall stays
    one run, and a run read an octave off begins with such a jump. A run of at most _STRAY_RUN
    points is dropped when the syllable has a longer one.
    """
    runs: list[list[int]] = []
    previous: float | None = None
    for i, point in enumerate(points):
        if point is None:
            continue
        if previous is None or abs(point - previous) >= _OCTAVE_JUMP:
            runs.append([])
        runs[-1].append(i)
        previous = point
    longest = max((len(run) for run in runs), default=0)
    kept = list(points)
    for run in runs:
        if len(run) <= _STRAY_RUN and len(run) < longest:
            for i in run:
                kept[i] = None
    return kept
