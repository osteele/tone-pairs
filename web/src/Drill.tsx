import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowRight,
  FaCheck,
  FaFlag,
  FaPen,
  FaPlay,
  FaRepeat,
  FaSpinner,
  FaStop,
  FaVolumeHigh,
  FaXmark,
} from "react-icons/fa6";
import { play, playSequence, prefetch, stop } from "./audio";
import type { Deck, Pattern, Tone, Word } from "./deck";
import { recordedIn, recordingOf, siblings } from "./deck";
import { isCorrect, spokenForm, wordForAnswer } from "./grading";
import { whileLoading } from "./loading";
import { markSyllable, samePattern } from "./pinyin";
import type { Progress, Scheduler } from "./progress";
import { record } from "./progress";
import type { Mode, Prompt } from "./session";
import { advancesAfterRight, clipFor, familyPaths, nextPrompt } from "./session";
import type { GraphLine } from "./ToneGraph";
import { ToneGraph } from "./ToneGraph";
import type { Role } from "./tones";
import { ROLES, TONE_COLORS } from "./tones";
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
  /** The tones answered; empty when the listener asked to see the answer instead. */
  answer: Tone[];
  correct: boolean;
  /** The listener tapped Show answer rather than answering. */
  revealed: boolean;
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
  // From a tap on Play until the recording starts: loading and decoding take a moment on iOS.
  const [starting, setStarting] = useState(false);
  const playback = usePlayback();
  const [tally, setTally] = useState({ answered: 0, right: 0 });
  const timer = useRef<number | undefined>(undefined);
  // The latest progress, for the auto-advance timer, which outlives the render that set it.
  const latest = useRef(progress);
  latest.current = progress;

  const cancelAdvance = useCallback(() => window.clearTimeout(timer.current), []);
  useEffect(() => cancelAdvance, [cancelAdvance]);

  const say = useCallback(
    async (word: Word, voice: string) => {
      const clip = clipFor(deck, word, voice);
      if (!clip) return;
      setBlocked((await whileLoading(setStarting, () => play(clip))) === "blocked");
    },
    [deck],
  );

  // While the listener answers, fetch everything the feedback may play.
  useEffect(() => {
    if (prompt) prefetch(familyPaths(deck, prompt.word, prompt.voice));
  }, [deck, prompt]);

  // On the feedback screen, choose the next prompt and fetch its recording, so Next starts it
  // without a network delay.
  const upcoming = useRef<Prompt | null | undefined>(undefined);
  useEffect(() => {
    if (!result || !prompt || upcoming.current !== undefined) return;
    upcoming.current = nextPrompt(deck, progress, mode, prompt.word.id, new Date());
    const clip = upcoming.current && clipFor(deck, upcoming.current.word, upcoming.current.voice);
    if (clip) prefetch([clip.path]);
  }, [deck, mode, prompt, progress, result]);

  const advance = useCallback(() => {
    cancelAdvance();
    const next =
      upcoming.current !== undefined
        ? upcoming.current
        : nextPrompt(deck, latest.current, mode, prompt?.word.id, new Date());
    upcoming.current = undefined;
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

  const submit = (pattern: Tone[], revealed = false) => {
    if (!prompt) return;
    const family = siblings(deck, prompt.word);
    const correct = !revealed && isCorrect(pattern, prompt.word, family);
    setResult({ answer: pattern, correct, revealed });
    if (revealed) {
      // Inside the tap, so iOS allows it to play.
      const clip = clipFor(deck, prompt.word, prompt.voice);
      if (clip) void play(clip);
    } else if (!correct) {
      // Inside the tap that answered, so iOS allows the sequence to start.
      const answered = wordForAnswer(pattern, recordedIn(deck, prompt.word, prompt.voice));
      const clips = answered && [
        clipFor(deck, prompt.word, prompt.voice),
        clipFor(deck, answered, prompt.voice),
      ];
      if (answered && answered.id !== prompt.word.id && clips?.[0] && clips[1]) {
        void playSequence([clips[0], clips[1]]);
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

  /** Show the answer without answering; scheduled as a wrong answer. */
  const reveal = () => {
    if (prompt && !result) submit([], true);
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
  const promptClip = clipFor(deck, word, prompt.voice);
  const playing = promptClip !== undefined && playback?.clip?.path === promptClip.path;

  return shell(
    <>
      {/* After an answer the feedback names the word and has its own play button. */}
      {!result && (
        <section className="flex flex-col items-center gap-3">
          <p className="flex gap-3 text-4xl font-medium tracking-wide">
            {word.syllables.map((s, i) => {
              const tone = choices[i];
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: a word's syllables never reorder.
                <span key={i} style={tone == null ? undefined : { color: TONE_COLORS[tone] }}>
                  {(tone == null ? s : markSyllable(s, tone)).replaceAll("u:", "ü")}
                </span>
              );
            })}
          </p>
          <button
            type="button"
            aria-label={playing ? "Playing; tap to play again" : "Play again"}
            onClick={() => hear(word)}
            className={`flex size-16 items-center justify-center rounded-full text-white transition active:scale-95 ${
              blocked
                ? "animate-pulse bg-amber-500"
                : playing
                  ? "bg-teal-700 ring-4 ring-teal-300"
                  : "bg-teal-600"
            }`}
          >
            {starting ? (
              <FaSpinner size={26} className="animate-spin" />
            ) : (
              <FaVolumeHigh size={28} />
            )}
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
          <button
            type="button"
            onClick={reveal}
            className="self-center rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-base font-medium text-stone-600 active:bg-stone-100"
          >
            Show answer
          </button>
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
            selected === tone ? "text-white" : "border-stone-300 bg-white"
          }`}
          style={
            selected === tone
              ? { background: TONE_COLORS[tone], borderColor: TONE_COLORS[tone] }
              : { color: TONE_COLORS[tone] }
          }
        >
          {markSyllable(syllable, tone)}
          <span className="text-xs opacity-60">{tone === 5 ? "neutral" : tone}</span>
        </button>
      ))}
    </div>
  );
}

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
  const answered =
    result.correct || result.revealed
      ? undefined
      : wordForAnswer(result.answer, recordedIn(deck, word, voice));
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

  const graphLine = (key: string, pattern: Pattern, label: string, of?: Word): GraphLine => {
    const recording = of && recordingOf(deck, of, voice);
    return {
      key,
      pattern,
      label,
      path: recording?.url,
      timing: recording?.timing,
      track: recording?.track,
    };
  };
  const played = graphLine("played", word.spoken, `played ${word.pinyin}`, word);
  // Drawn on a second staff, beneath the word played.
  const compared = picked
    ? graphLine("other", picked.spoken, picked.pinyin, picked)
    : result.correct || result.revealed
      ? undefined
      : graphLine("answered", spokenForm(result.answer), `your answer ${answeredPinyin}`, answered);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (hanzi: string) => {
    onInteract();
    void navigator.clipboard.writeText(hanzi).then(() => {
      setCopied(hanzi);
      window.setTimeout(() => setCopied((c) => (c === hanzi ? null : c)), 1500);
    });
  };

  const tapped = (fn: () => void) => () => {
    onInteract();
    fn();
  };

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div
        className={`flex flex-col gap-2 rounded-xl px-4 py-3 ${
          result.correct ? "bg-emerald-50" : result.revealed ? "bg-stone-100" : "bg-rose-50"
        }`}
      >
        <p
          className={`flex items-center gap-2 font-semibold ${
            result.correct
              ? "text-emerald-800"
              : result.revealed
                ? "text-stone-700"
                : "text-rose-800"
          }`}
        >
          {result.correct ? <FaCheck /> : result.revealed ? null : <FaXmark />}
          {result.correct ? "Right" : result.revealed ? "Answer" : "Not quite"}
        </p>
        <WordRow
          label="Played"
          who="played"
          syllables={word.syllables}
          tones={word.tones}
          word={word}
          onCopy={copy}
          note={
            samePattern(word.tones, word.spoken)
              ? undefined
              : `written ${word.tones.join("-")}, said ${word.spoken.join("-")}`
          }
          onPlay={playedClip ? tapped(() => void play(playedClip)) : undefined}
        />
        {!result.correct && !result.revealed && (
          <WordRow
            label="Your answer"
            who={picked ? "other" : "answered"}
            syllables={word.syllables}
            tones={result.answer}
            word={answered}
            onCopy={copy}
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

      <div className="flex flex-col gap-3">
        <Staff
          caption={`Played · ${word.pinyin}`}
          who="played"
          line={played}
          onPlay={playedClip ? tapped(() => void play(playedClip)) : undefined}
        />
        {compared && (
          <Staff
            who={picked ? "other" : "answered"}
            onPlay={comparisonClip ? tapped(() => void play(comparisonClip)) : undefined}
            caption={
              picked
                ? `Compared · ${picked.pinyin} ${picked.hanzi}`
                : `Your answer · ${answeredPinyin}${
                    samePattern(result.answer, spokenForm(result.answer))
                      ? ""
                      : `, said ${spokenForm(result.answer).join("-")}`
                  }${answeredClip ? "" : " (no recording)"}`
            }
            line={compared}
          />
        )}
      </div>

      {((!result.correct && !result.revealed) || picked) && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button
            type="button"
            disabled={!comparisonClip}
            onClick={tapped(
              () => playedClip && comparisonClip && void playSequence([playedClip, comparisonClip]),
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
              else if (playedClip && comparisonClip)
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
          <p className="text-xs text-stone-500">
            {word.real || answered?.real ? "Other words" : "Words"} with these syllables
          </p>
          {others.map((other) => (
            <div
              key={other.id}
              className={`flex items-center gap-3 rounded-lg py-1 ${
                picked?.id === other.id ? "bg-stone-100" : ""
              }`}
            >
              <span
                className="h-5 w-1.5 shrink-0 rounded"
                style={{
                  background: ROLES.other.color,
                  opacity: picked?.id === other.id ? 1 : 0.4,
                }}
              />
              <Pinyin syllables={other.syllables} tones={other.tones} />
              <Hanzi hanzi={other.hanzi} onCopy={copy} />
              <button
                type="button"
                aria-label={`Play ${other.pinyin} and compare it`}
                onClick={tapped(() => {
                  setPicked(other);
                  const clip = clipFor(deck, other, voice);
                  if (clip) void play(clip);
                })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-stone-500">
                  {other.gloss}
                </span>
                <FaPlay className="mr-3 shrink-0 text-stone-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {copied && (
        <p className="text-center text-sm text-stone-500" role="status">
          Copied {copied}
        </p>
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

const ROLE_ICONS: Record<Role, typeof FaPlay> = {
  played: FaVolumeHigh,
  answered: FaPen,
  other: FaPlay,
};

/**
 * A tone graph framed in its role's color, with a caption naming the word drawn. The frame,
 * not the line, says which word this is: the line's colors are the tones'. Tapping it plays
 * the word.
 */
function Staff({
  caption,
  who,
  line,
  onPlay,
}: {
  caption: string;
  who: Role;
  line: GraphLine;
  onPlay: (() => void) | undefined;
}) {
  const Icon = ROLE_ICONS[who];
  return (
    <button
      type="button"
      disabled={!onPlay}
      onClick={onPlay}
      aria-label={`Play ${caption}`}
      className="flex flex-col gap-1 rounded-xl border-l-4 px-2 py-1.5 text-left active:opacity-70"
      style={{ borderColor: ROLES[who].color, background: ROLES[who].tint }}
    >
      <span
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: ROLES[who].color }}
      >
        <Icon size={11} /> {caption}
      </span>
      <ToneGraph line={line} />
    </button>
  );
}

/** Pinyin with each syllable in its tone's color. */
function Pinyin({ syllables, tones }: { syllables: readonly string[]; tones: readonly Tone[] }) {
  return (
    <span className="font-medium">
      {syllables.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a word's syllables never reorder.
        <span key={i} style={{ color: TONE_COLORS[tones[i]!] }}>
          {markSyllable(s, tones[i]!)}
        </span>
      ))}
    </span>
  );
}

/** Hanzi that copy themselves to the clipboard when tapped. */
function Hanzi({ hanzi, onCopy }: { hanzi: string; onCopy: (hanzi: string) => void }) {
  if (!hanzi) return null;
  return (
    <button
      type="button"
      aria-label={`Copy ${hanzi}`}
      onClick={() => onCopy(hanzi)}
      className="rounded px-0.5 active:bg-stone-200"
    >
      {hanzi}
    </button>
  );
}

/** One labelled word in the feedback, marked with its role, with a button to hear it. */
function WordRow({
  label,
  who,
  syllables,
  tones,
  word,
  note,
  onCopy,
  onPlay,
}: {
  label: string;
  who: Role;
  syllables: readonly string[];
  tones: readonly Tone[];
  /** Absent when no recording has these tones. */
  word: Word | undefined;
  note?: string;
  onCopy: (hanzi: string) => void;
  onPlay: (() => void) | undefined;
}) {
  const meaning =
    word === undefined
      ? "no recording"
      : word.madeFrom
        ? `re-pitched from ${word.madeFrom}`
        : word.real
          ? word.gloss
          : "not a word";
  return (
    <div className="flex items-center gap-3">
      <span className="h-8 w-1.5 shrink-0 rounded" style={{ background: ROLES[who].color }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-500">{label}</p>
        <p className="flex items-baseline gap-2 truncate">
          <Pinyin syllables={syllables} tones={tones} />
          {word && <Hanzi hanzi={word.hanzi} onCopy={onCopy} />}
          <span className="truncate text-sm text-stone-500">{meaning}</span>
        </p>
        {note && <p className="text-xs text-stone-500">{note}</p>}
      </div>
      <button
        type="button"
        aria-label={`Play ${label}`}
        disabled={!onPlay}
        onClick={onPlay}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white disabled:opacity-30"
        style={{ color: ROLES[who].color }}
      >
        <FaPlay />
      </button>
    </div>
  );
}
