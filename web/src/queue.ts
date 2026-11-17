import type { Word } from "./deck";

export interface Due {
  dueAt: Date;
}

export type PickKind = "due" | "new" | "ahead";

export interface Pick {
  word: Word;
  kind: PickKind;
}

export interface PickOptions {
  now: Date;
  /** How many more unseen words may be introduced today. */
  newAllowed: number;
  /** The word just shown; not repeated immediately when anything else is available. */
  lastId?: string;
  /** With nothing due and no new words allowed, show learning cards due within this many ms. */
  lookaheadMs: number;
  random: () => number;
}

/**
 * The next word to drill: due cards first (earliest first), then new words, then cards
 * coming due soon.
 *
 * New words are introduced a family at a time, in deck order, so that the words that differ
 * only in tone are heard close together.
 */
export function pickNext(
  scope: Word[],
  cards: Readonly<Record<string, Due | undefined>>,
  options: PickOptions,
): Pick | null {
  const { now, lastId } = options;
  const notLast = (w: Word) => w.id !== lastId;

  const seen = scope.filter((w) => cards[w.id] !== undefined);
  const byDue = (a: Word, b: Word) => cards[a.id]!.dueAt.getTime() - cards[b.id]!.dueAt.getTime();

  const due = seen.filter((w) => cards[w.id]!.dueAt <= now).sort(byDue);
  const dueChoice = due.find(notLast);
  if (dueChoice) return { word: dueChoice, kind: "due" };

  if (options.newAllowed > 0) {
    const unseen = scope.filter((w) => cards[w.id] === undefined);
    const family = unseen[0]?.family;
    if (family !== undefined) {
      const members = unseen.filter((w) => w.family === family);
      const word = members[Math.floor(options.random() * members.length)]!;
      return { word, kind: "new" };
    }
  }

  const horizon = now.getTime() + options.lookaheadMs;
  const soon = seen.filter((w) => cards[w.id]!.dueAt.getTime() <= horizon).sort(byDue);
  const choice = soon.find(notLast) ?? soon[0];
  if (choice === undefined) return null;
  return { word: choice, kind: cards[choice.id]!.dueAt <= now ? "due" : "ahead" };
}

export interface Counts {
  due: number;
  unseen: number;
  learned: number;
}

export function countScope(
  scope: Word[],
  cards: Readonly<Record<string, Due | undefined>>,
  now: Date,
): Counts {
  let due = 0;
  let unseen = 0;
  for (const word of scope) {
    const card = cards[word.id];
    if (card === undefined) unseen += 1;
    else if (card.dueAt <= now) due += 1;
  }
  return { due, unseen, learned: scope.length - unseen };
}
