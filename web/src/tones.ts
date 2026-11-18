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
 * Darker shades of the tone colors, for the measured pitch drawn over a contour: dark enough to
 * stand out from the contour, and still clearly the tone's hue.
 */
export const TONE_DARK: Record<Tone, string> = {
  1: "#b91c1c",
  2: "#c2410c",
  3: "#15803d",
  4: "#1d4ed8",
  5: "#44403c",
};

/** Pale shades of the tone colors, for the edge that keeps the measured pitch distinct. */
export const TONE_PALE: Record<Tone, string> = {
  1: "#fecaca",
  2: "#fed7aa",
  3: "#bbf7d0",
  4: "#bfdbfe",
  5: "#e7e5e4",
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
