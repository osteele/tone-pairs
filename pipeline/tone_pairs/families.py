"""Choose, for each printed homework item, words with the same syllables and different tones.

A *family* is every drill word that shares one toneless syllable sequence (``shi jian``:
时间 shíjiān, 实践 shíjiàn, 事件 shìjiàn, ...). Every family holds several spoken tone
patterns, so naming the tones of a recording cannot be answered from memory of the homework.

Real words come first. Most disyllables have no common real word for other tone patterns
(年轻 is the only common *nian qing*), so families are filled with pseudo-words: two common
characters, each with a single dictionary reading, whose tones give the missing pattern.
"""

import hashlib
import math
import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from .cedict import Entry
from .pinyin import NEUTRAL, PrintedWord, mark, marked_word, spoken_tones

FAMILY_SIZE = 4
MIN_ZIPF = 3.0
FALLBACK_ZIPF = 2.0
# Pseudo-word characters must be at least this common as standalone tokens.
MIN_CHAR_ZIPF = 3.5
# Contrast recordings (heard only when comparing a wrong answer) may use rarer characters.
CONTRAST_CHAR_ZIPF = 2.5

# Every spoken pattern a two-syllable answer can name. Written 3-3 is said 2-3.
ALL_PATTERNS: tuple[tuple[int, int], ...] = tuple(
    (a, b) for a in range(1, 5) for b in range(1, 6) if (a, b) != (3, 3)
)

# Replacement tones in order of how often learners confuse them with the original.
CONFUSABLE = {1: (2, 4, 3), 2: (3, 1, 4), 3: (2, 4, 1), 4: (1, 3, 2)}

_NON_GLOSS_PREFIXES = (
    "variant of",
    "old variant of",
    "surname ",
    "used in ",
    "see ",
    "CL:",
    "abbr. for",
    "Japanese variant",
)

Pattern = tuple[int, ...]


@dataclass(frozen=True)
class Word:
    hanzi: str
    syllables: tuple[str, ...]
    tones: Pattern
    spoken: Pattern
    gloss: str
    zipf: float
    real: bool = True

    @property
    def pinyin(self) -> str:
        return marked_word(self.syllables, self.tones)

    @property
    def id(self) -> str:
        """Tone-numbered pinyin plus a digest of the hanzi: 一次 and 依次 are both yi1ci4."""
        pairs = zip(self.syllables, self.tones, strict=True)
        numbered = "".join(f"{s.replace('u:', 'v')}{t}" for s, t in pairs)
        return f"{numbered}-{hashlib.sha1(self.hanzi.encode()).hexdigest()[:6]}"


@dataclass(frozen=True)
class Character:
    hanzi: str
    gloss: str
    zipf: float


@dataclass
class Family:
    syllables: tuple[str, ...]
    words: list[Word]
    printed: list[str] = field(default_factory=list)
    exercises: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # Recordings of the family's other tone patterns, played only to compare with an answer.
    contrasts: list[Word] = field(default_factory=list)

    @property
    def key(self) -> str:
        return " ".join(self.syllables)

    @property
    def patterns(self) -> set[Pattern]:
        return {w.spoken for w in self.words}


def zipf(frequencies: Mapping[str, float], hanzi: str) -> float:
    freq = frequencies.get(hanzi, 0.0)
    return round(math.log10(freq * 1e9), 2) if freq else 0.0


_ANNOTATIONS = re.compile(r"\s*\(CL:[^)]*\)|^\((bound form|literary)\)\s*")


def gloss(definitions: Iterable[str], limit: int = 3) -> str:
    cleaned = (_ANNOTATIONS.sub("", d).strip() for d in definitions)
    useful = [d for d in cleaned if d and not d.startswith(_NON_GLOSS_PREFIXES)]
    return "; ".join(useful[:limit])


def candidates(entries: Iterable[Entry], frequencies: Mapping[str, float]) -> dict[str, list[Word]]:
    """All disyllabic dictionary words, grouped by toneless key.

    Words whose characters have more than one reading within the key are dropped: a speech
    synthesizer given the characters may say either reading.
    """
    merged: dict[tuple[str, Pattern], list[Entry]] = defaultdict(list)
    for entry in entries:
        if len(entry.syllables) == 2 and len(entry.simplified) == 2:
            merged[(entry.simplified, entry.tones)].append(entry)

    readings: dict[tuple[str, str], int] = defaultdict(int)
    for (hanzi, _tones), group in merged.items():
        readings[(hanzi, group[0].key)] += 1

    by_key: dict[str, list[Word]] = defaultdict(list)
    for (hanzi, tones), group in merged.items():
        text = gloss(d for e in group for d in e.definitions)
        if readings[(hanzi, group[0].key)] > 1 or not text:
            continue
        by_key[group[0].key].append(
            Word(
                hanzi=hanzi,
                syllables=group[0].syllables,
                tones=tones,
                spoken=spoken_tones(hanzi, tones),
                gloss=text,
                zipf=zipf(frequencies, hanzi),
            )
        )
    return by_key


def characters(
    entries: Iterable[Entry], frequencies: Mapping[str, float], min_zipf: float = MIN_CHAR_ZIPF
) -> dict[tuple[str, int], Character]:
    """The most common single-reading character for each (syllable, tone).

    一 and 不 are excluded because their tone changes with the next syllable.
    """
    by_char: dict[str, list[Entry]] = defaultdict(list)
    for entry in entries:
        if len(entry.simplified) == 1 and len(entry.syllables) == 1:
            by_char[entry.simplified].append(entry)

    best: dict[tuple[str, int], Character] = {}
    for hanzi, group in by_char.items():
        if hanzi in "一不" or len({(e.syllables[0], e.tones[0]) for e in group}) != 1:
            continue
        reading = (group[0].syllables[0], group[0].tones[0])
        text = gloss((d for e in group for d in e.definitions), limit=1)
        score = zipf(frequencies, hanzi)
        if reading[1] == NEUTRAL or not text or score < min_zipf:
            continue
        if reading not in best or score > best[reading].zipf:
            best[reading] = Character(hanzi, text, score)
    return best


def pseudo_word(
    syllables: tuple[str, ...], pattern: Pattern, chars: Mapping[tuple[str, int], Character]
) -> Word | None:
    """Two characters that read as ``pattern``, or None if no suitable character exists."""
    parts = [chars.get((s, t)) for s, t in zip(syllables, pattern, strict=True)]
    if any(p is None for p in parts):
        return None
    found = [p for p in parts if p is not None]
    hanzi = "".join(p.hanzi for p in found)
    return Word(
        hanzi=hanzi,
        syllables=syllables,
        tones=pattern,
        spoken=spoken_tones(hanzi, pattern),
        gloss=" + ".join(
            f"{p.hanzi} {mark(s, t)} “{p.gloss}”"
            for p, s, t in zip(found, syllables, pattern, strict=True)
        ),
        zipf=0.0,
        real=False,
    )


def neighbors(pattern: Pattern) -> list[Pattern]:
    """Patterns that change one syllable's tone, most confusable first, alternating syllables.

    Neutral tones are replaced by full tones: a synthesizer reading two arbitrary characters
    will not produce a neutral tone.
    """
    full = tuple(2 if t == NEUTRAL else t for t in pattern)
    result: list[Pattern] = []
    for rank in range(3):
        for position in range(len(full)):
            tone = CONFUSABLE[full[position]][rank]
            changed = full[:position] + (tone,) + full[position + 1 :]
            # Two written third tones are said as 2-3, which another pattern already covers.
            if changed != (3, 3) and changed not in result:
                result.append(changed)
    return result


def choose(
    printed: PrintedWord, pool: list[Word], extra: list[Word]
) -> tuple[list[Word], list[str]]:
    """Real words with distinct spoken patterns: the printed tones first, then by frequency."""
    warnings: list[str] = []
    everything = sorted([*extra, *pool], key=lambda w: -w.zipf)
    chosen: list[Word] = []

    if printed.tones is not None:
        # Textbooks print 一 and 不 with the tone they are said with (一起 yìqǐ).
        matches = [w for w in everything if printed.tones in (w.tones, w.spoken)]
        if matches:
            chosen.append(matches[0])
        else:
            warnings.append(f"{printed.text}: no dictionary word with the printed tones")

    for threshold in (MIN_ZIPF, FALLBACK_ZIPF):
        for word in everything:
            taken = {w.spoken for w in chosen}
            if (
                len(chosen) < FAMILY_SIZE
                and word.spoken not in taken
                and (word.zipf >= threshold or word in extra)
            ):
                chosen.append(word)
    return chosen, warnings


def fill(
    family: Family,
    chars: Mapping[tuple[str, int], Character],
    rare: Mapping[tuple[str, int], Character] | None = None,
) -> None:
    """Add pseudo-words until the family has FAMILY_SIZE spoken patterns.

    A family left with a single pattern can be answered from memory, so it is filled again
    from ``rare``, characters less common than ``chars``. For *hen hao*, 好 has two readings and
    no common character reads hén, so its pseudo-words use 痕 hén.
    """
    _fill_from(family, chars)
    if rare is not None and len(family.patterns) < 2:
        _fill_from(family, rare)
    if len(family.patterns) < 2:
        family.warnings.append(f"{family.key}: fewer than two tone patterns")


def _fill_from(family: Family, chars: Mapping[tuple[str, int], Character]) -> None:
    for anchor in [w for w in family.words if w.real]:
        for pattern in neighbors(anchor.spoken):
            if len(family.words) >= FAMILY_SIZE:
                return
            if pattern in family.patterns:
                continue
            word = pseudo_word(family.syllables, pattern, chars)
            if word is not None and word.spoken not in family.patterns:
                family.words.append(word)


def add_contrasts(
    family: Family, pool: list[Word], chars: Mapping[tuple[str, int], Character]
) -> None:
    """Record every other spoken pattern: the most common real word, else a pseudo-word.

    Patterns ending in a neutral tone get a recording only from a real word.
    """
    for pattern in ALL_PATTERNS:
        if pattern in family.patterns or pattern in {w.spoken for w in family.contrasts}:
            continue
        real = sorted((w for w in pool if w.spoken == pattern), key=lambda w: -w.zipf)
        word = real[0] if real else None
        if word is None and NEUTRAL not in pattern:
            word = pseudo_word(family.syllables, pattern, chars)
        if word is not None and word.spoken == pattern:
            family.contrasts.append(word)


def build_families(
    items: Iterable[tuple[str, PrintedWord]],
    by_key: Mapping[str, list[Word]],
    extras: Mapping[str, list[Word]],
    chars: Mapping[tuple[str, int], Character],
    contrast_chars: Mapping[tuple[str, int], Character],
) -> list[Family]:
    """Merge every printed item into one family per toneless key, then fill each family."""
    families: dict[str, Family] = {}
    for exercise, printed in items:
        words, warnings = choose(printed, by_key.get(printed.key, []), extras.get(printed.key, []))
        family = families.setdefault(printed.key, Family(syllables=printed.syllables, words=[]))
        family.words.extend(w for w in words if w.spoken not in family.patterns)
        family.printed.append(printed.text)
        if exercise not in family.exercises:
            family.exercises.append(exercise)
        family.warnings.extend(warnings)
    for family in families.values():
        fill(family, chars, contrast_chars)
        pool = [*extras.get(family.key, []), *by_key.get(family.key, [])]
        add_contrasts(family, pool, contrast_chars)
    return list(families.values())
