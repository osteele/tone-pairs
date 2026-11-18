import { describe, expect, test } from "bun:test";
import { levelAt, patternLevels, placeAt, syllableWeights } from "./contour";
import type { Tone, Word } from "./deck";
import { acceptedAnswers, isCorrect, wordForAnswer } from "./grading";
import { markSyllable } from "./pinyin";
import { createScheduler, emptyProgress, migrateIds, parseProgress, record } from "./progress";
import { countScope, pickNext } from "./queue";
import { advancesAfterRight } from "./session";

function word(
  id: string,
  hanzi: string,
  tones: Tone[],
  spoken: Tone[] = tones,
  family = "f",
): Word {
  return {
    id,
    hanzi,
    pinyin: id,
    syllables: ["yi", "ci"],
    tones,
    spoken,
    gloss: "",
    real: true,
    family,
    exercises: ["hsk1-07"],
    audio: { v: `audio/${id}.mp3` },
  };
}

describe("grading", () => {
  // 一次 is written 1-4 and said 2-4; 依次 is written and said 1-4; 以此 is written 3-3, said 2-3.
  const yici = word("yi1ci4", "一次", [1, 4], [2, 4]);
  const yici2 = word("yi1ci4b", "依次", [1, 4]);
  const yici3 = word("yi3ci3", "以此", [3, 3], [2, 3]);
  const family = [yici, yici2, yici3];

  test("the spoken pattern is right", () => {
    expect(isCorrect([2, 4], yici, family)).toBe(true);
    expect(isCorrect([2, 3], yici3, family)).toBe(true);
  });

  test("the citation pattern is right when no other word is said that way", () => {
    expect(isCorrect([3, 3], yici3, family)).toBe(true);
  });

  test("the citation pattern is wrong when it names another word", () => {
    expect(acceptedAnswers(yici, family)).toEqual([[2, 4]]);
    expect(isCorrect([1, 4], yici, family)).toBe(false);
  });

  test("a wrong answer is matched to the family member it describes", () => {
    expect(wordForAnswer([1, 4], family)?.hanzi).toBe("依次");
    expect(wordForAnswer([3, 3], family)?.hanzi).toBe("以此");
    expect(wordForAnswer([4, 4], family)).toBeUndefined();
  });
});

describe("pinyin", () => {
  test("tone marks go on the right vowel", () => {
    expect(markSyllable("jian", 1)).toBe("jiān");
    expect(markSyllable("hou", 4)).toBe("hòu");
    expect(markSyllable("jiu", 3)).toBe("jiǔ");
    expect(markSyllable("lu:e", 4)).toBe("lüè");
    expect(markSyllable("men", 5)).toBe("men");
  });
});

describe("queue", () => {
  const a1 = word("a1", "甲", [1, 1], [1, 1], "a");
  const a2 = word("a2", "乙", [2, 1], [2, 1], "a");
  const b1 = word("b1", "丙", [1, 1], [1, 1], "b");
  const scope = [a1, a2, b1];
  const now = new Date("2026-11-17T12:00:00Z");
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
  const options = { now, newAllowed: 10, lookaheadMs: 20 * 60_000, random: () => 0 };

  test("due cards come before new ones, earliest first", () => {
    const cards = { b1: { dueAt: minutes(-1) }, a2: { dueAt: minutes(-5) } };
    expect(pickNext(scope, cards, options)).toEqual({ word: a2, kind: "due" });
  });

  test("new words come a family at a time", () => {
    const cards = { a1: { dueAt: minutes(60) } };
    expect(pickNext(scope, cards, options)?.word).toBe(a2);
  });

  test("no new words past the daily limit; cards due soon are shown early", () => {
    const cards = { a1: { dueAt: minutes(5) } };
    expect(pickNext(scope, cards, { ...options, newAllowed: 0 })).toEqual({
      word: a1,
      kind: "ahead",
    });
  });

  test("the word just shown is not repeated while another is available", () => {
    const cards = { a1: { dueAt: minutes(-5) }, a2: { dueAt: minutes(-1) } };
    expect(pickNext(scope, cards, { ...options, lastId: "a1" })?.word).toBe(a2);
  });

  test("the session ends when nothing is due soon and no new words are allowed", () => {
    const cards = { a1: { dueAt: minutes(60) } };
    expect(pickNext(scope, cards, { ...options, newAllowed: 0 })).toBeNull();
  });

  test("counts", () => {
    const cards = { a1: { dueAt: minutes(-1) }, a2: { dueAt: minutes(60) } };
    expect(countScope(scope, cards, now)).toEqual({ due: 1, unseen: 1, learned: 2 });
  });
});

describe("progress", async () => {
  const scheduler = await createScheduler();
  const now = new Date("2026-11-17T12:00:00Z");
  const entry = { word: "a1", voice: "v", answer: [1, 1], scheduled: true };

  test("a wrong answer brings the word back within minutes", () => {
    const p = record(emptyProgress(), scheduler, { ...entry, correct: false }, now);
    const wait = p.cards.a1!.dueAt.getTime() - now.getTime();
    expect(wait).toBeLessThanOrEqual(10 * 60_000);
    expect(Object.keys(p.introduced)).toEqual(["a1"]);
  });

  test("a right answer moves on by itself only in practice or for a learned word", () => {
    const learning = record(emptyProgress(), scheduler, { ...entry, correct: false }, now).cards.a1;
    const learned = record(emptyProgress(), scheduler, { ...entry, correct: true }, now).cards.a1;
    expect(advancesAfterRight("scheduled", undefined)).toBe(false);
    expect(advancesAfterRight("scheduled", learning)).toBe(false);
    expect(advancesAfterRight("scheduled", learned)).toBe(true);
    expect(advancesAfterRight("extra", undefined)).toBe(true);
  });

  test("a right answer schedules the word days ahead", () => {
    const p = record(emptyProgress(), scheduler, { ...entry, correct: true }, now);
    expect(p.cards.a1!.dueAt.getTime() - now.getTime()).toBeGreaterThan(24 * 3600_000);
  });

  test("extra practice is logged but does not schedule", () => {
    const p = record(
      emptyProgress(),
      scheduler,
      { ...entry, correct: true, scheduled: false },
      now,
    );
    expect(p.cards).toEqual({});
    expect(p.reviews).toHaveLength(1);
  });

  test("version-1 ids are renamed; an id two words shared is dropped", () => {
    const old = record(emptyProgress(), scheduler, { ...entry, correct: true }, now);
    const v1 = record(
      { ...old, version: 1, flagged: ["a1:v", "yi1ci4:v"] },
      scheduler,
      { ...entry, word: "yi1ci4", correct: false },
      now,
    );
    const ids = ["a1-111111", "yi1ci4-26d5a2", "yi1ci4-c7e39e"];
    const migrated = migrateIds(v1, ids);
    expect(Object.keys(migrated.cards)).toEqual(["a1-111111"]);
    expect(Object.keys(migrated.introduced)).toEqual(["a1-111111"]);
    expect(migrated.reviews.map((r) => r.word)).toEqual(["a1-111111"]);
    expect(migrated.flagged).toEqual(["a1-111111:v"]);
    expect(migrateIds(migrated, ids)).toBe(migrated);
    expect(migrateIds(emptyProgress(), ids).version).toBe(emptyProgress().version);
  });

  test("saved progress reloads into cards the scheduler accepts", () => {
    const p = record(emptyProgress(), scheduler, { ...entry, correct: false }, now);
    const reloaded = parseProgress(JSON.stringify(p));
    expect(reloaded.cards.a1!.dueAt).toBeInstanceOf(Date);
    const later = new Date(now.getTime() + 15 * 60_000);
    const again = record(reloaded, scheduler, { ...entry, correct: true }, later);
    expect(again.cards.a1!.reps).toBe(2);
  });
});

describe("contours", () => {
  test("textbook shapes, with a half-third before another syllable", () => {
    expect(patternLevels([2, 3])).toEqual([
      [3, 5],
      [2, 1, 4],
    ]);
    expect(patternLevels([3, 4])).toEqual([
      [2, 1, 1],
      [5, 1],
    ]);
  });

  test("a neutral tone takes its pitch from the tone before it", () => {
    expect(patternLevels([2, 5])[1]![0]).toBe(3);
    expect(patternLevels([4, 5])[1]![0]).toBe(1);
    expect(syllableWeights([2, 5])).toEqual([1, 0.5]);
  });

  test("levels are eased between control points and clamped at the ends", () => {
    expect(levelAt([3, 5], 0)).toBe(3);
    expect(levelAt([3, 5], 0.5)).toBeCloseTo(4);
    expect(levelAt([3, 5], 1.5)).toBe(5);
    expect(levelAt([2, 1, 4], 0.5)).toBe(1);
  });

  test("playback time maps onto syllables by the recording's timing", () => {
    const timing: [number, number, number] = [0.2, 0.5, 0.8];
    expect(placeAt(0.1, timing)).toEqual({ syllable: 0, fraction: 0 });
    expect(placeAt(0.35, timing).syllable).toBe(0);
    expect(placeAt(0.35, timing).fraction).toBeCloseTo(0.5);
    expect(placeAt(0.65, timing).fraction).toBeCloseTo(0.5);
    expect(placeAt(2, timing)).toEqual({ syllable: 1, fraction: 1 });
  });
});
