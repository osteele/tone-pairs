import math

import parselmouth
import pytest
from tone_pairs import resynthesis, timing, tts
from tone_pairs.cedict import parse_line
from tone_pairs.families import (
    Character,
    Family,
    Word,
    add_contrasts,
    choose,
    fill,
    gloss,
    neighbors,
)
from tone_pairs.homework import read_exercise
from tone_pairs.pinyin import marked_word, parse_printed, spoken_tones

VALID = frozenset(
    ["shi", "jian", "ji", "an", "fang", "men", "hui", "jia", "yi", "ci", "lu:e", "hou"]
)


@pytest.mark.parametrize(
    ("text", "syllables", "tones"),
    [
        ("shíjiān", ("shi", "jian"), (2, 1)),
        ("mén hòu", ("men", "hou"), (2, 4)),
        ("fangjian", ("fang", "jian"), None),
        ("shijian", ("shi", "jian"), None),
        ("hui jia", ("hui", "jia"), None),
        ("shíhou", ("shi", "hou"), (2, 5)),
    ],
)
def test_parse_printed(text, syllables, tones):
    printed = parse_printed(text, VALID)
    assert printed.syllables == syllables
    assert printed.tones == tones


def test_parse_printed_rejects_ambiguous_or_long_items():
    with pytest.raises(ValueError):
        parse_printed("shijianji", VALID)


@pytest.mark.parametrize(
    ("hanzi", "tones", "spoken"),
    [
        ("你好", (3, 3), (2, 3)),
        ("不是", (4, 4), (2, 4)),
        ("一次", (1, 4), (2, 4)),
        ("一天", (1, 1), (4, 1)),
        ("一月", (1, 4), (1, 4)),
        ("时间", (2, 1), (2, 1)),
    ],
)
def test_spoken_tones(hanzi, tones, spoken):
    assert spoken_tones(hanzi, tones) == spoken


def test_marked_word():
    assert marked_word(("shi", "jian"), (2, 1)) == "shíjiān"
    assert marked_word(("pi", "ao"), (2, 3)) == "pí'ǎo"
    assert marked_word(("lu:e",), (4,)) == "lüè"


def test_parse_line_skips_proper_nouns():
    assert parse_line("北京 北京 [Bei3 jing1] /Beijing/") is None
    entry = parse_line("時間 时间 [shi2 jian1] /time/")
    assert entry is not None
    assert (entry.simplified, entry.tones) == ("时间", (2, 1))


def test_gloss_drops_classifiers_and_variant_notes():
    assert gloss(["door (CL:扇[shan4])", "variant of 门"]) == "door"
    assert gloss(["(bound form) time"]) == "time"


def test_neighbors_change_one_tone_and_skip_double_third():
    result = neighbors((2, 3))
    assert all(sum(a != b for a, b in zip(p, (2, 3), strict=True)) == 1 for p in result)
    assert (3, 3) not in result
    # 2→3 on the first syllable would give 3-3, so the first change is 3→2 on the second.
    assert result[0] == (2, 2)
    # A neutral second tone is replaced by a full tone in pseudo-word patterns.
    assert all(5 not in p for p in neighbors((2, 5)))


def _word(hanzi, tones, zipf=4.0, real=True):
    return Word(hanzi, ("shi", "jian"), tones, spoken_tones(hanzi, tones), "g", zipf, real)


def test_words_with_the_same_reading_have_distinct_ids_and_recordings():
    # 一次 and 依次 are both written yi1 ci4.
    yici = Word("一次", ("yi", "ci"), (1, 4), (2, 4), "once", 5.0)
    yici2 = Word("依次", ("yi", "ci"), (1, 4), (1, 4), "in order", 4.0)
    assert yici.id != yici2.id
    assert yici.id.startswith("yi1ci4-")
    voice = tts.VOICES[0]
    assert tts.filename(yici, voice) != tts.filename(yici2, voice)
    # Recordings keep the names they were synthesized under.
    assert tts.filename(_word("时间", (2, 1)), voice) == "shi2jian1-89b4aa-xiaoxiao.mp3"


def test_recording_version_changes_when_the_recording_does(tmp_path):
    path = tmp_path / "clip.mp3"
    path.write_bytes(b"first")
    first = tts.version(path)
    assert tts.version(path) == first
    path.write_bytes(b"second")
    assert tts.version(path) != first


def test_a_lesson_with_nothing_to_drill_is_still_an_exercise(tmp_path):
    path = tmp_path / "hsk1-05.txt"
    path.write_text("# No two-syllable items in this lesson.\n", encoding="utf-8")
    exercise = read_exercise(path, VALID)
    assert exercise.title == "HSK 1 · Lesson 5"
    assert exercise.items == []


def test_choose_puts_printed_tones_first_and_keeps_patterns_distinct():
    pool = [_word("世间", (4, 1), 4.0), _word("时间", (2, 1), 5.9), _word("视奸", (4, 1), 3.5)]
    printed = parse_printed("shìjiān", VALID)
    chosen, warnings = choose(printed, pool, [])
    assert [w.hanzi for w in chosen] == ["世间", "时间"]
    assert warnings == []


def test_choose_matches_tones_printed_as_spoken():
    # The textbook prints 一起 (yī qǐ) as said: yìqǐ.
    yiqi = Word("一起", ("yi", "qi"), (1, 3), spoken_tones("一起", (1, 3)), "together", 5.7)
    yiqi2 = Word("仪器", ("yi", "qi"), (2, 4), (2, 4), "instrument", 4.4)
    chosen, warnings = choose(parse_printed("yìqǐ", VALID | {"qi"}), [yiqi2, yiqi], [])
    assert chosen[0] is yiqi
    assert warnings == []


def test_fill_adds_pseudo_words_for_missing_patterns():
    family = Family(syllables=("shi", "jian"), words=[_word("时间", (2, 1))])
    chars = {
        ("shi", 3): Character("使", "to make", 5.0),
        ("shi", 1): Character("师", "teacher", 5.0),
        ("jian", 2): Character("坚", "hard", 4.0),
        ("jian", 1): Character("间", "between", 5.0),
    }
    fill(family, chars)
    patterns = [w.tones for w in family.words]
    assert patterns[0] == (2, 1)
    assert set(patterns[1:]) <= {(3, 1), (2, 2), (1, 1)}
    assert len(set(w.spoken for w in family.words)) == len(family.words)
    assert all(not w.real for w in family.words[1:])


def test_fill_falls_back_to_rare_characters_only_for_a_single_pattern_family():
    rare = {("shi", 3): Character("豕", "swine", 2.6), ("jian", 1): Character("湔", "wash", 2.6)}
    lonely = Family(syllables=("shi", "jian"), words=[_word("时间", (2, 1))])
    fill(lonely, {}, rare)
    assert [(w.hanzi, w.tones) for w in lonely.words[1:]] == [("豕湔", (3, 1))]
    assert lonely.warnings == []

    common = {
        ("shi", 4): Character("事", "matter", 5.0),
        ("jian", 1): Character("间", "between", 5.0),
    }
    paired = Family(syllables=("shi", "jian"), words=[_word("时间", (2, 1))])
    fill(paired, common, rare)
    assert all("豕" not in w.hanzi and "湔" not in w.hanzi for w in paired.words)


def test_contrasts_cover_other_patterns_preferring_real_words():
    family = Family(syllables=("shi", "jian"), words=[_word("时间", (2, 1))])
    pool = [_word("时间", (2, 1)), _word("实践", (2, 4), zipf=1.0), _word("时候", (2, 5))]
    chars = {
        ("shi", 2): Character("时", "time", 5.0),
        ("shi", 4): Character("事", "matter", 5.0),
        ("jian", 4): Character("件", "item", 5.0),
        ("jian", 1): Character("间", "between", 5.0),
    }
    add_contrasts(family, pool, chars)
    by_pattern = {w.spoken: w for w in family.contrasts}
    # A rare real word beats a pseudo-word; the drill word's own pattern is not repeated.
    assert by_pattern[(2, 4)].hanzi == "实践"
    assert (2, 1) not in by_pattern
    # Pseudo-words fill full-tone patterns whose characters exist.
    assert by_pattern[(4, 1)].hanzi == "事间" and not by_pattern[(4, 1)].real
    # Neutral-tone patterns come only from real words.
    assert by_pattern[(2, 5)].real
    assert set(by_pattern) == {(2, 4), (4, 1), (4, 4), (2, 5)}


def test_rare_characters_fill_only_third_tone_contrasts():
    family = Family(syllables=("shi", "jian"), words=[_word("时间", (2, 1))])
    chars = {("shi", 2): Character("时", "time", 5.0), ("jian", 1): Character("间", "between", 5.0)}
    rare = {
        **chars,
        ("shi", 3): Character("豕", "pig", 1.5),
        ("jian", 4): Character("涧", "ravine", 1.5),
    }
    add_contrasts(family, [], chars, rare)
    by_pattern = {w.spoken: w.hanzi for w in family.contrasts}
    assert by_pattern[(3, 1)] == "豕间"
    # 时涧 (2, 4) has no third tone, so it is left for resynthesis.
    assert (2, 4) not in by_pattern


def test_resynthesis_sources_differ_in_fewest_syllables_and_prefer_real_words():
    family = Family(
        syllables=("shi", "jian"),
        words=[_word("时间", (2, 1)), _word("事件", (4, 4))],
        contrasts=[_word("十件", (2, 4), real=False), _word("时候", (2, 5))],
    )
    plans = {p.pattern: p for p in resynthesis.plan([family])}
    assert (2, 1) not in plans and (4, 4) not in plans and (2, 4) not in plans
    # (2, 2) is one syllable from 时间 and from 十件; the real word wins.
    assert plans[(2, 2)].source.hanzi == "时间"
    # (1, 4) is one syllable from 事件 only.
    assert plans[(1, 4)].source.hanzi == "事件"
    # A neutral-tone recording is never a source, and 3-3 is not a spoken answer.
    assert all(p.source.hanzi != "时候" for p in plans.values())
    assert (3, 3) not in plans
    made = plans[(2, 2)].word
    assert made.id == f"shi2jian2-from-{plans[(2, 2)].source.id}"
    assert not made.real and made.source is not None


def test_level_at_matches_the_app_contour_model():
    assert resynthesis.level_at((5, 1), 0) == 5
    assert resynthesis.level_at((5, 1), 0.5) == pytest.approx(3)
    assert resynthesis.level_at((2, 1, 2), 1) == 2
    assert resynthesis.syllable_levels(3, 2, last=True) == (2, 1, 2)
    assert resynthesis.syllable_levels(3, None, last=False) == (2, 1, 1)


def _thirds(path, voice, start, end):
    """Mean pitch, in semitones above 100 Hz, of the first and last thirds of a span."""
    pitch = parselmouth.Sound(str(path)).to_pitch_ac(
        pitch_floor=voice.pitch_floor, pitch_ceiling=voice.pitch_ceiling
    )
    voiced = [
        12 * math.log2(f / 100)
        for t, f in zip(pitch.xs(), pitch.selected_array["frequency"], strict=True)
        if start <= t <= end and f > 0
    ]
    n = len(voiced) // 3
    return sum(voiced[:n]) / n, sum(voiced[-n:]) / n


def test_resynthesis_reshapes_only_the_changed_syllable(tmp_path, two_syllables):
    source = _word("时间", (2, 1))
    voice = tts.VOICES[0]
    original = tmp_path / tts.filename(source, voice)
    two_syllables(original)
    family = Family(syllables=("shi", "jian"), words=[source])
    plan = next(p for p in resynthesis.plan([family]) if p.pattern == (2, 4))
    assert resynthesis.render(plan, voice, tmp_path, span=(10.0, 21.0))

    made = tmp_path / tts.filename(plan.word, voice)
    before = timing.measure(original, voice.pitch_floor, voice.pitch_ceiling)
    after = timing.measure(made, voice.pitch_floor, voice.pitch_ceiling)
    # The second syllable, level in the source, now falls by several semitones.
    first, last = _thirds(made, voice, after.split, after.end)
    assert first - last > 4
    # The first syllable keeps its recorded pitch.
    kept = _thirds(made, voice, after.start, after.split)
    recorded = _thirds(original, voice, before.start, before.split)
    assert kept == pytest.approx(recorded, abs=1.0)


def test_track_measures_each_syllable_on_the_five_level_scale(tmp_path, two_syllables):
    voice = tts.VOICES[0]
    path = two_syllables(tmp_path / "clip.mp3")
    bounds = timing.measure(path, voice.pitch_floor, voice.pitch_ceiling)
    first, second = timing.track(path, voice.pitch_floor, voice.pitch_ceiling, bounds, (10.0, 21.0))
    assert len(first) == len(second) == 16
    voiced = [tenths / 10 for tenths in second if tenths is not None]
    # The second syllable holds 300 Hz: high and level.
    assert len(voiced) > 8
    assert min(voiced) > 3.5
    assert max(voiced) - min(voiced) < 1.0
    # A wider assumed range puts the same pitch lower on the scale.
    _, wider = timing.track(path, voice.pitch_floor, voice.pitch_ceiling, bounds, (10.0, 30.0))
    assert max(v for v in wider if v is not None) / 10 < max(voiced)
