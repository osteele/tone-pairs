import type { Clip } from "./audio";
import type { Deck, Word } from "./deck";
import { drillWords, recorded, recordingOf } from "./deck";
import type { Card, Progress, Review } from "./progress";
import { introducedOn, localDate } from "./progress";
import type { Pick } from "./queue";
import { pickNext } from "./queue";

export type Mode = "scheduled" | "extra";

export interface Prompt {
  word: Word;
  voice: string;
  kind: Pick["kind"] | "extra";
}

const LOOKAHEAD_MS = 20 * 60 * 1000;

export function newAllowed(progress: Progress, now: Date): number {
  return Math.max(0, progress.settings.newPerDay - introducedOn(progress, localDate(now)));
}

/** A voice for this word that the listener has not flagged (any voice if all are flagged). */
export function chooseVoice(deck: Deck, word: Word, progress: Progress, avoid?: string): string {
  const keys = deck.voices.map((v) => v.key);
  const usable = keys.filter((k) => !progress.flagged.includes(`${word.id}:${k}`));
  const pool = usable.length > 0 ? usable : keys;
  const fresh = pool.filter((k) => k !== avoid);
  const choices = fresh.length > 0 ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)]!;
}

/** Answers counted when weighting Practice: recent enough to reflect what is hard now. */
const RECENT_REVIEWS = 400;
/** The weight of a tone pattern never answered: the smoothed miss rate of no answers. */
export const UNSEEN_WEIGHT = 0.5;
/** No pattern drops below this, so one answered well still comes up now and then. */
const MIN_WEIGHT = 0.1;

const patternKey = (pattern: readonly number[]) => pattern.join("-");

/**
 * How often to practice each tone pattern, as said: its miss rate over recent answers, smoothed
 * so a pattern answered once is not weighted by that one answer ((misses + 1) / (answers + 2)).
 * Keyed by pattern, not word, so a pattern the listener mishears is practiced in every word that
 * has it, including words they have not yet missed.
 */
export function patternWeights(
  reviews: readonly Review[],
  words: readonly Word[],
): Map<string, number> {
  const byId = new Map(words.map((w) => [w.id, w]));
  const counts = new Map<string, { answers: number; misses: number }>();
  for (const review of reviews.slice(-RECENT_REVIEWS)) {
    const word = byId.get(review.word);
    if (!word) continue;
    const key = patternKey(word.spoken);
    const count = counts.get(key) ?? { answers: 0, misses: 0 };
    count.answers += 1;
    // A Show answer is recorded as a miss too: the listener could not tell.
    if (!review.correct) count.misses += 1;
    counts.set(key, count);
  }
  return new Map(
    [...counts].map(([key, { answers, misses }]) => [
      key,
      Math.max(MIN_WEIGHT, (misses + 1) / (answers + 2)),
    ]),
  );
}

/** One item of `pool`, chosen with probability proportional to its weight. */
export function weightedPick<T>(
  pool: readonly T[],
  weight: (item: T) => number,
  random: () => number,
): T | undefined {
  const weights = pool.map(weight);
  let left = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    left -= weights[i]!;
    if (left < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function nextPrompt(
  deck: Deck,
  progress: Progress,
  mode: Mode,
  lastId: string | undefined,
  now: Date,
): Prompt | null {
  const scope = drillWords(deck, progress.settings.scope, progress.settings.realOnly);
  if (mode === "extra") {
    const others = scope.filter((w) => w.id !== lastId);
    const pool = others.length > 0 ? others : scope;
    const weights = patternWeights(progress.reviews, deck.words);
    const word = weightedPick(
      pool,
      (w) => weights.get(patternKey(w.spoken)) ?? UNSEEN_WEIGHT,
      Math.random,
    );
    return word ? { word, voice: chooseVoice(deck, word, progress), kind: "extra" } : null;
  }
  const pick = pickNext(scope, progress.cards, {
    now,
    newAllowed: newAllowed(progress, now),
    lastId,
    lookaheadMs: LOOKAHEAD_MS,
    random: Math.random,
  });
  return pick
    ? { word: pick.word, voice: chooseVoice(deck, pick.word, progress), kind: pick.kind }
    : null;
}

/** Seconds of audio kept after speech ends, so a clip does not sound cut off. */
const TAIL_SECONDS = 0.25;

/** The word's recording in this voice, as a clip trimmed to its speech; none if unrecorded. */
export function clipFor(deck: Deck, word: Word, voice: string): Clip | undefined {
  const recording = recordingOf(deck, word, voice);
  if (!recording) return undefined;
  return { path: recording.url, stopAt: recording.timing[2] + TAIL_SECONDS };
}

/** The slowed playback speed: slow enough to follow the contour, fast enough to stay a word. */
export const SLOW_RATE = 0.5;
/**
 * A syllable played alone starts this long before the measured division, so a consonant at the
 * start of the second syllable, which the division may cut into, is heard whole.
 */
const SYLLABLE_LEAD_SECONDS = 0.04;

/** One syllable of the word's recording, played alone. */
export function syllableClip(
  deck: Deck,
  word: Word,
  voice: string,
  syllable: number,
): Clip | undefined {
  const recording = recordingOf(deck, word, voice);
  if (!recording) return undefined;
  const [, divide, end] = recording.timing;
  return syllable === 0
    ? { path: recording.url, stopAt: divide }
    : {
        path: recording.url,
        startAt: Math.max(0, divide - SYLLABLE_LEAD_SECONDS),
        stopAt: end + TAIL_SECONDS,
      };
}

/** Every recording of the word's family in this voice: whatever the feedback may play. */
export function familyPaths(deck: Deck, word: Word, voice: string): string[] {
  return recorded(deck, word)
    .map((w) => recordingOf(deck, w, voice)?.url)
    .filter((p): p is string => p !== undefined);
}

/**
 * Whether a right answer moves on by itself. Extra practice and reviews of learned words do;
 * a word still being learned (new, or in its learning steps) stays up for review, as a wrong
 * answer does. `card` is the word's state before this answer.
 */
export function advancesAfterRight(mode: Mode, card: Card | undefined): boolean {
  return mode === "extra" || card?.scheduleStatus === "review";
}
