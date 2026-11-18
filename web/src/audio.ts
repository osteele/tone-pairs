/**
 * One shared <audio> element. iOS Safari lets a page play audio only after a user gesture
 * has started playback on that element; reusing a single element keeps it unlocked, so
 * clips played after a timer (auto-advance, sequences, loops) still sound.
 *
 * HTMLAudioElement rather than Web Audio, so playback ignores the iPhone's silent switch.
 */

import { anchor } from "./clock";

export type PlayResult = "played" | "blocked";

export interface Clip {
  path: string;
  /** Seconds into the recording at which to start; the start of the file when absent. */
  startAt?: number;
  /** Seconds into the recording at which to stop: the end of speech plus a short tail. */
  stopAt?: number;
  /** Playback speed, 1 when absent. Pitch is kept: a slowed word keeps its tones. */
  rate?: number;
}

export interface Playback {
  /** The clip playing, or null when stopped. */
  clip: Clip | null;
  /** Seconds into the recording, whatever the clip's start and speed. */
  time: number;
  /** A clip is loaded and playing, but no sound has come out yet. */
  waiting: boolean;
  /** Index of the clip within the current sequence. */
  index: number;
  looping: boolean;
}

type Listener = (state: Playback) => void;

// Between the clips of a sequence, short so the two words are heard as a pair; between
// repeats of a loop, longer, so each repeat starts as a new pair.
const GAP_MS = 175;
const LOOP_GAP_MS = 900;

const player = new Audio();
player.preload = "auto";

let sequence: Clip[] = [];
let index = 0;
let looping = false;
let pending: number | undefined;
let frame: number | undefined;
let generation = 0;
// When the playing clip started, by performance.now(), or null until its sound starts (see
// clock.ts). The clock measures time heard, so a slowed clip's position in the recording is
// elapsed time times its speed, after its start.
let startedAt: number | null = null;
const listeners = new Set<Listener>();

const elapsed = () => (startedAt === null ? 0 : (performance.now() - startedAt) / 1000);
/** Where the playing clip is in its recording, in seconds. */
const position = (clip: Clip) => (clip.startAt ?? 0) + elapsed() * (clip.rate ?? 1);

function emit(): void {
  const clip = frame === undefined ? null : (sequence[index] ?? null);
  const state: Playback = {
    clip,
    time: clip ? position(clip) : 0,
    waiting: frame !== undefined && startedAt === null,
    index,
    looping,
  };
  for (const listener of listeners) listener(state);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function halt(): void {
  window.clearTimeout(pending);
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
  player.pause();
}

export function stop(): void {
  generation += 1;
  halt();
  looping = false;
  emit();
}

function tick(): void {
  const clip = sequence[index];
  if (!clip) return;
  // The player's position, as time heard since the clip's start.
  const heard = (player.currentTime - (clip.startAt ?? 0)) / (clip.rate ?? 1);
  startedAt = anchor(startedAt, performance.now(), heard);
  if (clip.stopAt !== undefined && position(clip) >= clip.stopAt) {
    finishClip();
    return;
  }
  emit();
  frame = requestAnimationFrame(tick);
}

function finishClip(): void {
  const run = generation;
  halt();
  emit();
  const last = index === sequence.length - 1;
  if (last && !looping) return;
  pending = window.setTimeout(
    () => {
      if (run !== generation) return;
      index = last ? 0 : index + 1;
      void start(run);
    },
    last ? LOOP_GAP_MS : GAP_MS,
  );
}

const url = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;

async function start(run: number): Promise<PlayResult> {
  const clip = sequence[index]!;
  // The source is assigned on every play, even a replay of the same clip. Rewinding the
  // loaded clip instead (currentTime = 0) made every other replay in Safari break up into
  // snippets separated by silence.
  // A media fragment starts the clip partway in. Assigning a source resets the speed to
  // the default, so the speed is set after it.
  player.src = clip.startAt ? `${url(clip.path)}#t=${clip.startAt.toFixed(3)}` : url(clip.path);
  player.preservesPitch = true;
  player.defaultPlaybackRate = clip.rate ?? 1;
  player.playbackRate = clip.rate ?? 1;
  startedAt = null;
  try {
    await player.play();
  } catch (error) {
    // NotAllowedError: no user gesture yet. AbortError: a newer play() replaced this one.
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      stop();
      return "blocked";
    }
    if (error instanceof DOMException && error.name === "AbortError") return "played";
    throw error;
  }
  if (run !== generation) return "played";
  frame = requestAnimationFrame(tick);
  return "played";
}

player.addEventListener("ended", () => {
  if (frame !== undefined) finishClip();
});

/** Play clips one after another, optionally repeating until stopped. */
export function playSequence(clips: Clip[], options: { loop?: boolean } = {}): Promise<PlayResult> {
  generation += 1;
  halt();
  sequence = clips;
  index = 0;
  looping = options.loop ?? false;
  return start(generation);
}

export function play(clip: Clip): Promise<PlayResult> {
  return playSequence([clip]);
}

/**
 * Fetch recordings that may be played soon, so they start without a network delay. The
 * service worker saves each one as it arrives. A failure only means the clip loads when played.
 */
export function prefetch(paths: Iterable<string>): void {
  for (const path of new Set(paths)) {
    fetch(url(path)).catch((error: unknown) => {
      // fetch rejects with a TypeError when the network is unreachable.
      if (!(error instanceof TypeError)) throw error;
    });
  }
}
