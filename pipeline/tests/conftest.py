"""Test fixtures."""

import math
import subprocess
from collections.abc import Callable
from pathlib import Path

import numpy as np
import parselmouth
import pytest

_RATE = 24000


def _syllable(
    start: float, end: float, hertz: Callable[[float], float], samples: np.ndarray
) -> None:
    """Add a voiced syllable to ``samples``: a buzz whose pitch follows ``hertz(fraction)``."""
    first, last = int(start * _RATE), int(end * _RATE)
    phase = 0.0
    for i in range(first, last):
        f = (i - first) / (last - first)
        phase += 2 * math.pi * hertz(f) / _RATE
        ramp = min(1.0, f / 0.1, (1 - f) / 0.1)
        samples[i] = ramp * sum(math.sin(k * phase) / k for k in range(1, 8)) * 0.3


@pytest.fixture
def two_syllables() -> Callable[[Path], Path]:
    """Write a synthetic two-syllable recording to an .mp3 path, the format the pipeline reads.

    The first syllable rises from 150 to 250 Hz; after a 0.1 s unvoiced gap, the second holds
    300 Hz. Generated rather than taken from web/public/audio, which is not in the repository.
    """

    def write(path: Path) -> Path:
        samples = np.zeros(int(1.0 * _RATE))
        _syllable(0.15, 0.45, lambda f: 150 + 100 * f, samples)
        _syllable(0.55, 0.90, lambda f: 300.0, samples)
        wav = path.with_suffix(".wav")
        parselmouth.Sound(samples, sampling_frequency=_RATE).save(str(wav), "WAV")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-b:a", "48k", str(path)],
            check=True,
        )
        wav.unlink()
        return path

    return write
