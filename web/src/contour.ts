/**
 * Idealized tone contours on Chao's five-level pitch scale (1 = low, 5 = high).
 *
 * These are classroom shapes, not measured pitch: 55, 35, 51, and a third tone as a low dip,
 * 212 at the end of a word and 21 before another syllable, as the course draws them rather
 * than the full 214 of a third tone said alone. A neutral tone is a short pitch set by the
 * tone before it.
 */

import type { Pattern, Timing, Tone } from "./deck";

/** Pitch levels at evenly spaced points through one syllable. */
export type Levels = readonly number[];

const NEUTRAL_AFTER: Record<Tone, number> = { 1: 2, 2: 3, 3: 4, 4: 1, 5: 2 };

export function syllableLevels(tone: Tone, previous: Tone | null, last: boolean): Levels {
  switch (tone) {
    case 1:
      return [5, 5];
    case 2:
      return [3, 5];
    case 3:
      return last ? [2, 1, 2] : [2, 1, 1];
    case 4:
      return [5, 1];
    case 5: {
      const level = NEUTRAL_AFTER[previous ?? 5];
      return [level, Math.max(1, level - 0.5)];
    }
  }
}

export function patternLevels(pattern: Pattern): Levels[] {
  return pattern.map((tone, i) =>
    syllableLevels(tone, i > 0 ? pattern[i - 1]! : null, i === pattern.length - 1),
  );
}

/** Relative width of each syllable: neutral tones are short. */
export function syllableWeights(pattern: Pattern): number[] {
  return pattern.map((t) => (t === 5 ? 0.5 : 1));
}

/** Level at fraction `f` (0-1) through a syllable, eased between control points. */
export function levelAt(levels: Levels, f: number): number {
  const segments = levels.length - 1;
  const position = Math.min(Math.max(f, 0), 1) * segments;
  const i = Math.min(Math.floor(position), segments - 1);
  const local = position - i;
  const eased = (1 - Math.cos(Math.PI * local)) / 2;
  return levels[i]! + (levels[i + 1]! - levels[i]!) * eased;
}

/** Where playback is: which syllable, and how far through it (0-1). */
export interface Place {
  syllable: number;
  fraction: number;
}

/** Map a time in a two-syllable recording to a place on its contour. */
export function placeAt(time: number, [start, split, end]: Timing): Place {
  if (time <= start) return { syllable: 0, fraction: 0 };
  if (time < split) return { syllable: 0, fraction: (time - start) / (split - start) };
  if (time < end) return { syllable: 1, fraction: (time - split) / (end - split) };
  return { syllable: 1, fraction: 1 };
}
