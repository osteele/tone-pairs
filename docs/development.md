# Development

Tone Pairs has two parts: a Python pipeline (`pipeline/`) that turns the
workbook transcripts into a word list and recordings, and a React web app
(`web/`) that runs the drill and is deployed to Cloudflare Pages as an offline
web app. [How it works](how-it-works.md) describes what each produces and why.

## Setup

Requires [uv](https://docs.astral.sh/uv/), [bun](https://bun.sh/),
[just](https://just.systems/), and `ffmpeg`. Deploying requires
[wrangler](https://developers.cloudflare.com/workers/wrangler/) logged in to
Cloudflare.

- `just dev`: local server
- `just check`: lint, typecheck, and tests for the pipeline and the app
- `just data`: rebuild the word list and recordings
- `just deploy`: build and deploy
- `just og-image`: render the link preview image, `web/public/og-image.png`,
  from `web/og-image.svg` (needs `rsvg-convert`, from librsvg)

## Data

The pipeline reads the workbook transcripts, one file per lesson
(`hsk1-01.txt`, …). They are excerpts of a copyrighted workbook, so they are not
in the repository: put them in a directory of your own and name it in `.env`,
which `just` loads and git ignores:

```sh
TONE_PAIRS_TRANSCRIPTS=/path/to/transcripts
```

`homework/extra-words.tsv`, words the dictionary lacks, is in the repository.

`just data` reads the transcripts and writes:

- `web/public/data/words.json`: the lessons, families, and words. It depends
  only on the transcripts, CC-CEDICT, and wordfreq, so it is committed.
- `.cache/speech/*.mp3`: speech as the synthesizer returned it, one file per
  word and voice. Missing speech is synthesized.
- `web/public/audio/*.m4a`: the served recordings, named
  `<word id>-<voice>.m4a`. Each is made once from the speech: decoded, trimmed
  of its leading silence (up to the synthesizer's quiet background noise, which
  soft consonants rise out of, so none is cut), re-pitched where no word has a
  pattern, and
  encoded as AAC in MP4. MP4 records the encoder's padding, so playback starts at
  the first sample and the measured times match what is heard. MP3 does not.
- `web/public/data/recordings.json`: what was measured in each served
  recording, its content digest, timing, and pitch. Measurements are cached in
  `.cache/measured.json`, so a run decodes only new recordings.

The speech, the recordings, and `recordings.json` are not in the repository:
they are kept in the working directory, and deployed from there. A fresh
checkout can regenerate them with `just data`, but synthesized speech varies
over time, so a fresh synthesis will not match the deployed recordings exactly.
The pipeline also removes served recordings that no word uses.

CC-CEDICT is downloaded to `.cache/` on first use.

## Adding a lesson

1. Transcribe the workbook's two-syllable tone-marking items, the ones that
   ask you to add the tone marks you hear (语音 Part II, 给下列词语标注声调),
   into `hsk1-NN.txt` in the transcripts directory, one question per line:
   `9. fang men / fangjian`. Leave out exercises whose tones are printed: Part
   I, which asks which of two words is said, and read-aloud lists. Where the
   book leaves one syllable bare for you to mark (the 不 in `bu shì`), copy the
   item with no tone marks. A lesson with no two-syllable tone-marking items
   still gets a file, holding only comments that say why. The app lists it as
   having nothing to drill.
2. If an item is not in CC-CEDICT (`mén hòu`), CC-CEDICT gives it more than
   one reading (不是), or lists it only as a proper noun (春节), add it to
   `homework/extra-words.tsv`.
3. `just data`. It prints each family's words, with warnings where a family
   is short of tone patterns.
4. `just deploy`.

## Comparing with the workbook audio

`just teacher` measures the workbook's own recordings of the drilled words, so
the synthesized voices can be checked against them. Name the folder holding the
lessons' audio (`NN-2.mp3`) in `.env`:

```sh
TONE_PAIRS_WORKBOOK_AUDIO=/path/to/workbook/audio
```

It cuts each tone-marking item's readings out of the lesson's second audio file
and measures them as the recordings are measured. It asks an audio model, through
OpenRouter (`OPENROUTER_API_KEY`), which printed option each item reads, since
the options can sound alike, and caches the answers. Everything it writes stays
in `.cache/teacher`.

Under `just dev`, Settings links to a page that draws each item's readings over
the four voices' pitch, with each voice's distance from the reader. Only the dev
server serves the page's data, and a build includes neither the page nor the
audio, which is copyrighted.

## Updates on the phone

The service worker precaches only the app and the data files, so a deployed
update takes effect within seconds of the app being opened. The page then
downloads recordings into their own cache in the background, the selected
lesson's first. A recording's URL carries its content digest, so a re-recorded
clip replaces its saved copy.
