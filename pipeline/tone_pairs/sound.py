"""Decoding, trimming, and encoding recordings.

A recording is decoded once, by ffmpeg, to samples; trimmed, re-pitched, and measured as
samples; and encoded once, as AAC in an MP4 container (.m4a). MP3 has no reliable way to say
where the audio begins: encoders pad its start, and decoders disagree about how much to skip,
so a clip trimmed to its first sound would still start with tens of milliseconds of padding,
by an amount that depends on the decoder. MP4 records the padding in an edit list, which
browsers honour, so playback starts at the first sample of the trimmed audio and the times
measured here are the times the listener hears.
"""

import subprocess
from pathlib import Path

import numpy as np
import parselmouth

RATE = 24000
_BITRATE = "48k"
# Sound this far below the clip's loudest moment counts as silence. Each synthesized clip
# opens with digital silence, then a decoder ramp-up, then a plateau of background noise at
# about 45 to 60 dB below the peak, and only then speech. A soft fricative (the f of fā, the
# h of hē) rises out of that plateau at 45 to 35 dB below the peak, as loud as the plateau's
# noisiest moments in some voices, so no threshold separates noise from speech reliably.
# The cut is made where the plateau begins, which removes the silence and the ramp and
# cannot reach a consonant.
_SILENCE_DB = 70.0
# Frame for measuring loudness: 2.5 ms.
_FRAME = RATE // 400
# Silence kept before the first sound: enough not to clip the attack of a consonant.
KEEP_SECONDS = 0.02


def decode(path: Path) -> parselmouth.Sound:
    """The recording as mono samples at RATE."""
    result = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE)]
        + ["-f", "f32le", "-"],
        check=True,
        capture_output=True,
    )
    return parselmouth.Sound(np.frombuffer(result.stdout, dtype="<f4"), sampling_frequency=RATE)


def onset(sound: parselmouth.Sound) -> float:
    """Seconds into the recording at which its first sound starts.

    Placed by loudness rather than voicing, so a voiceless initial (the sh of shí) counts.
    Loudness is the RMS of short frames taken straight from the samples: Praat's intensity
    analysis uses windows tens of milliseconds wide, so it reports a sound that begins near
    the start of the clip late.
    """
    samples = sound.values[0]
    frames = len(samples) // _FRAME
    rms = np.sqrt((samples[: frames * _FRAME].reshape(frames, _FRAME) ** 2).mean(axis=1))
    loud = 20 * np.log10(rms + 1e-12)
    first = int(np.argmax(loud > loud.max() - _SILENCE_DB))
    return first * _FRAME / sound.sampling_frequency


def trim(sound: parselmouth.Sound) -> parselmouth.Sound:
    """The recording from just before its first sound: the synthesizer opens every clip with
    0.1 to 0.2 s of silence, heard as a lag after tapping Play."""
    start = max(0.0, onset(sound) - KEEP_SECONDS)
    return sound.extract_part(from_time=start, to_time=sound.xmax, preserve_times=False)


def encode(sound: parselmouth.Sound, path: Path) -> None:
    """Write the samples as AAC in MP4, replacing the file only once it is complete."""
    samples = np.asarray(sound.values[0], dtype="<f4")
    partial = path.with_name(f"{path.stem}.partial.m4a")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ac", "1", "-ar", str(RATE)]
        + ["-i", "-", "-c:a", "aac", "-b:a", _BITRATE, str(partial)],
        input=samples.tobytes(),
        check=True,
    )
    partial.rename(path)
