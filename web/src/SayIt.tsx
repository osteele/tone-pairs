import { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaPlay, FaSpinner, FaStop } from "react-icons/fa6";
import type { PitchTrack, Timing } from "./deck";
import { MINE_COLOR } from "./tones";
import { endTake, recordTake, savedRanges, saveRange } from "./voice";
import { pitchFrames, takeRange, takeTrack, voiceRange } from "./voicePitch";

type State =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "analysing" }
  | { kind: "done"; heard: boolean }
  | { kind: "refused" };

/**
 * Record the listener saying the word, and report their pitch as a track to draw on the
 * word's staff. `timing` is the recording's, so the take divides where its syllables do.
 */
export function SayIt({
  timing,
  onTrack,
}: {
  timing: Timing | undefined;
  onTrack: (track: PitchTrack | null) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const takeUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      endTake();
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    },
    [],
  );

  const record = async () => {
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
    const own = takeRange(frames);
    const range = voiceRange(own ? saveRange(own) : savedRanges());
    const split = timing ? (timing[1] - timing[0]) / (timing[2] - timing[0]) : 0.5;
    const track = range && takeTrack(frames, split, range);
    onTrack(track);
    setState({ kind: "done", heard: track !== null });
  };

  const playTake = () => {
    if (takeUrl.current) void new Audio(takeUrl.current).play();
  };

  const listening = state.kind === "listening";
  return (
    <div className="flex items-center gap-2 text-sm">
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
        {listening ? "Listening… say the word" : state.kind === "done" ? "Say it again" : "Say it"}
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
  );
}
