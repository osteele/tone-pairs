import type { Tone } from "./deck";

/**
 * Tone colors, after the scheme Pleco and MDBG use: first tone red, second orange, third green,
 * fourth blue, neutral gray. Used wherever a tone is shown (the answer buttons, pinyin, and each
 * syllable of a contour), so a color comes to stand for its tone.
 */
export const TONE_COLORS: Record<Tone, string> = {
  1: "#dc2626",
  2: "#ea8c00",
  3: "#16a34a",
  4: "#2563eb",
  5: "#78716c",
};

/**
 * Which word a staff or row shows. These colors stay clear of the tone colors, and of the
 * green and red that mark a right or wrong answer.
 */
export const ROLES = {
  played: { color: "#334155", tint: "#f1f5f9" },
  answered: { color: "#9333ea", tint: "#faf5ff" },
  other: { color: "#a8a29e", tint: "#fafaf9" },
} as const;

export type Role = keyof typeof ROLES;
