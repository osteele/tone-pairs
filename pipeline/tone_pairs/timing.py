"""Where speech starts, where the syllables divide, and where speech ends, in each recording.

The app draws idealized tone contours, not measured pitch; these times only pace the
animation along the contour and trim trailing silence when clips play back to back.
"""

from dataclasses import dataclass
from pathlib import Path

import parselmouth

_STEP = 0.01
# Below Praat's default (0.45), so the creaky low part of a third tone counts as voiced.
_VOICING_THRESHOLD = 0.3


@dataclass(frozen=True)
class Timing:
    start: float
    split: float
    end: float


def measure(path: Path, pitch_floor: float, pitch_ceiling: float) -> Timing:
    """Voiced span of a two-syllable clip, split at the widest voicing gap near its middle.

    Without a gap (a voiced initial such as m, n, l, r), the split is the intensity minimum
    in the middle of the span.
    """
    sound = parselmouth.Sound(str(path))
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
        raise ValueError(f"{path}: no voiced frames")
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
