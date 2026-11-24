# How Tone Pairs works

How the drill's words, recordings, and pitch graphs are made, and how answers
are graded. For using the drill, see the [README](../README.md).

## Families

The words come from the workbook's tone-marking exercises, which print a
two-syllable word without its tones and ask for them by ear. Exercises that
print the tones (choosing which of two words is said, reading aloud) are not
used. Every toneless pinyin in them (`shi jian`, `pi jiu`, …) becomes a
*family*: words that share its syllables but differ in
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
does not train one speaker's pitch range. The voices say some tones differently.
Measured in the recordings, a first tone at the end of a word holds level or
rises a semitone or two in the women's voices (Xiaoxiao, Xiaoyi), and in the
men's often sags two to five semitones (Yunjian more than Yunxi). The readers
in the workbook's own audio mostly hold it level.

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

The thin line, drawn over the contour in a deeper shade of each tone's color,
is the pitch measured in the recording with Praat, placed on the same scale by
the voice's own tones (see [Pitch scales](#pitch-scales)). The measured line is often flatter than the
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

Practice, which does not change the schedule, chooses words by tone pattern:
each pattern, as said, is weighted by how often it was missed in the last 400
answers, smoothed as (misses + 1) / (answers + 2), with a floor of 0.1 so a
pattern answered well still comes up. The weight belongs to the pattern, not
the word, so a pattern often misheard is practiced in every word that has it.

## Say it

Say it records the listener with the phone's microphone and finds the pitch
of each 10 ms of the take with [pitchy](https://github.com/ianprime0509/pitchy).
The take runs from its first voiced moment to its last, and is divided into
syllables at its quietest point near where the recording's syllables divide.
Its pitch is drawn on the same five-level scale as the recordings', set by a
model of the listener's voice that is learned from their takes (see
[Pitch scales](#pitch-scales)).

On an iPhone, playback is much quieter and slower to start while the
microphone is open, so a take ends when the voice falls quiet (or after three
seconds), the microphone is released at once, and anything asked to play ends
the take first.

## Pitch scales

Pitch differs from voice to voice: the lowest voice here centers near 110 Hz
and the highest near 300 Hz. To draw any voice on the five-level scale, its
pitch has to be put in terms of its own range. Phoneticians call this tone
normalization, and its standard methods take the range from the voice's pitch
alone. Fraction of range makes the voice's lowest and highest pitch the ends of
the scale; Shi Feng's T-value does this with log pitch, mapping it onto Chao's
0 to 5. A z-score measures pitch from the voice's mean in units of its standard
deviation, and Rose (1987) found z-scores better than fraction of range at
removing the differences between speakers. Zhu (2004) compared six of these methods on Shanghai
speakers and found z-scores of log pitch best; Zhang (2018), comparing six on
Wu dialect data, found semitones from each speaker's mean best. All of them
place a voice's tones by where its pitch falls, without using which tone each
syllable is.

### The recordings

The recordings are said correctly, so their scale can come from their tones.
For each voice, over a sample of 100 of its recordings, with the tones each
word is said with:

- level 1 is the median of its third tones' lowest points;
- level 5 is midway between the median pitch of its first tones and the median
  start of its fourth tones.

The five-level scale starts a fourth tone at the pitch where a first tone
holds, but speakers often start a fourth tone higher. The two women here start
it a fraction of a semitone above their first tones; the two men start it three
or more semitones above. Setting level 5 midway leaves both near the top of the
staff: the women's first tones at about 4.8, the men's at 4.4 to 5.

The men's fourth tones still begin above 5, so each staff has room above
level 5. The room fits the highest points of 99 in 100 of the voice's recordings,
rounded up to a half level: up to 6.5 and 7 for the women, 8.5 and 9 for the men. The staves
of one screen share a voice, so they stay aligned.

The pitch tracker sometimes reads an octave high or low, most often in the
creak at the end of a word. Within a syllable, a run of a few points that jumps
seven semitones or more from its neighbors is dropped. A run read an octave
off can be as long as the run before it, so points seven semitones or more
beyond either end of the voice's range are dropped too.

Re-pitched recordings are given the textbook contour spread across the voice's
range, so they are made again when that range moves by more than a quarter of a
semitone.

### The listener

A learner's takes cannot be scaled by their tones. A learner whose first tones
are too low would have level 5 moved down to meet them, which hides exactly the
error Say it is there to show. So the listener's scale comes from their voice
alone, by a rule that holds for the four recorded voices. Measured from a
voice's typical pitch (the median of its recordings' medians) in units of its
typical spread (the median of its recordings' 10th-to-90th-percentile ranges),
level 5 sits about 0.47 spreads above (0.36 to 0.53 across the four voices) and
level 1 about 0.78 spreads below (0.62 to 1.00).

The listener's typical pitch is learned by Bayesian updating. Before any take,
it is drawn from a prior that mixes a low voice (centered at 120 Hz) and a high
voice (215 Hz), each with a standard deviation of 2.5 semitones. Each take's
median pitch is a noisy observation of it: the median moves by about 2.3
semitones from word to word, the spread measured in the recordings, because a
word of first tones is said higher than one of third tones. Each component of
the mixture updates as a normal prior with a normal observation, and the
components are reweighted by how well each predicts the takes, so the first
take mostly settles which kind of voice it is. The typical spread is the average
of the takes' spreads, starting from 7.3 semitones weighted as three takes. It
is never so small that levels 1 and 5 fall less than six semitones apart (the
narrowest recorded voice spans 7.4), so a listener who says words on nearly one pitch sees a nearly
level line.
This follows the view of talker normalization as inference about a talker
(Kleinschmidt & Jaeger 2015), and the finding that listeners judge a pitch
against a range they expect from the population of speakers (Bishop & Keating
2012).

The uncertainty in the typical pitch measures how far calibration has come. The
voice counts as learned when that uncertainty is 0.8 semitones or less, which
takes about eight takes. Until then the listener's line is dashed, and a chip
beside Say it shows a ring filling with the precision gained ("Learning your
voice · 3 of ~8"). Tapping it says what the dashes mean.

Someone else may pick up the phone. For each new take, Say it compares two
explanations: the take is by the voice it has learned, or by a new speaker drawn
from the prior, with a chance of 2% per take that the speaker has changed. This
is the one-step form of Bayesian online change-point detection (Adams & MacKay
2007). Once the voice has three takes, a take with a probability above 90% of a
new speaker offers a choice: Start fresh, which begins a new voice from that
take and redraws it, or Same voice, which adds it to the old one. A take a few
semitones high does not trigger it; a take about an octave away does. Settings
shows what has been learned, with Start fresh, and Switch back, which restores
the voice before the last fresh start. The last 50 takes' medians and spreads
are kept on the device.

### Tried and set aside

- **Percentile range for the recordings.** Levels 1 and 5 were the 5th and
  95th percentiles of all of a voice's pitch, a robust form of fraction of
  range. A low voice's highest moments are the starts of its fourth tones and
  the ends of its second tones, well above its first tones, so the men's first
  tones sat near level 3.5.
- **First tones at exactly 5.** With level 5 set by first tones alone, the men's
  fourth tones started at levels 6 to 7.5 and peaked at 8 to 9. A fixed
  headroom to 6.5 clipped a quarter of the men's recordings.
- **A regression fit.** Each voice's scale was fit, by robust least squares, to
  every measured point against the textbook contour level at that point, about
  25,000 points per voice. The textbook contours are more extreme than speech
  (a second tone before another syllable barely rises, and a third tone rarely
  reaches the floor), so the best line compressed every voice's range by 30 to
  40%: third tones fell below level 1 and peaks rose to 8 to 12.
- **Per-take ranges for the listener.** Say it took the median of the 5th and
  95th percentile pitch of the last 20 takes, at least eight semitones wide. It
  could not say how settled the range was, and a second speaker's takes were
  averaged into the first's.
- **Scaling the listener by their tones.** Never built, for the reason given
  above: it would draw a learner's errors as correct.

### References

- Adams, R. P., & MacKay, D. J. C. (2007). Bayesian online changepoint
  detection. [arXiv:0710.3742](https://arxiv.org/abs/0710.3742).
- Bishop, J., & Keating, P. (2012). Perception of pitch location within a
  speaker's range: Fundamental frequency, voice quality and speaker sex.
  *Journal of the Acoustical Society of America*, 132(2), 1100–1112.
  [PDF](https://linguistics.ucla.edu/people/keating/Bishop-Keating_2012.pdf).
- Boersma, P., & Weenink, D. Praat: doing phonetics by computer.
  [praat.org](https://www.fon.hum.uva.nl/praat/), used through
  [Parselmouth](https://parselmouth.readthedocs.io/) (Jadoul, Thompson, &
  de Boer 2018, *Journal of Phonetics*, 71, 1–15).
- Chao, Y. R. (1930). A system of tone-letters. *Le Maître Phonétique*, 45,
  24–27.
- Kleinschmidt, D. F., & Jaeger, T. F. (2015). Robust speech perception:
  Recognize the familiar, generalize to the similar, and adapt to the novel.
  *Psychological Review*, 122(2), 148–203.
- Rose, P. (1987). Considerations in the normalisation of the fundamental
  frequency of linguistic tone. *Speech Communication*, 6(4), 343–351.
  [PDF](https://philjohnrose.net/pubs/Tone_pubs/Rose%20papers_on_TONE/Rose_1987_CNLT.pdf).
- Shi Feng 石锋 (1990). 论五度值记调法 [On the five-degree method of tone
  notation]. *天津师大学报* [Journal of Tianjin Normal University], 1990(3),
  15–19.
- Zhang, J. (2018). A comparison of tone normalization methods for language
  variation research. *Proceedings of the 32nd Pacific Asia Conference on
  Language, Information and Computation*, 823–831.
  [ACL Anthology](https://aclanthology.org/Y18-1095/).
- Zhu Xiaonong 朱晓农 (2004). 基频归一化：如何处理声调的随机差异？
  [F0 normalization: how to deal with between-speaker tonal variations?].
  *语言科学* [Linguistic Sciences], 3(2), 3–19.
