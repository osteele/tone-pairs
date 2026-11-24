# Tone Pairs

A listening drill for the tones of two-syllable Mandarin words, built from the
pronunciation exercises in the *HSK Standard Course 1* workbook.

Live at <https://tone-pairs.pages.dev>.

## Getting started on an iPhone

1. Open <https://tone-pairs.pages.dev> in Safari. The drill works in the
   Safari tab as it is.
2. To use it like an app, tap Share → *Add to Home Screen*, then open it from
   the home screen. Progress is kept separately for the Safari tab and the
   home-screen app, so pick one and stay with it.
3. With *Learn* selected at the top, tap a lesson, or *All lessons*, to start.

The app itself loads in seconds. Its recordings (about 110 MB) then download in
the background, the current lesson's first, while you use it. A line on the
app's start screen counts them. When the line disappears, every recording is
saved and the drill works offline. Until then, a recording that has not arrived
plays over the network.

## Using the drill

The switch at the top of the start screen sets what tapping a lesson does:

- *Learn* reviews the words due and introduces new ones, on a schedule.
- *Practice* drills the lesson's words, more often those with the tone
  patterns you miss most, without changing the schedule, and moves on by
  itself after a right answer.
- *Browse* lists the lesson's syllables (`shi jian`, `pi jiu`, …). Pick one to
  see its tone patterns, a row for each tone of the first syllable and a column
  for each of the second, and tap any to hear it and see its pitch. *Include
  non-words* adds the made-up ones.

You hear a word and see its pinyin without tone marks. The play button spins
while the word loads, and a ring around it fills as the word plays. Tap it to
hear the word again, or tap *Show answer* if you don't know. Tap a tone for each
syllable, in either order. The answer counts once both are chosen. Each word is
spoken by one of four synthesized voices (two women, two men), chosen at random
each time. Tap the voice's name under the play button to hear the word in the
next voice. *½ speed* plays it slowly at the same pitch, and tapping a
syllable plays that syllable alone. The words are the workbook's, together with other words, and
made-up "pseudo-words", that share their syllables but differ in tone, so the
answer cannot be remembered from the workbook.

Tones have colors wherever they appear, on the answer buttons, in pinyin, and
on the pitch graphs: first tone red, second orange, third green, fourth blue,
neutral gray, as in the Pleco and MDBG dictionaries.

After you answer, a staff shows the word played on a five-level pitch scale.
The thick line is the textbook shape of its tones. The thin line over it, in a
deeper shade, is the pitch measured in the recording itself, which is often
flatter. It breaks where there is no pitch to measure, such as the hiss of s, sh, or f.
A dot follows the line as the recording plays. Tap a staff to hear it again,
and tap a word's characters to copy them. *Say it* records you saying the word
and draws your pitch on the staff, scaled to your own voice, so you can compare
the two. *Mine* plays your take back, and the voice's name beside it switches to the next voice. The recording stays on your phone. The ? button on every screen explains
what it shows.

When the answer is wrong, your answer is drawn on a second staff below. A
speaker icon and a gray frame mark the word played; a pencil and a purple frame
mark your answer. *Play both* plays them one after the other in the same voice,
and *Loop both* repeats them until stopped. If no real word has the tones you
chose, you hear a recording of the family made to have them, labelled
"re-pitched from" the word it was made from. Below, the family's other real
words are listed. Tapping one plays it and puts it on the second staff, after a
right answer too.

An answer is right if it matches the tones as the word is said. 2-3 and 3-3 are
both right for a word said 2-3, since two third tones are said that way, and
where a word is written with different tones than it is said, the feedback
notes both.

Words come back on a spaced-repetition schedule: one you miss returns within
minutes, one you get right days later. New words are introduced a few at a
time, 20 a day by default (Settings, the ⚙ button). While a word is new, a
right answer stays on screen for review, as a wrong one does. *Show answer*
counts as a miss. Settings can limit the drill to real words, leaving out the
made-up ones. Progress is stored on the device, and Settings can erase it.

If a recording sounds wrong, tap *Bad audio*: that recording is not played
again, and Settings lists the flagged recordings so they can be fixed. *About*
(the ⓘ button) gives the credits and the app's build and date.

[How it works](docs/how-it-works.md) explains how the words, recordings, and
pitch graphs are made, and the grading rules. To add lessons or work on the
code, see [Development](docs/development.md).

## Credits and license

Words, readings, and glosses come from [CC-CEDICT](https://cc-cedict.org/);
word frequencies from [wordfreq](https://github.com/rspeer/wordfreq); the
recordings from Microsoft Edge text-to-speech; scheduling from
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs); pitch measurement
and re-pitching from [Praat](https://www.fon.hum.uva.nl/praat/).

The code is released under the [MIT License](LICENSE). Copyright 2026 Oliver
Steele. `web/public/data/words.json` is derived from CC-CEDICT and wordfreq data
and is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
like its sources.
