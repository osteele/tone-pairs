"""Homework transcripts and hand-entered extra words."""

import re
from dataclasses import dataclass
from pathlib import Path

from wordfreq import get_frequency_dict

from .families import Word, zipf
from .pinyin import PrintedWord, parse_printed, spoken_tones

_QUESTION = re.compile(r"^(\d+)\.\s+(.+)$")
_STEM = re.compile(r"^hsk(\d+)-(\d+)$")


@dataclass(frozen=True)
class Exercise:
    id: str
    title: str
    items: list[PrintedWord]


def title_for(stem: str) -> str:
    match = _STEM.match(stem)
    if not match:
        return stem
    return f"HSK {int(match.group(1))} · Lesson {int(match.group(2))}"


def read_exercise(path: Path, valid: frozenset[str]) -> Exercise:
    """Read ``<n>. <option> / <option>`` lines; ``#`` starts a comment."""
    items: list[PrintedWord] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        match = _QUESTION.match(line)
        if not match:
            raise ValueError(f"{path}:{number}: expected '<n>. <option> / <option>'")
        for option in match.group(2).split("/"):
            items.append(parse_printed(option.strip(), valid))
    return Exercise(id=path.stem, title=title_for(path.stem), items=items)


def read_extra_words(path: Path) -> dict[str, list[Word]]:
    """Read ``hanzi<TAB>numbered pinyin<TAB>gloss`` lines for phrases the dictionary lacks."""
    frequencies = get_frequency_dict("zh")
    extras: dict[str, list[Word]] = {}
    if not path.exists():
        return extras
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        hanzi, reading, text = (part.strip() for part in line.split("\t"))
        syllables = tuple(token[:-1] for token in reading.split())
        tones = tuple(int(token[-1]) for token in reading.split())
        word = Word(
            hanzi=hanzi,
            syllables=syllables,
            tones=tones,
            spoken=spoken_tones(hanzi, tones),
            gloss=text,
            zipf=zipf(frequencies, hanzi),
        )
        extras.setdefault(" ".join(syllables), []).append(word)
    return extras
