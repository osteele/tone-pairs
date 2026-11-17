"""Synthesize each drill word in several voices with Microsoft Edge's online TTS."""

import asyncio
from dataclasses import dataclass
from pathlib import Path

import aiohttp
import edge_tts

from .families import Word


@dataclass(frozen=True)
class Voice:
    key: str
    name: str
    label: str
    # Pitch search range in Hz, for finding the voiced span of a recording.
    pitch_floor: float
    pitch_ceiling: float


# Two women and two men, so that the drill does not train one speaker's pitch range.
VOICES = (
    Voice("xiaoxiao", "zh-CN-XiaoxiaoNeural", "Xiaoxiao (F)", 100, 500),
    Voice("yunxi", "zh-CN-YunxiNeural", "Yunxi (M)", 60, 300),
    Voice("xiaoyi", "zh-CN-XiaoyiNeural", "Xiaoyi (F)", 100, 500),
    Voice("yunjian", "zh-CN-YunjianNeural", "Yunjian (M)", 60, 300),
)

_CONCURRENCY = 4
_ATTEMPTS = 6
_BACKOFF_SECONDS = 5


def filename(word: Word, voice: Voice) -> str:
    return f"{word.id}-{voice.key}.mp3"


async def _synthesize(text: str, voice: Voice, path: Path, gate: asyncio.Semaphore) -> None:
    async with gate:
        partial = path.with_suffix(".partial")
        for attempt in range(_ATTEMPTS):
            try:
                await edge_tts.Communicate(text, voice.name).save(str(partial))
                break
            except (aiohttp.WSServerHandshakeError, edge_tts.exceptions.NoAudioReceived):
                # After a burst of requests the service refuses connections, or answers
                # without audio, for a while.
                if attempt == _ATTEMPTS - 1:
                    partial.unlink(missing_ok=True)
                    raise
                await asyncio.sleep(_BACKOFF_SECONDS * 2**attempt)
        partial.rename(path)


async def _synthesize_all(jobs: list[tuple[str, Voice, Path]]) -> None:
    gate = asyncio.Semaphore(_CONCURRENCY)
    await asyncio.gather(*(_synthesize(text, voice, path, gate) for text, voice, path in jobs))


def synthesize(words: list[Word], directory: Path) -> int:
    """Write any missing recordings; return how many were created."""
    directory.mkdir(parents=True, exist_ok=True)
    jobs = [
        (word.hanzi, voice, directory / filename(word, voice))
        for word in words
        for voice in VOICES
        if not (directory / filename(word, voice)).exists()
    ]
    asyncio.run(_synthesize_all(jobs))
    return len(jobs)
