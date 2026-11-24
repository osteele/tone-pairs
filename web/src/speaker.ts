/**
 * The listener's voice, learned from their takes: where their pitch typically sits and how far
 * it spreads, and from these the pitches drawn at levels 1 and 5 of the staff.
 *
 * A learner's takes cannot be scaled by their tones, as the recordings are: a learner's first
 * tones may be too low, and a scale that put them at 5 would hide exactly that. So the scale is
 * set from the voice alone, by the rule that holds for the four recorded voices, whose levels sit
 * at about the same distance from their typical pitch when measured in units of their spread.
 *
 * The typical pitch is estimated by Bayesian updating. Before any take it is drawn from a prior
 * over speakers, a mixture of low and high voices; each take's median pitch is a noisy
 * observation of it, noisy because a word of first tones is said higher than one of third tones.
 * Its uncertainty says how far calibration has come. A take far from the current estimate, and
 * likely under the prior, is probably someone else speaking (changeProbability).
 *
 * Pitches are in semitones above 100 Hz.
 */

import type { Frames, Range } from "./voicePitch";

/** One take, as kept on the device: its median pitch and its spread (10th to 90th percentile). */
export interface TakeSummary {
  m: number;
  s: number;
}

/** Prior over a speaker's typical pitch: low and high voices, equally likely. */
const PRIOR = [
  { weight: 0.5, mean: 3.2, sd: 2.5 }, // about 120 Hz
  { weight: 0.5, mean: 13.3, sd: 2.5 }, // about 215 Hz
];
/** How far one take's median strays from the speaker's typical pitch, word to word. */
const TAKE_SD = 2.3;
/** Levels 1 and 5, in spreads below and above the typical pitch (the four recorded voices). */
const LEVEL_1_SPREADS = 0.78;
const LEVEL_5_SPREADS = 0.47;
/** The typical spread of a take, and how many takes' worth of weight that guess carries. */
const PRIOR_SPREAD = 7.3;
const PRIOR_SPREAD_TAKES = 3;
/**
 * The least spread a voice is taken to have: levels 1 to 5 then span at least 6 semitones (the
 * narrowest recorded voice spans 7.4), so a listener who says words on nearly one pitch sees a
 * nearly level line, not a small wobble stretched across the staff.
 */
const MIN_SPREAD = 6 / (LEVEL_1_SPREADS + LEVEL_5_SPREADS);
/** Calibrated once the typical pitch is known to within this, in semitones. */
export const SETTLED_SD = 0.8;
/** Chance, before hearing it, that a take is by a different speaker. */
const HAZARD = 0.02;
/** A take is flagged as another speaker's above this probability, once the voice has this many. */
const CHANGE_PROBABILITY = 0.9;
const CHANGE_MIN_TAKES = 3;

export interface Speaker {
  /** Typical pitch, and its uncertainty. */
  center: number;
  sd: number;
  spread: number;
  takes: number;
  /** From 0, before any take, to 1, calibrated. */
  progress: number;
  /** About how many takes calibration needs in all. */
  needed: number;
  calibrated: boolean;
  /** The pitches drawn at levels 1 and 5. */
  range: Range;
}

const semitones = (hz: number) => 12 * Math.log2(hz / 100);
export const hertz = (st: number) => 100 * 2 ** (st / 12);

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.round(q * (sorted.length - 1))]!;
}

/** A take's median and spread, or null when it has too little voice to say anything. */
export function summarize(frames: Frames, minVoiced = 8): TakeSummary | null {
  const voiced = frames.hz
    .filter((h): h is number => h !== null)
    .map(semitones)
    .sort((a, b) => a - b);
  if (voiced.length < minVoiced) return null;
  return { m: quantile(voiced, 0.5), s: quantile(voiced, 0.9) - quantile(voiced, 0.1) };
}

const normal = (x: number, mean: number, variance: number) =>
  Math.exp(-((x - mean) ** 2) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);

/** The posterior over the typical pitch after `medians`: a mixture of normals. */
function posterior(medians: readonly number[]) {
  const n = medians.length;
  const sum = medians.reduce((a, b) => a + b, 0);
  const parts = PRIOR.map(({ weight, mean, sd }) => {
    const precision = 1 / sd ** 2 + n / TAKE_SD ** 2;
    const variance = 1 / precision;
    const postMean = variance * (mean / sd ** 2 + sum / TAKE_SD ** 2);
    // The evidence for this component: the takes' joint density under it, up to a factor
    // shared by every component (the takes' scatter about their own mean).
    const evidence = n ? normal(sum / n, mean, sd ** 2 + TAKE_SD ** 2 / n) : 1;
    return { weight: weight * evidence, mean: postMean, variance };
  });
  const total = parts.reduce((a, p) => a + p.weight, 0) || 1;
  return parts.map((p) => ({ ...p, weight: p.weight / total }));
}

/** The predictive density of a new take's median, given earlier takes. */
function predictive(medians: readonly number[], m: number): number {
  return posterior(medians).reduce(
    (a, p) => a + p.weight * normal(m, p.mean, p.variance + TAKE_SD ** 2),
    0,
  );
}

/** What the takes so far say about the speaker. */
export function fitSpeaker(takes: readonly TakeSummary[]): Speaker {
  const parts = posterior(takes.map((t) => t.m));
  const center = parts.reduce((a, p) => a + p.weight * p.mean, 0);
  const variance = parts.reduce((a, p) => a + p.weight * (p.variance + (p.mean - center) ** 2), 0);
  const sd = Math.sqrt(variance);
  const spread = Math.max(
    MIN_SPREAD,
    (PRIOR_SPREAD * PRIOR_SPREAD_TAKES + takes.reduce((a, t) => a + t.s, 0)) /
      (PRIOR_SPREAD_TAKES + takes.length),
  );
  const priorPrecision = 1 / PRIOR[0]!.sd ** 2;
  const target = 1 / SETTLED_SD ** 2 - priorPrecision;
  const progress = Math.min(1, Math.max(0, (1 / variance - priorPrecision) / target));
  return {
    center,
    sd,
    spread,
    takes: takes.length,
    progress,
    needed: Math.ceil(target * TAKE_SD ** 2),
    calibrated: sd <= SETTLED_SD,
    range: {
      lo: hertz(center - LEVEL_1_SPREADS * spread),
      hi: hertz(center + LEVEL_5_SPREADS * spread),
    },
  };
}

/**
 * The probability that `take` is by a different speaker than `takes`: the one-step form of
 * Bayesian online change-point detection (Adams & MacKay 2007). A new speaker is drawn from the
 * prior, so a take far from the current voice but typical of some voice counts for a change.
 * Zero until the current voice has CHANGE_MIN_TAKES takes.
 */
export function changeProbability(takes: readonly TakeSummary[], take: TakeSummary): number {
  if (takes.length < CHANGE_MIN_TAKES) return 0;
  const same =
    (1 - HAZARD) *
    predictive(
      takes.map((t) => t.m),
      take.m,
    );
  const other = HAZARD * predictive([], take.m);
  return other / (same + other);
}

/** Whether a take should be offered as another speaker's. */
export function isNewSpeaker(takes: readonly TakeSummary[], take: TakeSummary): boolean {
  return changeProbability(takes, take) > CHANGE_PROBABILITY;
}
