import { samePattern } from "./pinyin";
/**
 * The word list written by the Python pipeline (web/public/data/words.json), with what was
 * measured in each recording (web/public/data/recordings.json).
 */

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
  /**
   * For a recording with no word of its own, made by re-pitching another word's recording to
   * this pattern: that word's pinyin and hanzi. Such a word has no hanzi or gloss.
   */
  madeFrom?: string;
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

/**
 * A recording's measured pitch: for each syllable, tenths of a level on the five-level scale
 * (35 is level 3.5) at evenly spaced points, null where it is unvoiced.
 */
export type PitchTrack = (number | null)[][];

/** What was measured in one recording (recordings.json). */
export interface Measured {
  /** A digest of the recording's content, added to its URL so a new recording is fetched. */
  v: string;
  t: Timing;
  p: PitchTrack;
}

/** A word's recording in one voice. */
export interface Recording {
  /** Relative to the site root, with the content digest. */
  url: string;
  timing: Timing;
  track: PitchTrack;
}

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
  /** Audio path → what was measured in it; a word-voice pair with no entry has no recording. */
  recordings: Record<string, Measured>;
}

export const ALL = "all";

async function loadJson(name: string): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

export async function loadDeck(): Promise<Deck> {
  const [words, recordings] = await Promise.all([
    loadJson("words.json"),
    loadJson("recordings.json"),
  ]);
  return {
    ...(words as Omit<Deck, "recordings">),
    recordings: recordings as Record<string, Measured>,
  };
}

export function audioPath(word: Word, voice: string): string {
  return `audio/${word.id}-${voice}.m4a`;
}

/** The word's recording in this voice, if there is one. */
export function recordingOf(deck: Deck, word: Word, voice: string): Recording | undefined {
  const path = audioPath(word, voice);
  const measured = deck.recordings[path];
  return measured && { url: `${path}?v=${measured.v}`, timing: measured.t, track: measured.p };
}

/** The words drilled in a lesson: all of them, or only real words when `realOnly`. */
export function drillWords(deck: Deck, scope: string, realOnly: boolean): Word[] {
  return wordsInScope(deck, scope).filter((w) => w.real || !realOnly);
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

/** The words of `recorded` that have a recording in this voice. */
export function recordedIn(deck: Deck, word: Word, voice: string): Word[] {
  return recorded(deck, word).filter((w) => recordingOf(deck, w, voice) !== undefined);
}

/** The family's word for a tone pattern: the drill word or comparison recording said that
 * way, a real word before a made-up one. */
export function wordFor(words: Word[], pattern: Tone[]): Word | undefined {
  const said = words.filter((w) => samePattern(w.spoken, pattern));
  return said.find((w) => w.real) ?? said[0];
}
