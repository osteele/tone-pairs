import type { Pattern, Tone } from "./deck";

// Combining macron, acute, caron, and grave accents.
const MARKS: Record<Tone, string> = {
  1: String.fromCharCode(0x304),
  2: String.fromCharCode(0x301),
  3: String.fromCharCode(0x30c),
  4: String.fromCharCode(0x300),
  5: "",
};

/** One syllable with its tone mark: ("jian", 1) → "jiān". */
export function markSyllable(syllable: string, tone: Tone): string {
  const text = syllable.replace("u:", "ü");
  if (tone === 5) return text;
  let index: number;
  if (text.includes("a")) index = text.indexOf("a");
  else if (text.includes("e")) index = text.indexOf("e");
  else if (text.includes("ou")) index = text.indexOf("o");
  else index = Math.max(...[...text].map((ch, i) => ("aeiouü".includes(ch) ? i : -1)));
  return (text.slice(0, index + 1) + MARKS[tone] + text.slice(index + 1)).normalize("NFC");
}

export function samePattern(a: Pattern, b: Pattern): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}
