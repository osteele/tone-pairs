import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowRight,
  FaCheck,
  FaFlag,
  FaPlay,
  FaRepeat,
  FaVolumeHigh,
  FaXmark,
} from "react-icons/fa6";
import { play, playSequence, stop } from "./audio";
import type { Deck, Pattern, Tone, Word } from "./deck";
import { recorded, siblings } from "./deck";
import { isCorrect, wordForAnswer } from "./grading";
import { markSyllable, samePattern } from "./pinyin";
import type { Progress, Scheduler } from "./progress";
import { record } from "./progress";
import type { Mode, Prompt } from "./session";
import { clipFor, nextPrompt } from "./session";
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
  const [choice, setChoice] = useState<Tone | null>(null);
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
    setChoice(null);
    setResult(null);
    if (next) void say(next.word, next.voice);
  }, [deck, mode, prompt, say, cancelAdvance]);

  const answer = (tone: Tone) => {
    if (!prompt || result) return;
    if (choice === null) {
      setChoice(tone);
      return;
    }
    const pattern: Tone[] = [choice, tone];
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
    if (correct && progress.settings.autoAdvance) {
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
        const tone = Number(e.key) as Tone;
        if (choice !== null || tone !== 5) answer(tone);
      } else if (e.key === "Backspace" && !result) {
        setChoice(null);
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
        {mode === "extra" && "Extra practice · "}
        {tally.answered > 0 ? `${tally.right}/${tally.answered} right` : ""}
      </span>
    </header>
  );

  const shell = (body: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
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
      <section className="flex flex-col items-center gap-4 pt-4">
        <p className="text-4xl font-medium tracking-wide">
          {result
            ? word.syllables.map((s, i) => markSyllable(s, word.spoken[i]!)).join(" ")
            : word.syllables
                .map((s, i) => (i === 0 && choice !== null ? markSyllable(s, choice) : s))
                .join(" ")
                .replaceAll("u:", "ü")}
        </p>
        <button
          type="button"
          aria-label="Play again"
          onClick={() => hear(word)}
          className={`flex size-20 items-center justify-center rounded-full text-white active:scale-95 ${
            blocked ? "animate-pulse bg-amber-500" : "bg-teal-600"
          }`}
        >
          <FaVolumeHigh size={32} />
        </button>
        {blocked && <p className="text-sm text-amber-700">Tap to play</p>}
      </section>

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
            selected={choice}
            onPick={(tone) => setChoice(tone)}
          />
          <ToneRow
            syllable={word.syllables[1]!}
            tones={SECOND_TONES}
            selected={null}
            disabled={choice === null}
            onPick={answer}
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
  disabled = false,
  onPick,
}: {
  syllable: string;
  tones: Tone[];
  selected: Tone | null;
  disabled?: boolean;
  onPick: (tone: Tone) => void;
}) {
  return (
    <div className={`grid gap-2 ${tones.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
      {tones.map((tone) => (
        <button
          key={tone}
          type="button"
          disabled={disabled}
          onClick={() => onPick(tone)}
          className={`flex flex-col items-center rounded-xl border py-3 text-xl active:scale-95 disabled:opacity-40 ${
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

const HEARD = "#0d9488";
const ANSWERED = "#e11d48";
const OTHER = "#6366f1";

/** The pattern drawn beside the heard word, and its recording if there is one. */
interface Comparison {
  pattern: Pattern;
  word: Word | undefined;
  label: string;
  color: string;
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
  const all = recorded(deck, word);
  const answered = result.correct ? undefined : wordForAnswer(result.answer, all);
  const answeredText = word.syllables.map((s, i) => markSyllable(s, result.answer[i]!)).join("");
  const [comparison, setComparison] = useState<Comparison | null>(
    result.correct
      ? null
      : {
          pattern: result.answer,
          word: answered,
          label: `${answeredText} (your answer)`,
          color: ANSWERED,
        },
  );
  const playback = usePlayback();
  const looping = playback?.looping === true && playback.clip !== null;

  const heardClip = clipFor(deck, word, voice);
  const otherClip = comparison?.word ? clipFor(deck, comparison.word, voice) : undefined;

  const lines: GraphLine[] = [
    {
      key: "heard",
      pattern: word.spoken,
      label: `${word.pinyin} (heard)`,
      color: HEARD,
      path: heardClip.path,
      timing: deck.timing[heardClip.path],
    },
  ];
  if (comparison) {
    lines.push({
      key: "comparison",
      pattern: comparison.pattern,
      label: comparison.label,
      color: comparison.color,
      path: otherClip?.path,
      timing: otherClip ? deck.timing[otherClip.path] : undefined,
    });
  }

  const tapped = (fn: () => void) => () => {
    onInteract();
    fn();
  };

  const select = (member: Word) => {
    if (member.id === word.id) {
      void play(heardClip);
      return;
    }
    const isAnswer = member.id === answered?.id;
    setComparison({
      pattern: member.spoken,
      word: member,
      label: isAnswer ? `${member.pinyin} (your answer)` : member.pinyin,
      color: isAnswer ? ANSWERED : OTHER,
    });
    void play(clipFor(deck, member, voice));
  };

  // Real drill words, plus the heard word and the answered word even when they are not words.
  const drill = siblings(deck, word);
  const shown = drill.filter((m) => m.real || m.id === word.id || m.id === answered?.id);
  if (answered && !drill.includes(answered)) shown.push(answered);

  return (
    <section className="mt-auto flex flex-col gap-3">
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
          result.correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
        }`}
      >
        {result.correct ? <FaCheck size={22} /> : <FaXmark size={22} />}
        <div>
          <p className="font-semibold">
            {word.real ? word.hanzi : `${word.hanzi} (not a word)`} · {word.pinyin}
          </p>
          <p className="text-sm">{word.gloss}</p>
          {!samePattern(word.tones, word.spoken) && (
            <p className="text-sm">
              Written {word.tones.join("-")}, said {word.spoken.join("-")}.
            </p>
          )}
          {!result.correct && (
            <p className="text-sm">
              You answered {answeredText}
              {answered?.real ? ` (${answered.hanzi})` : ""}.
            </p>
          )}
        </div>
      </div>

      <ToneGraph lines={lines} />

      {comparison && (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <ControlButton
            label={word.pinyin}
            color={HEARD}
            onClick={tapped(() => void play(heardClip))}
          >
            <FaPlay />
          </ControlButton>
          <ControlButton
            label={comparison.word ? comparison.word.pinyin : "no recording"}
            color={comparison.color}
            disabled={!otherClip}
            onClick={tapped(() => otherClip && void play(otherClip))}
          >
            <FaPlay />
          </ControlButton>
          <ControlButton
            label="both"
            disabled={!otherClip}
            onClick={tapped(() => otherClip && void playSequence([heardClip, otherClip]))}
          >
            <FaPlay />
            <FaPlay />
          </ControlButton>
          <ControlButton
            label={looping ? "stop" : "loop"}
            active={looping}
            disabled={!otherClip}
            onClick={tapped(() => {
              if (looping) stop();
              else if (otherClip) void playSequence([heardClip, otherClip], { loop: true });
            })}
          >
            <FaRepeat />
          </ControlButton>
        </div>
      )}

      <ul className="flex flex-col">
        {shown.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={tapped(() => select(member))}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left active:bg-stone-200 ${
                member.id === word.id
                  ? "bg-teal-50"
                  : member.id === comparison?.word?.id
                    ? "bg-stone-100"
                    : ""
              }`}
            >
              <FaVolumeHigh className="shrink-0 text-stone-400" />
              <span className="w-24 font-medium">{member.pinyin}</span>
              <span className="w-14 shrink-0 whitespace-nowrap">{member.hanzi}</span>
              <span className="truncate text-sm text-stone-500">
                {member.real ? member.gloss : "not a word"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
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
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white active:bg-teal-700"
        >
          Next <FaArrowRight />
        </button>
      </div>
    </section>
  );
}

function ControlButton({
  label,
  color,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  color?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border py-2 disabled:opacity-40 ${
        active ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"
      }`}
    >
      <span className="flex gap-0.5" style={color && !active ? { color } : undefined}>
        {children}
      </span>
      <span className="max-w-full truncate px-1 text-xs">{label}</span>
    </button>
  );
}
