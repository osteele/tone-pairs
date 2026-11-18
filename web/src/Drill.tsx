import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowRight,
  FaCheck,
  FaFlag,
  FaPlay,
  FaRepeat,
  FaStop,
  FaVolumeHigh,
  FaXmark,
} from "react-icons/fa6";
import { play, playSequence, stop } from "./audio";
import type { Deck, Tone, Word } from "./deck";
import { recorded, siblings } from "./deck";
import { isCorrect, wordForAnswer } from "./grading";
import { markSyllable, samePattern } from "./pinyin";
import type { Progress, Scheduler } from "./progress";
import { record } from "./progress";
import type { Mode, Prompt } from "./session";
import { advancesAfterRight, clipFor, nextPrompt } from "./session";
import type { GraphLine } from "./ToneGraph";
import { ToneGraph } from "./ToneGraph";
import { usePlayback } from "./usePlayback";

interface Props {
  deck: Deck;
  scheduler: Scheduler;
  progress: Progress;
  setProgress: (update: (p: Progress) => Progress) => void;
  mode: Mode;
  first: Prompt | null;
  onExit: () => void;
  onExtra: () => void;
}

interface Result {
  answer: Tone[];
  correct: boolean;
}

const FIRST_TONES: Tone[] = [1, 2, 3, 4];
const SECOND_TONES: Tone[] = [1, 2, 3, 4, 5];
const AUTO_ADVANCE_MS = 1200;

export function Drill({
  deck,
  scheduler,
  progress,
  setProgress,
  mode,
  first,
  onExit,
  onExtra,
}: Props) {
  const [prompt, setPrompt] = useState<Prompt | null>(first);
  // The tones picked so far for each syllable, in either order; the answer is submitted
  // once both are picked.
  const [choices, setChoices] = useState<(Tone | null)[]>([null, null]);
  const [result, setResult] = useState<Result | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [tally, setTally] = useState({ answered: 0, right: 0 });
  const timer = useRef<number | undefined>(undefined);
  // The latest progress, for the auto-advance timer, which outlives the render that set it.
  const latest = useRef(progress);
  latest.current = progress;

  const cancelAdvance = useCallback(() => window.clearTimeout(timer.current), []);
  useEffect(() => cancelAdvance, [cancelAdvance]);

  const say = useCallback(
    async (word: Word, voice: string) => {
      setBlocked((await play(clipFor(deck, word, voice))) === "blocked");
    },
    [deck],
  );

  const advance = useCallback(() => {
    cancelAdvance();
    const next = nextPrompt(deck, latest.current, mode, prompt?.word.id, new Date());
    setPrompt(next);
    setChoices([null, null]);
    setResult(null);
    if (next) void say(next.word, next.voice);
  }, [deck, mode, prompt, say, cancelAdvance]);

  const pick = (syllable: number, tone: Tone) => {
    if (!prompt || result) return;
    const next = choices.map((c, i) => (i === syllable ? tone : c));
    setChoices(next);
    if (next.every((c) => c !== null)) submit(next as Tone[]);
  };

  const submit = (pattern: Tone[]) => {
    if (!prompt) return;
    const family = siblings(deck, prompt.word);
    const correct = isCorrect(pattern, prompt.word, family);
    setResult({ answer: pattern, correct });
    if (!correct) {
      // Inside the tap that answered, so iOS allows the sequence to start.
      const answered = wordForAnswer(pattern, recorded(deck, prompt.word));
      if (answered && answered.id !== prompt.word.id) {
        void playSequence([
          clipFor(deck, prompt.word, prompt.voice),
          clipFor(deck, answered, prompt.voice),
        ]);
      }
    }
    setTally((t) => ({ answered: t.answered + 1, right: t.right + (correct ? 1 : 0) }));
    setProgress((p) =>
      record(
        p,
        scheduler,
        {
          word: prompt.word.id,
          voice: prompt.voice,
          answer: pattern,
          correct,
          scheduled: mode === "scheduled",
        },
        new Date(),
      ),
    );
    if (
      correct &&
      progress.settings.autoAdvance &&
      advancesAfterRight(mode, progress.cards[prompt.word.id])
    ) {
      timer.current = window.setTimeout(advance, AUTO_ADVANCE_MS);
    }
  };

  const hear = (word: Word) => {
    cancelAdvance();
    if (prompt) void say(word, prompt.voice);
  };

  const flag = () => {
    if (!prompt) return;
    cancelAdvance();
    const key = `${prompt.word.id}:${prompt.voice}`;
    setProgress((p) => (p.flagged.includes(key) ? p : { ...p, flagged: [...p.flagged, key] }));
  };

  // Keyboard shortcuts for desktop: 1-5 answer, space replays, enter goes on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!prompt) return;
      if (e.key === " ") {
        e.preventDefault();
        hear(prompt.word);
      } else if (e.key === "Enter" && result) {
        advance();
      } else if (/^[1-5]$/.test(e.key) && !result) {
        // Fills the first syllable, then the second; a neutral tone only fits the second.
        const tone = Number(e.key) as Tone;
        if (choices[0] === null && tone !== 5) pick(0, tone);
        else if (choices[1] === null) pick(1, tone);
      } else if (e.key === "Backspace" && !result) {
        setChoices([null, null]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = (
    <header className="flex items-center justify-between">
      <button
        type="button"
        aria-label="Done"
        onClick={() => {
          cancelAdvance();
          stop();
          onExit();
        }}
        className="rounded-full p-2 text-stone-500 active:bg-stone-200"
      >
        <FaXmark size={22} />
      </button>
      <span className="text-sm text-stone-500">
        {[
          mode === "extra" ? "Extra practice" : "",
          tally.answered > 0 ? `${tally.right}/${tally.answered} right` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </header>
  );

  const shell = (body: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      {header}
      {body}
    </main>
  );

  if (!prompt) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-xl font-semibold">All caught up</p>
        <p className="text-stone-500">
          {tally.answered > 0 && `${tally.right} of ${tally.answered} right this session. `}
          Nothing else is due in this lesson.
        </p>
        <button
          type="button"
          onClick={onExtra}
          className="w-full rounded-xl border border-stone-300 bg-white py-3 font-medium"
        >
          Extra practice
        </button>
        <button
          type="button"
          onClick={onExit}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white"
        >
          Home
        </button>
      </div>,
    );
  }

  const { word } = prompt;

  return shell(
    <>
      {/* After an answer the feedback names the word and has its own play button. */}
      {!result && (
        <section className="flex flex-col items-center gap-3">
          <p className="text-4xl font-medium tracking-wide">
            {word.syllables
              .map((s, i) => {
                const tone = choices[i];
                return tone == null ? s : markSyllable(s, tone);
              })
              .join(" ")
              .replaceAll("u:", "ü")}
          </p>
          <button
            type="button"
            aria-label="Play again"
            onClick={() => hear(word)}
            className={`flex size-16 items-center justify-center rounded-full text-white active:scale-95 ${
              blocked ? "animate-pulse bg-amber-500" : "bg-teal-600"
            }`}
          >
            <FaVolumeHigh size={28} />
          </button>
          {blocked && <p className="text-sm text-amber-700">Tap to play</p>}
        </section>
      )}

      {result ? (
        <Feedback
          deck={deck}
          prompt={prompt}
          result={result}
          onInteract={cancelAdvance}
          onFlag={flag}
          flagged={progress.flagged.includes(`${word.id}:${prompt.voice}`)}
          onNext={advance}
        />
      ) : (
        <section className="mt-auto flex flex-col gap-3">
          <ToneRow
            syllable={word.syllables[0]!}
            tones={FIRST_TONES}
            selected={choices[0] ?? null}
            onPick={(tone) => pick(0, tone)}
          />
          <ToneRow
            syllable={word.syllables[1]!}
            tones={SECOND_TONES}
            selected={choices[1] ?? null}
            onPick={(tone) => pick(1, tone)}
          />
        </section>
      )}
    </>,
  );
}

function ToneRow({
  syllable,
  tones,
  selected,
  onPick,
}: {
  syllable: string;
  tones: Tone[];
  selected: Tone | null;
  onPick: (tone: Tone) => void;
}) {
  return (
    <div className={`grid gap-2 ${tones.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
      {tones.map((tone) => (
        <button
          key={tone}
          type="button"
          onClick={() => onPick(tone)}
          className={`flex flex-col items-center rounded-xl border py-3 text-xl active:scale-95 ${
            selected === tone
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-stone-300 bg-white"
          }`}
        >
          {markSyllable(syllable, tone)}
          <span className="text-xs opacity-60">{tone === 5 ? "neutral" : tone}</span>
        </button>
      ))}
    </div>
  );
}

const PLAYED = "#0d9488";
const ANSWERED = "#dc2626";
const OTHER = "#6366f1";
// A word that has no line on the graph at the moment.
const UNDRAWN = "#a8a29e";

function Feedback({
  deck,
  prompt,
  result,
  onInteract,
  onFlag,
  flagged,
  onNext,
}: {
  deck: Deck;
  prompt: Prompt;
  result: Result;
  /** Any tap here cancels auto-advance. */
  onInteract: () => void;
  onFlag: () => void;
  flagged: boolean;
  onNext: () => void;
}) {
  const { word, voice } = prompt;
  // The word whose tones the listener named, if one was recorded.
  const answered = result.correct ? undefined : wordForAnswer(result.answer, recorded(deck, word));
  const answeredPinyin = word.syllables.map((s, i) => markSyllable(s, result.answer[i]!)).join("");
  // Real drill words of the family besides the two above, to compare against the word played.
  const others = siblings(deck, word).filter(
    (w) => w.real && w.id !== word.id && w.id !== answered?.id,
  );
  // The word drawn and played against the word played: the answer, until another is picked.
  const [picked, setPicked] = useState<Word | null>(null);
  const comparison = picked ?? answered;
  const playback = usePlayback();
  // True through the gaps between clips, while no clip is playing, until the loop is stopped.
  const looping = playback?.looping === true;

  const playedClip = clipFor(deck, word, voice);
  const answeredClip = answered ? clipFor(deck, answered, voice) : undefined;
  const comparisonClip = comparison ? clipFor(deck, comparison, voice) : undefined;

  const played: GraphLine = {
    key: "played",
    pattern: word.spoken,
    label: `played ${word.pinyin}`,
    color: PLAYED,
    path: playedClip.path,
    timing: deck.timing[playedClip.path],
  };
  // Drawn on a second staff, beneath the word played.
  let compared: GraphLine | undefined;
  if (picked) {
    const clip = clipFor(deck, picked, voice);
    compared = {
      key: "other",
      pattern: picked.spoken,
      label: picked.pinyin,
      color: OTHER,
      path: clip.path,
      timing: deck.timing[clip.path],
    };
  } else if (!result.correct) {
    compared = {
      key: "answered",
      pattern: result.answer,
      label: `your answer ${answeredPinyin}`,
      color: ANSWERED,
      path: answeredClip?.path,
      timing: answeredClip ? deck.timing[answeredClip.path] : undefined,
    };
  }

  const tapped = (fn: () => void) => () => {
    onInteract();
    fn();
  };

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div
        className={`flex flex-col gap-2 rounded-xl px-4 py-3 ${
          result.correct ? "bg-emerald-50" : "bg-rose-50"
        }`}
      >
        <p
          className={`flex items-center gap-2 font-semibold ${
            result.correct ? "text-emerald-800" : "text-rose-800"
          }`}
        >
          {result.correct ? <FaCheck /> : <FaXmark />}
          {result.correct ? "Right" : "Not quite"}
        </p>
        <WordRow
          label="Played"
          color={PLAYED}
          pinyin={word.pinyin}
          word={word}
          note={
            samePattern(word.tones, word.spoken)
              ? undefined
              : `written ${word.tones.join("-")}, said ${word.spoken.join("-")}`
          }
          onPlay={tapped(() => void play(playedClip))}
        />
        {!result.correct && (
          <WordRow
            label="Your answer"
            color={picked ? UNDRAWN : ANSWERED}
            pinyin={answeredPinyin}
            word={answered}
            onPlay={
              answeredClip
                ? tapped(() => {
                    setPicked(null);
                    void play(answeredClip);
                  })
                : undefined
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Staff caption={`Played · ${word.pinyin}`} line={played} />
        {compared && (
          <Staff
            caption={
              picked
                ? `Compared · ${picked.pinyin} ${picked.hanzi}`
                : `Your answer · ${answeredPinyin}${answeredClip ? "" : " (no recording)"}`
            }
            line={compared}
          />
        )}
      </div>

      {(!result.correct || picked) && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button
            type="button"
            disabled={!comparisonClip}
            onClick={tapped(
              () => comparisonClip && void playSequence([playedClip, comparisonClip]),
            )}
            className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white py-2.5 disabled:opacity-40"
          >
            <FaPlay /> Play both
          </button>
          <button
            type="button"
            disabled={!comparisonClip}
            onClick={tapped(() => {
              if (looping) stop();
              else if (comparisonClip)
                void playSequence([playedClip, comparisonClip], { loop: true });
            })}
            className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 disabled:opacity-40 ${
              looping ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"
            }`}
          >
            {looping ? <FaStop /> : <FaRepeat />} {looping ? "Stop" : "Loop both"}
          </button>
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col">
          <p className="text-xs text-stone-500">Other words with these syllables</p>
          {others.map((other) => (
            <button
              key={other.id}
              type="button"
              onClick={tapped(() => {
                setPicked(other);
                void play(clipFor(deck, other, voice));
              })}
              className={`flex items-center gap-3 rounded-lg py-1 text-left active:bg-stone-200 ${
                picked?.id === other.id ? "bg-stone-100" : ""
              }`}
            >
              <span
                className="h-5 w-1.5 shrink-0 rounded"
                style={{ background: picked?.id === other.id ? OTHER : UNDRAWN }}
              />
              <span className="font-medium">{other.pinyin}</span>
              <span>{other.hanzi}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-stone-500">{other.gloss}</span>
              <FaPlay className="mr-3 shrink-0 text-stone-400" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-3">
        <button
          type="button"
          onClick={tapped(onFlag)}
          disabled={flagged}
          aria-label="Flag this recording as wrong"
          className="flex items-center gap-2 rounded-xl border border-stone-300 px-4 text-sm text-stone-500 disabled:opacity-50"
        >
          <FaFlag /> {flagged ? "Flagged" : "Bad audio"}
        </button>
        <button
          type="button"
          onClick={() => {
            stop();
            onNext();
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-3.5 text-lg font-semibold text-white active:bg-teal-700"
        >
          Next <FaArrowRight />
        </button>
      </div>
    </section>
  );
}

/** A tone graph with a caption in its line's color, naming the word drawn. */
function Staff({ caption, line }: { caption: string; line: GraphLine }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-medium" style={{ color: line.color }}>
        {caption}
      </figcaption>
      <ToneGraph line={line} />
    </figure>
  );
}

/** One labelled word in the feedback, in its graph color, with a button to hear it. */
function WordRow({
  label,
  color,
  pinyin,
  word,
  note,
  onPlay,
}: {
  label: string;
  color: string;
  pinyin: string;
  /** Absent when no recording has these tones. */
  word: Word | undefined;
  note?: string;
  onPlay: (() => void) | undefined;
}) {
  const meaning = word === undefined ? "no recording" : word.real ? word.gloss : "not a word";
  return (
    <div className="flex items-center gap-3">
      <span className="h-8 w-1.5 shrink-0 rounded" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-500">{label}</p>
        <p className="truncate">
          <span className="font-medium">{pinyin}</span>
          {word && <span className="ml-2">{word.hanzi}</span>}
          <span className="ml-2 text-sm text-stone-500">{meaning}</span>
        </p>
        {note && <p className="text-xs text-stone-500">{note}</p>}
      </div>
      <button
        type="button"
        aria-label={`Play ${pinyin}`}
        disabled={!onPlay}
        onClick={onPlay}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white disabled:opacity-30"
        style={{ color }}
      >
        <FaPlay />
      </button>
    </div>
  );
}
