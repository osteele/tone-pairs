import { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaPlay, FaSpinner, FaStop } from "react-icons/fa6";
import type { PitchTrack, Timing } from "./deck";
import { fitSpeaker, isNewSpeaker, summarize, type TakeSummary } from "./speaker";
import { MINE_COLOR } from "./tones";
import { endTake, keepTake, loadSpeaker, onSpeakerChange, recordTake, startFresh } from "./voice";
import { type Frames, MIN_VOICED, pitchFrames, takeTrack } from "./voicePitch";

/** The listener's take, as drawn on the staff. */
export interface Mine {
  track: PitchTrack;
  /** Their voice is still being learned, so the line's height may yet move. */
  provisional: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "analysing" }
  | { kind: "done"; heard: boolean }
  | { kind: "refused" };

/** The current speaker as stored, kept up to date. */
function useSpeaker() {
  const [takes, setTakes] = useState(() => loadSpeaker().takes);
  useEffect(() => onSpeakerChange(() => setTakes(loadSpeaker().takes)), []);
  return fitSpeaker(takes);
}

/**
 * Record the listener saying the word, and report their pitch as a track to draw on the
 * word's staff. `timing` is the recording's, so the take divides where its syllables do.
 */
export function SayIt({
  timing,
  onTrack,
}: {
  timing: Timing | undefined;
  onTrack: (mine: Mine | null) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  /** A take that sounds like someone else, until the listener says whether it is. */
  const [stranger, setStranger] = useState<TakeSummary | null>(null);
  const takeUrl = useRef<string | null>(null);
  const last = useRef<{ frames: Frames; split: number } | null>(null);
  const speaker = useSpeaker();
  useEffect(
    () => () => {
      endTake();
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    },
    [],
  );

  /** Draw the last take on the scale of the voice these takes describe. */
  const draw = (takes: readonly TakeSummary[]) => {
    if (!last.current) return;
    const voice = fitSpeaker(takes);
    const track = takeTrack(last.current.frames, last.current.split, voice.range);
    onTrack(track && { track, provisional: !voice.calibrated });
  };

  const record = async () => {
    setStranger(null);
    setState({ kind: "listening" });
    let take: Awaited<ReturnType<typeof recordTake>>;
    try {
      take = await recordTake();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setState({ kind: "refused" });
        return;
      }
      setState({ kind: "idle" });
      throw error;
    }
    setState({ kind: "analysing" });
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = URL.createObjectURL(take.blob);
    const frames = pitchFrames(take.samples, take.rate);
    const split = timing ? (timing[1] - timing[0]) / (timing[2] - timing[0]) : 0.5;
    last.current = { frames, split };
    const summary = summarize(frames, MIN_VOICED);
    if (!summary) {
      onTrack(null);
      setState({ kind: "done", heard: false });
      return;
    }
    const { takes } = loadSpeaker();
    if (isNewSpeaker(takes, summary)) {
      // Drawn as the current speaker's until the listener says otherwise.
      setStranger(summary);
      draw(takes);
    } else {
      draw(keepTake(summary).takes);
    }
    setState({ kind: "done", heard: true });
  };

  const playTake = () => {
    if (takeUrl.current) void new Audio(takeUrl.current).play();
  };

  const listening = state.kind === "listening";
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (listening ? endTake() : void record())}
          disabled={state.kind === "analysing"}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
            listening
              ? "animate-pulse border-rose-500 bg-rose-500 text-white"
              : "border-stone-300 bg-white"
          }`}
        >
          {state.kind === "analysing" ? (
            <FaSpinner className="animate-spin" />
          ) : listening ? (
            <FaStop />
          ) : (
            <FaMicrophone />
          )}
          {listening
            ? "Listening… say the word"
            : state.kind === "done"
              ? "Say it again"
              : "Say it"}
        </button>
        {state.kind === "done" && takeUrl.current && (
          <button
            type="button"
            onClick={playTake}
            aria-label="Play my take"
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-stone-600 active:bg-stone-200"
          >
            <FaPlay size={11} /> Mine
          </button>
        )}
        <span className="text-xs text-stone-500">
          {state.kind === "refused"
            ? "Microphone access was refused"
            : state.kind === "done" && !state.heard
              ? "No word heard; try again"
              : state.kind === "done"
                ? "Your voice: "
                : ""}
          {state.kind === "done" && state.heard && (
            <span className="font-medium" style={{ color: MINE_COLOR }}>
              this color
            </span>
          )}
        </span>
      </div>
      {stranger ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span>A different voice?</span>
          <button
            type="button"
            onClick={() => {
              draw(startFresh(stranger).takes);
              setStranger(null);
            }}
            className="rounded-full border border-amber-300 bg-white px-2.5 py-1 font-medium"
          >
            Start fresh
          </button>
          <button
            type="button"
            onClick={() => {
              draw(keepTake(stranger).takes);
              setStranger(null);
            }}
            className="rounded-full px-2.5 py-1"
          >
            Same voice
          </button>
        </div>
      ) : (
        speaker.takes > 0 && !speaker.calibrated && <Learning speaker={speaker} />
      )}
    </div>
  );
}

/** How far learning the listener's voice has come, with what that means on a tap. */
function Learning({ speaker }: { speaker: ReturnType<typeof fitSpeaker> }) {
  const [open, setOpen] = useState(false);
  const shown = Math.min(speaker.takes, speaker.needed);
  return (
    <div className="flex flex-col gap-1 text-xs text-stone-500">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start"
      >
        <span
          aria-hidden
          className="size-3.5 rounded-full"
          style={{
            background: `conic-gradient(${MINE_COLOR} ${speaker.progress * 360}deg, #e7e5e4 0)`,
          }}
        />
        Learning your voice · {shown} of ~{speaker.needed}
      </button>
      {open && (
        <p>
          Your line's height is set from your own pitch range, learned from your takes. Until it
          settles, the line is dashed, and its shape can be trusted more than its height. To start
          over for someone else, use Settings.
        </p>
      )}
    </div>
  );
}
