import { describe, expect, test } from "bun:test";
import { divide, level, pitchFrames, takeTrack } from "./voicePitch";

const RATE = 24000;

/** A tone whose pitch moves linearly from `from` to `to` Hz. */
function glide(from: number, to: number, seconds: number): Float32Array {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const hz = from + ((to - from) * i) / n;
    phase += (2 * Math.PI * hz) / RATE;
    out[i] = 0.5 * Math.sin(phase);
  }
  return out;
}

const silence = (seconds: number) => new Float32Array(Math.round(seconds * RATE));

function join(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("the pitch of a take", () => {
  // A rising syllable, a short pause, then a level one: like a second tone then a first.
  const take = join(
    silence(0.2),
    glide(150, 220, 0.3),
    silence(0.06),
    glide(220, 220, 0.3),
    silence(0.2),
  );
  const frames = pitchFrames(take, RATE);

  test("finds the pitch of voiced frames and none in silence", () => {
    const voiced = frames.hz.filter((h) => h !== null) as number[];
    expect(voiced.length).toBeGreaterThan(40);
    expect(Math.min(...voiced)).toBeGreaterThan(140);
    expect(Math.max(...voiced)).toBeLessThan(230);
    expect(frames.hz[5]).toBeNull();
  });

  test("divides the syllables at the pause, not at the recording's proportion", () => {
    const voicedAt = frames.hz.flatMap((h, i) => (h === null ? [] : [i]));
    const first = voicedAt[0]!;
    const last = voicedAt[voicedAt.length - 1]!;
    // The recording divides at 40% of its speech; the pause here is near 50%.
    const cut = divide(frames, first, last, 0.4);
    expect(cut * 0.01).toBeGreaterThan(0.48);
    expect(cut * 0.01).toBeLessThan(0.58);
  });

  test("draws the first syllable rising and the second level", () => {
    const range = { lo: 150, hi: 220 };
    const track = takeTrack(frames, 0.5, range)!;
    const firstVoiced = track[0]!.filter((l) => l !== null) as number[];
    const secondVoiced = track[1]!.filter((l) => l !== null) as number[];
    expect(firstVoiced[0]!).toBeLessThan(20);
    expect(firstVoiced[firstVoiced.length - 1]!).toBeGreaterThan(40);
    expect(Math.max(...secondVoiced) - Math.min(...secondVoiced)).toBeLessThanOrEqual(3);
  });

  test("hears no word in silence", () => {
    const quiet = pitchFrames(silence(1), RATE);
    expect(takeTrack(quiet, 0.5, { lo: 100, hi: 200 })).toBeNull();
  });
});

describe("the listener's range", () => {
  test("maps its ends to levels 1 and 5", () => {
    const range = { lo: 100, hi: 200 };
    expect(level(100, range)).toBeCloseTo(1);
    expect(level(200, range)).toBeCloseTo(5);
  });
});
