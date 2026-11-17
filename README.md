# Tone Pairs

A listening drill for the tones of two-syllable Mandarin words, built from the
pronunciation exercises in the *HSK Standard Course 1* workbook. It runs as a
web app saved to the iPhone home screen and works offline once loaded.

Live at <https://tone-pairs.pages.dev>.

## How the drill works

You hear a word and see its pinyin without tone marks. Tap a tone for each
syllable, in either order; the answer counts once both are chosen. Each word is spoken by one of four synthesized voices
(two women, two men), chosen at random each time.

Every toneless pinyin in the workbook (`shi jian`, `pi jiu`, …) becomes a
*family* of words that share its syllables but differ in tone, so the answer
cannot be recalled from the workbook. Real words come first (时间 shíjiān,
实践 shíjiàn, 事件 shìjiàn). Most syllable pairs have only one common word, so
families are filled to four tone patterns with pseudo-words: two common
characters, each with a single dictionary reading, labelled "not a word" in
the feedback. The added patterns change one syllable's tone at a time.

After you answer, a staff shows the idealized contour of the word played on
the five-level pitch scale (55, 35, 214, 51; a non-final third tone as 21; a
neutral tone as a short pitch set by the tone before it). A dot follows the
contour as the recording plays. When the answer is wrong, the feedback names
the word played and the word your answer describes, each in its color with
its own play button, and draws your answer's contour on a second staff below.
The two play one after the other in the same voice, and can be played again or
looped until stopped. Below them, the family's other real words are listed;
tapping one plays it and puts it on the second staff, after a right answer
too.

The tones you name usually belong to no word in the drill set, so each family
also has a recording of every other tone pattern, used only for comparisons:
the most common real word with that pattern, or else a pseudo-word. A pattern
with no recording (a neutral tone with no real word, or a syllable such as
*mīng* that no character has) still gets its contour drawn.

An answer counts as right if it matches the tones as spoken. The dictionary
tones are also accepted when they differ only by tone sandhi (你好, written
3-3 and said 2-3), unless another word in the family is said that way.

Scheduling uses FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)):
a wrong answer brings the word back within minutes, and a right one schedules
it days ahead. New words are introduced a family at a time, 20 a day by default.
*Extra practice* drills random words without changing the schedule. Progress is
stored on the device.

If a recording sounds wrong, tap *Bad audio*. That recording is not played
again, and Settings lists the flagged recordings so they can be fixed.

## Adding a lesson

1. Transcribe the workbook's pronunciation section into `homework/hsk1-NN.txt`,
   one question per line: `9. fang men / fangjian`. Copy the pinyin as
   printed, with or without tone marks.
2. If an item is not in CC-CEDICT (`mén hòu`), add it to
   `homework/extra-words.tsv`.
3. `just data` rebuilds `web/public/data/words.json`, prints the chosen
   families, and synthesizes any new recordings.
4. `just deploy`.

## Development

Requires `uv`, `bun`, and `just`; deploying requires `wrangler` logged in to
Cloudflare.

- `just dev`: local server
- `just check`: lint, typecheck, and tests for the Python pipeline and the app

Sources: [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0) for words, readings,
and glosses; [wordfreq](https://github.com/rspeer/wordfreq) for word frequency;
Microsoft Edge text-to-speech (via `edge-tts`) for the recordings.
