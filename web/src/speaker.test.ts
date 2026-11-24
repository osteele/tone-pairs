import { describe, expect, test } from "bun:test";
import {
  changeProbability,
  fitSpeaker,
  hertz,
  isNewSpeaker,
  SETTLED_SD,
  summarize,
  type TakeSummary,
} from "./speaker";

/** Takes of a voice whose typical pitch is `center`, scattered as words make it. */
const takes = (center: number, n: number): TakeSummary[] =>
  Array.from({ length: n }, (_, i) => ({ m: center + [-2, 1, 2, -1, 0][i % 5]!, s: 7 }));

describe("summarize", () => {
  test("takes the median and spread of the voiced frames", () => {
    const hz = [null, ...Array.from({ length: 21 }, (_, i) => hertz(i)), null];
    const summary = summarize({ hz, rms: hz.map(() => 0.1) })!;
    expect(summary.m).toBeCloseTo(10);
    expect(summary.s).toBeCloseTo(16);
  });

  test("hears nothing in a take with too little voice", () => {
    expect(summarize({ hz: [100, null, 100], rms: [0.1, 0, 0.1] })).toBeNull();
  });
});

describe("fitSpeaker", () => {
  test("knows nothing before the first take", () => {
    const speaker = fitSpeaker([]);
    expect(speaker.progress).toBe(0);
    expect(speaker.calibrated).toBe(false);
    expect(speaker.needed).toBeGreaterThanOrEqual(5);
    expect(speaker.needed).toBeLessThanOrEqual(10);
  });

  test("decides between a low and a high voice from one take", () => {
    expect(fitSpeaker([{ m: 14, s: 7 }]).center).toBeGreaterThan(12);
    expect(fitSpeaker([{ m: 2, s: 7 }]).center).toBeLessThan(4);
  });

  test("settles after about `needed` takes, with progress rising to 1", () => {
    const needed = fitSpeaker([]).needed;
    const early = fitSpeaker(takes(3, 2));
    const settled = fitSpeaker(takes(3, needed));
    expect(early.progress).toBeGreaterThan(0);
    expect(early.progress).toBeLessThan(settled.progress);
    expect(settled.calibrated).toBe(true);
    expect(settled.sd).toBeLessThanOrEqual(SETTLED_SD);
    expect(settled.progress).toBe(1);
    expect(fitSpeaker(takes(3, needed - 2)).calibrated).toBe(false);
  });

  test("puts levels 1 and 5 about the typical pitch, wider for a wider-ranging voice", () => {
    const narrow = fitSpeaker(takes(3, 10).map((t) => ({ ...t, s: 5 })));
    const wide = fitSpeaker(takes(3, 10).map((t) => ({ ...t, s: 10 })));
    const width = (r: { lo: number; hi: number }) => 12 * Math.log2(r.hi / r.lo);
    expect(narrow.range.lo).toBeLessThan(hertz(narrow.center));
    expect(narrow.range.hi).toBeGreaterThan(hertz(narrow.center));
    expect(width(wide.range)).toBeGreaterThan(width(narrow.range));
  });
});

describe("a voice said on nearly one pitch", () => {
  test("keeps levels 1 to 5 at least 6 semitones apart", () => {
    const flat = fitSpeaker(takes(3, 50).map((t) => ({ ...t, s: 0.3 })));
    expect(12 * Math.log2(flat.range.hi / flat.range.lo)).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  test("draws a one-semitone wobble as less than one level", () => {
    const flat = fitSpeaker(takes(3, 50).map((t) => ({ ...t, s: 0.3 })));
    const levels = 4 / (12 * Math.log2(flat.range.hi / flat.range.lo));
    expect(levels).toBeLessThan(1);
  });
});

describe("a different speaker", () => {
  const man = takes(2, 6);

  test("is flagged when a take sits about an octave from the voice", () => {
    expect(changeProbability(man, { m: 14, s: 7 })).toBeGreaterThan(0.99);
    expect(isNewSpeaker(man, { m: 14, s: 7 })).toBe(true);
  });

  test("is not flagged for a take said a few semitones high", () => {
    expect(changeProbability(man, { m: 6, s: 7 })).toBeLessThan(0.5);
    expect(isNewSpeaker(man, { m: 6, s: 7 })).toBe(false);
  });

  test("is never flagged before the voice has a few takes", () => {
    expect(changeProbability(takes(2, 2), { m: 14, s: 7 })).toBe(0);
  });
});
