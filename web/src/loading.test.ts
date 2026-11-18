import { describe, expect, test } from "bun:test";
import { whileLoading } from "./loading";

describe("loading state", () => {
  test("is cleared when the step fails, and the failure propagates", async () => {
    const states: boolean[] = [];
    const failing = whileLoading(
      (loading) => states.push(loading),
      async () => {
        throw new DOMException("cannot decode", "NotSupportedError");
      },
    );
    await expect(failing).rejects.toThrow("cannot decode");
    expect(states).toEqual([true, false]);
  });

  test("is cleared when the step succeeds, and its result is returned", async () => {
    const states: boolean[] = [];
    expect(
      await whileLoading(
        (loading) => states.push(loading),
        async () => "played",
      ),
    ).toBe("played");
    expect(states).toEqual([true, false]);
  });
});
