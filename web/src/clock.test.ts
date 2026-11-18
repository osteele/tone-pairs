import { describe, expect, test } from "bun:test";
import { anchor } from "./clock";

describe("playhead clock", () => {
  test("does not start until the player's position moves", () => {
    // play() resolved at 1000 ms, but no sound until the position advances at 1400 ms.
    expect(anchor(null, 1000, 0)).toBeNull();
    expect(anchor(null, 1390, 0)).toBeNull();
    expect(anchor(null, 1400, 0.01)).toBe(1390);
  });

  test("keeps running smoothly while the position is stale", () => {
    // Safari reports the same position for a few hundred milliseconds; the clock keeps its start.
    expect(anchor(1390, 1500, 0.01)).toBe(1390);
    expect(anchor(1390, 1700, 0.25)).toBe(1390);
  });

  test("moves back to the position when it falls behind it", () => {
    // The position says 0.5 s have played by 1800 ms, so the clip started by 1300 ms.
    expect(anchor(1390, 1800, 0.5)).toBe(1300);
  });
});
