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

## Data

`just data` reads the transcripts and writes:

- `web/public/data/words.json`: the lessons, families, and words. It depends
  only on the transcripts, CC-CEDICT, and wordfreq, so it is committed.
- `web/public/audio/*.mp3`: the recordings, named `<word id>-<voice>.mp3`.
  Missing ones are synthesized, and re-pitched where no word has a pattern.
- `web/public/data/recordings.json`: what was measured in each recording, its
  content digest, timing, and pitch.

The recordings and `recordings.json` are not in the repository: they are kept
in the working directory, and deployed from there. A fresh checkout can
regenerate them with `just data`, but synthesized speech varies over time, so a
fresh synthesis will not match the deployed recordings exactly. The pipeline
also removes recordings that no word uses.

CC-CEDICT is downloaded to `.cache/` on first use.

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
3. `just data`. It prints each family's words, with warnings where a family
   is short of tone patterns.
4. `just deploy`.

## Updates on the phone

The service worker precaches only the app and the data files, so a deployed
update takes effect within seconds of the app being opened. The page then
downloads recordings into their own cache in the background, the selected
lesson's first. A recording's URL carries its content digest, so a re-recorded
clip replaces its saved copy.
