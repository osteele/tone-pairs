/** Review state, kept in localStorage on the device. */

import { DefaultScheduler, Rating } from "ts-fsrs";
import { ALL } from "./deck";

export const createScheduler = () =>
  DefaultScheduler({
    version: "FSRS-7",
    enableFuzz: true,
    learningSteps: ["1m", "10m"],
    relearningSteps: ["10m"],
  });

export type Scheduler = Awaited<ReturnType<typeof createScheduler>>;
export type Card = ReturnType<Scheduler["newCard"]>;

export interface Review {
  at: string;
  word: string;
  voice: string;
  answer: number[];
  correct: boolean;
  /** False for extra practice, which does not change the schedule. */
  scheduled: boolean;
}

/** What tapping a lesson on the start screen does. */
export type HomeMode = "learn" | "practice" | "browse";

export interface Settings {
  newPerDay: number;
  autoAdvance: boolean;
  /** The lesson last chosen. */
  scope: string;
  homeMode: HomeMode;
}

export interface Progress {
  version: number;
  cards: Record<string, Card>;
  /** Word id → local date (YYYY-MM-DD) of its first scheduled review. */
  introduced: Record<string, string>;
  reviews: Review[];
  settings: Settings;
  /** `${wordId}:${voiceKey}` for recordings the listener reported as wrong. */
  flagged: string[];
}

const KEY = "tone-pairs/v1";
const VERSION = 2;
const MAX_REVIEWS = 5000;

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  autoAdvance: true,
  scope: ALL,
  homeMode: "learn",
};

export function emptyProgress(): Progress {
  return {
    version: VERSION,
    cards: {},
    introduced: {},
    reviews: [],
    settings: { ...DEFAULT_SETTINGS },
    flagged: [],
  };
}

function reviveCard(raw: Card): Card {
  return {
    ...raw,
    dueAt: new Date(raw.dueAt),
    lastReviewAt: raw.lastReviewAt === null ? null : new Date(raw.lastReviewAt),
  };
}

export function parseProgress(text: string): Progress {
  const raw = JSON.parse(text) as Progress;
  const cards: Record<string, Card> = {};
  for (const [id, card] of Object.entries(raw.cards)) cards[id] = reviveCard(card);
  return { ...emptyProgress(), ...raw, cards, settings: { ...DEFAULT_SETTINGS, ...raw.settings } };
}

/**
 * Rename version-1 word ids (`yi1ci4`) to the current ids, which add a digest of the hanzi
 * (`yi1ci4-26d5a2`). An old id shared by two words (一次 and 依次) was one card for both, so
 * its history is dropped and both words start fresh.
 */
export function migrateIds(progress: Progress, ids: string[]): Progress {
  if (progress.version >= VERSION) return progress;
  const candidates = new Map<string, string[]>();
  for (const id of ids) {
    const old = id.replace(/-[0-9a-f]{6}$/, "");
    candidates.set(old, [...(candidates.get(old) ?? []), id]);
  }
  const rename = (old: string): string | null => {
    const found = candidates.get(old);
    if (found === undefined) return old;
    return found.length === 1 ? found[0]! : null;
  };
  const rekey = <T>(record: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [old, value] of Object.entries(record)) {
      const id = rename(old);
      if (id !== null) out[id] = value;
    }
    return out;
  };
  const flagged = progress.flagged.flatMap((key) => {
    const at = key.lastIndexOf(":");
    const id = rename(key.slice(0, at));
    return id === null ? [] : [`${id}${key.slice(at)}`];
  });
  const reviews = progress.reviews.flatMap((review) => {
    const id = rename(review.word);
    return id === null ? [] : [{ ...review, word: id }];
  });
  return {
    ...progress,
    version: VERSION,
    cards: rekey(progress.cards),
    introduced: rekey(progress.introduced),
    reviews,
    flagged,
  };
}

export function loadProgress(): Progress {
  const text = localStorage.getItem(KEY);
  return text === null ? emptyProgress() : parseProgress(text);
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(KEY, JSON.stringify(progress));
}

export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function introducedOn(progress: Progress, day: string): number {
  return Object.values(progress.introduced).filter((d) => d === day).length;
}

/** Record one answer; returns the new progress (the input is not modified). */
export function record(
  progress: Progress,
  scheduler: Scheduler,
  entry: { word: string; voice: string; answer: number[]; correct: boolean; scheduled: boolean },
  now: Date,
): Progress {
  const review: Review = { ...entry, at: now.toISOString() };
  const reviews = [...progress.reviews, review].slice(-MAX_REVIEWS);
  if (!entry.scheduled) return { ...progress, reviews };

  const card = progress.cards[entry.word] ?? scheduler.newCard({ now });
  const grade = entry.correct ? Rating.Good : Rating.Again;
  const next = scheduler.review({ card, grade, now }).card;
  const introduced =
    entry.word in progress.introduced
      ? progress.introduced
      : { ...progress.introduced, [entry.word]: localDate(now) };
  return { ...progress, reviews, introduced, cards: { ...progress.cards, [entry.word]: next } };
}
