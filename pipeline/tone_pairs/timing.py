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


def track(
    sound: parselmouth.Sound,
    pitch_floor: float,
    pitch_ceiling: float,
    bounds: Timing,
    span: tuple[float, float],
) -> list[list[int | None]]:
    """Measured pitch at evenly spaced points through each syllable, in tenths of a level on
    the five-level scale (35 is level 3.5): finer than the staff can show, and compact as JSON.

    ``span`` gives the voice's low and high pitch, in semitones above 100 Hz, as levels 1 and 5
    (resynthesis.voice_range). Unvoiced points are None.
    """
    pitch = sound.to_pitch_ac(
        time_step=_STEP,
        pitch_floor=pitch_floor,
        pitch_ceiling=pitch_ceiling,
        voicing_threshold=_VOICING_THRESHOLD,
    )
    low, high = span
    syllables: list[list[int | None]] = []
    for start, end in ((bounds.start, bounds.split), (bounds.split, bounds.end)):
        points: list[int | None] = []
        for k in range(_TRACK_POINTS):
            hertz = pitch.get_value_at_time(start + (k + 0.5) / _TRACK_POINTS * (end - start))
            if math.isnan(hertz):
                points.append(None)
            else:
                semitones = 12 * math.log2(hertz / 100)
                level = 1 + 4 * (semitones - low) / (high - low)
                points.append(round(level * 10))
        syllables.append(points)
    return syllables
