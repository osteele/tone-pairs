/** The word list written by the Python pipeline (web/public/data/words.json). */

export type Tone = 1 | 2 | 3 | 4 | 5;
export type Pattern = readonly Tone[];

export interface Word {
  id: string;
  hanzi: string;
  pinyin: string;
  syllables: string[];
  /** Citation (dictionary) tones. */
  tones: Tone[];
  /** Tones as said, after third-tone, 一 and 不 sandhi. */
  spoken: Tone[];
  gloss: string;
  /** False for pseudo-words built from two characters to fill out a family. */
  real: boolean;
  family: string;
  exercises: string[];
  /** Voice key → audio path relative to the site root. */
  audio: Record<string, string>;
}

export interface Family {
  key: string;
  printed: string[];
  exercises: string[];
  /** Ids of the drill words. */
  words: string[];
  /** Recordings of the family's other tone patterns, played only to compare with an answer. */
  contrasts: Word[];
}

/** Seconds into a recording: [speech starts, syllables divide, speech ends]. */
export type Timing = [number, number, number];

export interface Exercise {
  id: string;
  title: string;
}

export interface Voice {
  key: string;
  label: string;
}

export interface Deck {
  exercises: Exercise[];
  voices: Voice[];
  families: Family[];
  words: Word[];
  /** Audio path → timing. */
  timing: Record<string, Timing>;
}

export const ALL = "all";

export async function loadDeck(): Promise<Deck> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/words.json`);
  if (!response.ok) throw new Error(`words.json: HTTP ${response.status}`);
  return (await response.json()) as Deck;
}

export function wordsInScope(deck: Deck, scope: string): Word[] {
  return scope === ALL ? deck.words : deck.words.filter((w) => w.exercises.includes(scope));
}

/** The drill words that share this word's syllables. */
export function siblings(deck: Deck, word: Word): Word[] {
  return deck.words.filter((w) => w.family === word.family);
}

/** Every recorded word with this word's syllables: drill words, then contrast recordings. */
export function recorded(deck: Deck, word: Word): Word[] {
  const family = deck.families.find((f) => f.key === word.family);
  return [...siblings(deck, word), ...(family?.contrasts ?? [])];
}
