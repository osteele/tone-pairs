import type { Clip } from "./audio";
import type { Deck, Word } from "./deck";
import { wordsInScope } from "./deck";
import type { Card, Progress } from "./progress";
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

export function nextPrompt(
  deck: Deck,
  progress: Progress,
  mode: Mode,
  lastId: string | undefined,
  now: Date,
): Prompt | null {
  const scope = wordsInScope(deck, progress.settings.scope);
  if (mode === "extra") {
    const others = scope.filter((w) => w.id !== lastId);
    const pool = others.length > 0 ? others : scope;
    const word = pool[Math.floor(Math.random() * pool.length)];
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

export function clipFor(deck: Deck, word: Word, voice: string): Clip {
  const path = word.audio[voice]!;
  const timing = deck.timing[path];
  return { path, stopAt: timing ? timing[2] + TAIL_SECONDS : undefined };
}

/**
 * Whether a right answer moves on by itself. Extra practice and reviews of learned words do;
 * a word still being learned (new, or in its learning steps) stays up for review, as a wrong
 * answer does. `card` is the word's state before this answer.
 */
export function advancesAfterRight(mode: Mode, card: Card | undefined): boolean {
  return mode === "extra" || card?.scheduleStatus === "review";
}
