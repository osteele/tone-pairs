/**
 * The pitch of a take of the listener saying a word, as a track that can be drawn on a staff
 * over the recording's: found every 10 ms, scaled to the listener's own range, and split into
 * the word's two syllables.
 */

import { PitchDetector } from "pitchy";
import type { PitchTrack } from "./deck";

export const FRAME_SECONDS = 0.01;
/** Below this clarity a frame is taken as unvoiced. */
const MIN_CLARITY = 0.8;
const MIN_HZ = 60;
const MAX_HZ = 600;
/** Points per syllable in a drawn track. */
const POINTS = 24;
/** A take with fewer voiced frames than this held no word. */
const MIN_VOICED = 8;
/**
 * A voice's range is at least this many semitones wide, so a take that stays on one pitch (a
 * word of two first tones) is not stretched across the whole staff.
 */
const MIN_SPAN_SEMITONES = 8;

/** Per 10 ms frame: the pitch in Hz, or null where unvoiced, and the loudness. */
export interface Frames {
  hz: (number | null)[];
  rms: number[];
}

/** A voice's range: the pitches drawn at levels 1 and 5. */
export interface Range {
  lo: number;
  hi: number;
}

export function pitchFrames(samples: Float32Array, rate: number): Frames {
  // About 40 ms, long enough to hold two periods of a low voice.
  let window = 512;
  while (window < rate * 0.04) window *= 2;
  const hop = Math.round(rate * FRAME_SECONDS);
  const detector = PitchDetector.forFloat32Array(window);
  const hz: (number | null)[] = [];
  const rms: number[] = [];
  for (let start = 0; start + window <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + window);
    let sum = 0;
    for (const x of frame) sum += x * x;
    rms.push(Math.sqrt(sum / window));
    const [pitch, clarity] = detector.findPitch(frame, rate);
    hz.push(clarity >= MIN_CLARITY && pitch >= MIN_HZ && pitch <= MAX_HZ ? pitch : null);
  }
  return { hz, rms };
}

const semitones = (hz: number) => 12 * Math.log2(hz);

function percentile(sorted: number[], q: number): number {
  return sorted[Math.round(q * (sorted.length - 1))]!;
}

/** The range of one take: its 5th and 95th percentile pitch, as for the recordings. */
export function takeRange(frames: Frames): Range | null {
  const voiced = frames.hz.filter((h): h is number => h !== null).sort((a, b) => a - b);
  if (voiced.length < MIN_VOICED) return null;
  return { lo: percentile(voiced, 0.05), hi: percentile(voiced, 0.95) };
}

/**
 * The listener's range, from the ranges of their recent takes: the median of each end, widened
 * about its middle to at least MIN_SPAN_SEMITONES.
 */
export function voiceRange(takes: readonly Range[]): Range | null {
  if (takes.length === 0) return null;
  const lo = percentile(
    takes.map((t) => t.lo).sort((a, b) => a - b),
    0.5,
  );
  const hi = percentile(
    takes.map((t) => t.hi).sort((a, b) => a - b),
    0.5,
  );
  const span = semitones(hi) - semitones(lo);
  if (span >= MIN_SPAN_SEMITONES) return { lo, hi };
  const middle = (semitones(lo) + semitones(hi)) / 2;
  const half = MIN_SPAN_SEMITONES / 2;
  return { lo: 2 ** ((middle - half) / 12), hi: 2 ** ((middle + half) / 12) };
}

/** A pitch's level on the five-level staff, 1 at the range's low end and 5 at its high end. */
export function level(hz: number, range: Range): number {
  const low = semitones(range.lo);
  return 1 + (4 * (semitones(hz) - low)) / (semitones(range.hi) - low);
}

/**
 * Where the take divides into its two syllables: the quietest frame near where the recording
 * divides, as a fraction `split` of its speech. Between syllables the voice dips or stops.
 */
export function divide(frames: Frames, first: number, last: number, split: number): number {
  const length = last - first + 1;
  const target = first + split * length;
  const reach = Math.max(1, Math.round(0.15 * length));
  const loudest = Math.max(...frames.rms.slice(first, last + 1), Number.EPSILON);
  let best = Math.round(target);
  let bestScore = Number.POSITIVE_INFINITY;
  for (
    let i = Math.max(first + 1, Math.round(target) - reach);
    i <= Math.min(last - 1, Math.round(target) + reach);
    i++
  ) {
    const score = frames.rms[i]! / loudest + (0.5 * Math.abs(i - target)) / length;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Average each run of frames into POINTS points, in tenths of a level; null where unvoiced. */
function resample(levels: (number | null)[]): (number | null)[] {
  return Array.from({ length: POINTS }, (_, j) => {
    const from = Math.floor((j * levels.length) / POINTS);
    const to = Math.max(from + 1, Math.floor(((j + 1) * levels.length) / POINTS));
    const voiced = levels.slice(from, to).filter((l): l is number => l !== null);
    if (voiced.length === 0) return null;
    return Math.round((10 * voiced.reduce((a, b) => a + b, 0)) / voiced.length);
  });
}

/**
 * The take as a two-syllable track, from its first voiced frame to its last, divided where the
 * recording's syllables divide (`split`, a fraction of its speech). Null if no word was heard.
 */
export function takeTrack(frames: Frames, split: number, range: Range): PitchTrack | null {
  const voicedAt = frames.hz.flatMap((h, i) => (h === null ? [] : [i]));
  if (voicedAt.length < MIN_VOICED) return null;
  const first = voicedAt[0]!;
  const last = voicedAt[voicedAt.length - 1]!;
  const cut = divide(frames, first, last, split);
  const levels = frames.hz.map((h) => (h === null ? null : level(h, range)));
  return [resample(levels.slice(first, cut)), resample(levels.slice(cut, last + 1))];
}
