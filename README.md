# Tone Pairs

A listening drill for the tones of two-syllable Mandarin words, built from the
pronunciation exercises in the *HSK Standard Course 1* workbook.

Live at <https://tone-pairs.pages.dev>. Source at <https://github.com/osteele/tone-pairs>.

## Getting started on an iPhone

1. Open <https://tone-pairs.pages.dev> in Safari. The drill works in the
   Safari tab as it is.
2. To use it like an app, tap Share → *Add to Home Screen*, then open it from
   the home screen. Progress is kept separately for the Safari tab and the
   home-screen app, so pick one and stay with it.
3. Choose a lesson, or *All lessons*, and tap *Review · learn* to start.

The app itself loads in seconds. Its recordings (about 110 MB) then download in
the background, the current lesson's first, while you use it; a line on the
app's start screen counts them. When the line disappears, every recording is
saved and the drill works offline; *About* (the ⓘ button) then says so. Until
then, a recording that has not arrived plays over the network.

## How the drill works

You hear a word and see its pinyin without tone marks. Tap a tone for each
syllable, in either order; the answer counts once both are chosen. Each word is
spoken by one of four synthesized voices (two women, two men), chosen at random
each time.

Tones have colors wherever they appear, on the answer buttons, in pinyin, and
on the pitch graphs: first tone red, second orange, third green, fourth blue,
neutral gray, as in the Pleco and MDBG dictionaries.

Every toneless pinyin in the workbook (`shi jian`, `pi jiu`, …) becomes a
*family* of words that share its syllables but differ in tone, so the answer
cannot be recalled from the workbook. Real words come first (时间 shíjiān,
实践 shíjiàn, 事件 shìjiàn). Most syllable pairs have only one common word, so
families are filled to four tone patterns with pseudo-words: two common
characters, each with a single dictionary reading, labelled "not a word" in
the feedback. The added patterns change one syllable's tone at a time.

After you answer, a staff shows the word played on the five-level pitch scale.
The bold line is the textbook contour (55, 35, 51, and a third tone as a low
dip: 212 at the end of a word, 21 before another syllable; a neutral tone as a
short pitch set by the tone before it), with a dotted line joining the two
syllables. The faint line behind it is the pitch measured in the recording
itself, which is often flatter: before another syllable, a second tone may rise
only a little. A dot follows the contour as the recording plays; tap a staff to
hear it again.

When the answer is wrong, the feedback names the word played and the word your
answer describes, and draws your answer on a second staff below. A speaker icon
and a gray frame mark the word played; a pencil and a purple frame mark your
answer. The two play one after the other in the same voice, and can be played
again or looped until stopped. Below them, the family's other real words are
listed; tapping one plays it and puts it on the second staff, after a right
answer too. Tap a word's characters to copy them.

The tones you name usually belong to no word in the drill set, so each family
also has a recording of every other tone pattern, used only for comparisons:
the most common real word with that pattern, or else a pseudo-word. A pattern
with a third tone may use rarer characters, since a spoken third tone has a
creak that the next method cannot produce. Any pattern still missing is made by
re-pitching another recording of the family in the same voice: the syllable
whose tone differs is given the textbook contour, and the other keeps its
recorded pitch. The feedback labels such a recording "re-pitched from" its
source. A pattern ending in a neutral tone gets a recording only from a real
word, but its contour is still drawn.

An answer counts as right if it matches the tones as spoken. The dictionary
tones are also accepted when they differ only by tone sandhi (你好, written
3-3 and said 2-3), unless another word in the family is said that way. Since
two third tones are said 2-3, a word said 2-3 accepts either 2-3 or 3-3, and
an answer of 3-3 is drawn and played as 2-3.

The drill uses spaced repetition, scheduled by FSRS
([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)): a wrong answer
brings the word back within minutes, and a right one schedules it days ahead.
New words are introduced a family at a time, 20 a day by default. While a word
is still new, a right answer stays on screen for review, as a wrong one does.
*Extra practice* drills random words without changing the schedule, and moves on
by itself after a right answer. Progress is stored on the device.

If a recording sounds wrong, tap *Bad audio*. That recording is not played
again, and Settings lists the flagged recordings so they can be fixed.

## Adding a lesson

1. Transcribe the workbook's two-syllable pronunciation items into
   `homework/hsk1-NN.txt`, one question per line: `9. fang men / fangjian`.
   Copy the pinyin as printed, with or without tone marks. A read-aloud list
   gets one word per line. Where the book leaves one syllable bare for you to
   mark (the 不 in `bu shì`), copy the item with no tone marks. A lesson with
   no two-syllable items still gets a file, holding only comments that say
   why; the app lists it as having nothing to drill.
2. If an item is not in CC-CEDICT (`mén hòu`), CC-CEDICT gives it more than
   one reading (不是), or lists it only as a proper noun (春节), add it to
   `homework/extra-words.tsv`.
3. `just data` rebuilds `web/public/data/words.json` and `pitch.json`, prints
   the chosen families, synthesizes and re-pitches any new recordings, and
   removes recordings no word uses.
4. `just deploy`.

## Development

Requires `uv`, `bun`, `just`, and `ffmpeg`; deploying requires `wrangler`
logged in to Cloudflare.

- `just dev`: local server
- `just check`: lint, typecheck, and tests for the Python pipeline and the app

The recordings in `web/public/audio` are not in the repository. `just data`
synthesizes any that are missing; synthesized speech varies over time, so a
fresh synthesis will not match the deployed recordings exactly.

Sources: [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0) for words, readings,
and glosses; [wordfreq](https://github.com/rspeer/wordfreq) for word frequency;
Microsoft Edge text-to-speech (via `edge-tts`) for the recordings;
[Praat](https://www.fon.hum.uva.nl/praat/) (via `parselmouth`) for pitch
measurement and re-pitching.

## License

The code is released under the [MIT License](LICENSE). Copyright 2026 Oliver
Steele.

`web/public/data/words.json` is derived from CC-CEDICT and wordfreq data and is
distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
like its sources.
