import type { Pattern, Word } from "./deck";
import { samePattern } from "./pinyin";

/**
 * Tone patterns accepted for `word`.
 *
 * The spoken pattern is always right: it is what the recording says. The citation pattern
 * (你好 written 3-3, said 2-3) is also accepted, unless another word in the family is said
 * that way, in which case the citation answer would name the other word.
 */
export function acceptedAnswers(word: Word, family: Word[]): Pattern[] {
  const accepted: Pattern[] = [word.spoken];
  const citationIsOtherWord = family.some(
    (w) => w.id !== word.id && samePattern(w.spoken, word.tones),
  );
  if (!samePattern(word.tones, word.spoken) && !citationIsOtherWord) accepted.push(word.tones);
  return accepted;
}

export function isCorrect(answer: Pattern, word: Word, family: Word[]): boolean {
  return acceptedAnswers(word, family).some((p) => samePattern(p, answer));
}

/** The family member the answer describes, if any: the word the listener thought they heard. */
export function wordForAnswer(answer: Pattern, family: Word[]): Word | undefined {
  return (
    family.find((w) => samePattern(w.spoken, answer)) ??
    family.find((w) => samePattern(w.tones, answer))
  );
}
