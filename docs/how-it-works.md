# How Tone Pairs works

How the drill's words, recordings, and pitch graphs are made, and how answers
are graded. For using the drill, see the [README](../README.md).

## Families

Every toneless pinyin in the workbook's pronunciation exercises (`shi jian`,
`pi jiu`, …) becomes a *family*: words that share its syllables but differ in
tone. Drilling the whole family means the answer cannot be recalled from the
workbook, since the printed word is only one of several with those syllables.

Real words come first (时间 shíjiān, 实践 shíjiàn, 事件 shìjiàn), taken from
CC-CEDICT and ranked by frequency. Most syllable pairs have only one common
word, so families are filled to four tone patterns with *pseudo-words*: two
common characters, each with a single dictionary reading, whose tones give the
missing pattern (the feedback labels them "not a word"). The added patterns
change one syllable's tone at a time, in the order learners most often confuse
tones. Characters with more than one reading are never used, since a speech
synthesizer given them might say either.

## Recordings

Every word is synthesized in four voices, two women and two men, so the drill
does not train one speaker's pitch range.

An answer usually names a tone pattern that no drill word has, and the feedback
should still be able to play it. So each family also has a recording of every
other tone pattern, used only for comparisons: the most common real word with
that pattern, or else a pseudo-word. A pattern with a third tone may use rarer
characters, because a spoken third tone often ends in creaky voice, which the
next method cannot produce.

Any pattern still missing is made by *re-pitching* another recording of the
family in the same voice, with Praat's overlap-add resynthesis. The source is
the recording that differs from the pattern in the fewest syllables, preferring
a real word. Only the syllable whose tone differs is changed: it is given the
textbook contour, spread across the voice's measured pitch range, and the other
syllable keeps its recorded pitch, creak included. Patterns ending in a neutral
tone are recorded only from real words, since a neutral syllable is too short to
re-pitch. Between them, these cover about 98% of the answers without a neutral
tone.

## Pitch graphs

The staff uses the five-level pitch scale, 1 low to 5 high. The bold line is
the textbook contour, drawn as the course draws it: first tone 55, second 35,
fourth 51, and the third tone a low dip, 212 at the end of a word and 21 before
another syllable, rather than the full 214 of a third tone said alone. A neutral
tone is a short pitch set by the tone before it. A dotted line joins the two
syllables, showing how the pitch moves from one into the next.

The thin dark line, drawn over the contour, is the pitch measured in the
recording with Praat, mapped onto the same scale: each voice's 5th and 95th percentile pitch, over a sample of its
recordings, are levels 1 and 5. The measured line is often flatter than the
textbook one, and differs from it in ways worth hearing: before another
syllable, a second tone may rise only a little, and a final third tone may fall
rather than dip. It breaks wherever the recording has no pitch: voiceless
consonants (s, sh, x, f, h, p, t, k, and the like) are made without vibrating
the vocal folds, and the creaky bottom of a third tone often defeats the pitch
tracker.

Each recording's timing (where speech starts, where the syllables divide, and
where it ends) is measured too, to move the dot along the contour as it plays
and to trim the silence after the word when two are played in a row.

## Grading

An answer is right if it matches the tones as the word is said, after tone
sandhi: third-tone sandhi (你好, written 3-3, said 2-3) and the tone changes of
一 and 不. The tones as written are also accepted, unless another word in the
family is said that way, in which case that answer would name the other word.

A word said 2-3 accepts both 2-3 and 3-3, whatever its written tones, because
the two sound the same: the drill tests listening, not how a word is written.
The feedback for either answer is the same. An answer of 3-3 is drawn, and
matched to a recording, as it is said, 2-3.

## Scheduling

Words are scheduled by FSRS, a spaced-repetition algorithm, through
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs). Each answer is
graded only as right or wrong: a wrong answer brings the word back within
minutes, through learning steps of 1 and 10 minutes, and a right one schedules
it days ahead. New words are introduced a family at a time, up to the daily
limit. A right answer moves on by itself only in extra practice or for a word
past its learning steps.
