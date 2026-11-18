import type { Pattern, Word } from "./deck";
import { samePattern } from "./pinyin";

/**
 * Tone patterns accepted for `word`.
 *
 * The spoken pattern is always right: it is what the recording says. The citation pattern
 * (你好 written 3-3, said 2-3) is also accepted, unless another word in the family is said
 * that way, in which case the citation answer would name the other word.
 *
 * A word said 2-3 also accepts 3-3, whatever its citation tones: two third tones are said
 * 2-3, so the two cannot be told apart by ear, and the drill tests listening, not spelling.
 */
export function acceptedAnswers(word: Word, family: Word[]): Pattern[] {
  const accepted: Pattern[] = [word.spoken];
  const citationIsOtherWord = family.some(
    (w) => w.id !== word.id && samePattern(w.spoken, word.tones),
  );
  if (!samePattern(word.tones, word.spoken) && !citationIsOtherWord) accepted.push(word.tones);
  if (samePattern(word.spoken, [2, 3]) && !accepted.some((p) => samePattern(p, [3, 3]))) {
    accepted.push([3, 3]);
  }
  return accepted;
}

export function isCorrect(answer: Pattern, word: Word, family: Word[]): boolean {
  return acceptedAnswers(word, family).some((p) => samePattern(p, answer));
}

/**
 * How a pattern of written tones is said: two third tones are said 2-3. Other sandhi (一, 不)
 * depends on the character, which an answer does not name.
 */
export function spokenForm(pattern: Pattern): Pattern {
  return samePattern(pattern, [3, 3]) ? [2, 3] : pattern;
}

/**
 * The family member the answer describes, if any: the word the listener thought they heard.
 * An answer of 3-3 names a word written that way, or else any word said 2-3.
 */
export function wordForAnswer(answer: Pattern, family: Word[]): Word | undefined {
  return (
    family.find((w) => samePattern(w.spoken, answer)) ??
    family.find((w) => samePattern(w.tones, answer)) ??
    family.find((w) => samePattern(w.spoken, spokenForm(answer)))
  );
}
