"""Pinyin parsing: tone marks, syllable segmentation, and tone sandhi.

Syllables are lowercase toneless strings in CC-CEDICT spelling (``u:`` for ü).
Tones are integers 1-4, with 5 for the neutral tone.
"""

import itertools
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

NEUTRAL = 5

_COMBINING_TONES = {"̄": 1, "́": 2, "̌": 3, "̀": 4}
_DIAERESIS = "̈"
_TONE_MARKS = {1: "̄", 2: "́", 3: "̌", 4: "̀"}


@dataclass(frozen=True)
class PrintedWord:
    """A disyllabic item as printed in a homework book."""

    text: str
    syllables: tuple[str, ...]
    # Citation tones when the item is printed with tone marks; None when printed without.
    tones: tuple[int, ...] | None

    @property
    def key(self) -> str:
        return " ".join(self.syllables)


def _letters_with_tones(text: str) -> list[tuple[str, int | None]]:
    """Split text into base letters, each paired with the tone its mark carries (if any)."""
    letters: list[tuple[str, int | None]] = []
    for ch in unicodedata.normalize("NFD", text.lower()):
        if ch in _COMBINING_TONES:
            base, _ = letters[-1]
            letters[-1] = (base, _COMBINING_TONES[ch])
        elif ch == _DIAERESIS:
            base, tone = letters[-1]
            letters[-1] = ("u:" if base == "u" else base, tone)
        else:
            letters.append((ch, None))
    return letters


def segment(chunk: str, valid: frozenset[str]) -> list[list[str]]:
    """Every way to split a toneless chunk into valid syllables."""
    if not chunk:
        return [[]]
    results: list[list[str]] = []
    for end in range(1, len(chunk) + 1):
        head = chunk[:end]
        if head in valid:
            results.extend([head, *rest] for rest in segment(chunk[end:], valid))
    return results


def parse_printed(text: str, valid: frozenset[str]) -> PrintedWord:
    """Parse a printed item such as ``shíjiān``, ``mén hòu`` or ``fangjian``.

    Raises ValueError unless the item splits into exactly two syllables in exactly one way.
    """
    chunks = [_letters_with_tones(c) for c in text.replace("'", " ").replace("’", " ").split()]
    splits = [
        combo
        for combo in itertools.product(
            *(segment("".join(base for base, _ in letters), valid) for letters in chunks)
        )
        if sum(len(part) for part in combo) == 2
    ]
    if len(splits) != 1:
        raise ValueError(f"{text!r}: {len(splits)} ways to read it as two syllables")
    syllables: list[str] = []
    tones: list[int] = []
    marked = False
    for letters, parts in zip(chunks, splits[0], strict=True):
        offset = 0
        for syl in parts:
            # Each letter contributes len(base) characters ("u:" counts as two).
            span: list[tuple[str, int | None]] = []
            consumed = 0
            while consumed < len(syl):
                base, tone = letters[offset]
                span.append((base, tone))
                consumed += len(base)
                offset += 1
            syl_tones = [t for _, t in span if t is not None]
            if len(syl_tones) > 1:
                raise ValueError(f"{text!r}: syllable {syl!r} has two tone marks")
            if syl_tones:
                marked = True
            syllables.append(syl)
            tones.append(syl_tones[0] if syl_tones else NEUTRAL)
    printed_tones = tuple(tones) if marked else None
    return PrintedWord(text=text, syllables=tuple(syllables), tones=printed_tones)


def spoken_tones(hanzi: str, tones: Sequence[int]) -> tuple[int, ...]:
    """Apply the tone changes a listener hears in a two-syllable word.

    - Two third tones: the first is said as a second tone (你好 → ní hǎo).
    - 不 before a fourth tone is said as a second tone (不是 → bú shì).
    - 一 at the start is said as a fourth tone before tones 1-3 and a second tone before
      tone 4 (一天 → yì tiān, 一次 → yí cì), except in dates and counting (一月, 一号, 一一).
    """
    first, second = tones
    if first == 3 and second == 3:
        return (2, 3)
    if hanzi[0] == "不" and first == 4 and second == 4:
        return (2, 4)
    if hanzi[0] == "一" and first == 1 and hanzi[1] not in "月号一":
        if second == 4:
            return (2, second)
        if second in (1, 2, 3):
            return (4, second)
    return (first, second)


def mark(syllable: str, tone: int) -> str:
    """Write one syllable with its tone mark (``jian``, 1 → ``jiān``)."""
    text = syllable.replace("u:", "ü")
    if tone == NEUTRAL:
        return text
    lowered = text.lower()
    for vowel in ("a", "e"):
        if vowel in lowered:
            index = lowered.index(vowel)
            break
    else:
        if "ou" in lowered:
            index = lowered.index("o")
        else:
            index = max(i for i, ch in enumerate(lowered) if ch in "aeiouü")
    return unicodedata.normalize("NFC", text[: index + 1] + _TONE_MARKS[tone] + text[index + 1 :])


def marked_word(syllables: Iterable[str], tones: Iterable[int]) -> str:
    """Write a word with tone marks, adding the apostrophe before a/e/o-initial syllables."""
    parts: list[str] = []
    for syllable, tone in zip(syllables, tones, strict=True):
        if parts and syllable[0] in "aeo":
            parts.append("'")
        parts.append(mark(syllable, tone))
    return "".join(parts)
