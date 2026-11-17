"""CC-CEDICT loading."""

import gzip
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"

_LINE = re.compile(r"^(\S+) (\S+) \[([^\]]+)\] /(.*)/$")
_SYLLABLE = re.compile(r"^([a-z:]+)([1-5])$")


@dataclass(frozen=True)
class Entry:
    simplified: str
    syllables: tuple[str, ...]
    tones: tuple[int, ...]
    definitions: tuple[str, ...]

    @property
    def key(self) -> str:
        return " ".join(self.syllables)


def ensure_downloaded(path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".partial")
        urllib.request.urlretrieve(CEDICT_URL, partial)
        partial.rename(path)
    return path


def parse_line(line: str) -> Entry | None:
    """Parse one dictionary line; None for comments, proper nouns, and non-syllabic readings."""
    match = _LINE.match(line.rstrip("\n"))
    if not match:
        return None
    _traditional, simplified, reading, defs = match.groups()
    syllables: list[str] = []
    tones: list[int] = []
    for token in reading.split():
        # Capitalized readings mark proper nouns; letters and punctuation have no tone digit.
        syllable = _SYLLABLE.match(token)
        if not syllable:
            return None
        syllables.append(syllable.group(1))
        tones.append(int(syllable.group(2)))
    return Entry(simplified, tuple(syllables), tuple(tones), tuple(defs.split("/")))


def load(path: Path) -> list[Entry]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [entry for line in f if (entry := parse_line(line))]
