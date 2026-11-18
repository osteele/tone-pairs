import { describe, expect, test } from "bun:test";
import type { Deck, Word } from "./deck";
import type { RecordingCache, SyncStatus } from "./offline";
import { createDownloader, recordingUrls, sync } from "./offline";
import type { Card } from "./progress";

class MemoryCache implements RecordingCache {
  entries = new Map<string, Response>();
  /** Throw QuotaExceededError once this many entries are stored. */
  limit = Number.POSITIVE_INFINITY;

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async put(url: string, response: Response) {
    if (this.entries.size >= this.limit) throw new DOMException("full", "QuotaExceededError");
    this.entries.set(url, response);
  }
  async delete(url: string) {
    return this.entries.delete(url);
  }
}

const urls = Array.from({ length: 10 }, (_, i) => `https://example.test/audio/${i}.mp3?v=a`);
const ok = async () => new Response("mp3");
const never = new AbortController().signal;

describe("offline recordings", () => {
  test("saves the missing recordings, deletes stale ones, and reports progress", async () => {
    const cache = new MemoryCache();
    cache.entries.set(urls[0]!, new Response("mp3"));
    cache.entries.set("https://example.test/audio/0.mp3?v=old", new Response("old"));
    const fetched: string[] = [];
    const reports: SyncStatus[] = [];
    const state = await sync(
      urls,
      cache,
      async (url) => {
        fetched.push(url);
        return ok();
      },
      (s) => reports.push(s),
      never,
    );
    expect(state).toBe("saved");
    expect(fetched).toHaveLength(9);
    expect(fetched).not.toContain(urls[0]);
    expect([...cache.entries.keys()].sort()).toEqual([...urls].sort());
    expect(reports[0]).toEqual({ state: "saving", saved: 1, total: 10 });
    expect(reports.at(-1)).toEqual({ state: "saved", saved: 10, total: 10 });
  });

  test("stops when the network fails and resumes from what was saved", async () => {
    const cache = new MemoryCache();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls > 3) throw new TypeError("Load failed");
      return ok();
    };
    const first = await sync(urls, cache, flaky, () => {}, never);
    expect(first).toBe("offline");
    const savedFirst = cache.entries.size;
    expect(savedFirst).toBe(3);

    const fetched: string[] = [];
    const second = await sync(
      urls,
      cache,
      async (url) => {
        fetched.push(url);
        return ok();
      },
      () => {},
      never,
    );
    expect(second).toBe("saved");
    expect(fetched).toHaveLength(10 - savedFirst);
  });

  test("stops when storage is full", async () => {
    const cache = new MemoryCache();
    cache.limit = 4;
    const reports: SyncStatus[] = [];
    expect(await sync(urls, cache, ok, (s) => reports.push(s), never)).toBe("full");
    expect(reports.at(-1)).toEqual({ state: "full", saved: 4, total: 10 });
  });

  test("a server error pauses the download instead of ending it", async () => {
    const cache = new MemoryCache();
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return calls === 2 ? new Response("", { status: 500 }) : ok();
    };
    const reports: SyncStatus[] = [];
    expect(await sync(urls, cache, failing, (s) => reports.push(s), never)).toBe("interrupted");
    expect(reports.at(-1)?.state).toBe("interrupted");
    expect(await sync(urls, cache, ok, () => {}, never)).toBe("saved");
    expect(cache.entries.size).toBe(10);
  });

  test("aborting stops without a final report", async () => {
    const cache = new MemoryCache();
    const abort = new AbortController();
    const reports: SyncStatus[] = [];
    const state = await sync(
      urls,
      cache,
      async () => {
        abort.abort();
        return ok();
      },
      (s) => reports.push(s),
      abort.signal,
    );
    expect(state).toBe("cancelled");
    expect(cache.entries.size).toBeLessThan(10);
    expect(reports.every((r) => r.state === "saving")).toBe(true);
  });

  test("the downloader retries after an attempt that failed", async () => {
    const cache = new MemoryCache();
    let opens = 0;
    const openCache = async () => {
      opens += 1;
      if (opens === 1) throw new DOMException("denied", "SecurityError");
      return cache;
    };
    const reports: SyncStatus[] = [];
    const downloader = createDownloader(urls, openCache, ok, (s) => reports.push(s));
    await expect(downloader.run()).rejects.toThrow("denied");
    await downloader.run();
    expect(reports.at(-1)).toEqual({ state: "saved", saved: 10, total: 10 });
  });

  test("the downloader resumes after a server error, and stops once everything is saved", async () => {
    const cache = new MemoryCache();
    let failing = true;
    let fetches = 0;
    const fetcher = async () => {
      fetches += 1;
      return failing ? new Response("", { status: 503 }) : ok();
    };
    const downloader = createDownloader(
      urls,
      async () => cache,
      fetcher,
      () => {},
    );
    await downloader.run();
    expect(cache.entries.size).toBe(0);
    failing = false;
    await downloader.run();
    expect(cache.entries.size).toBe(10);
    const before = fetches;
    await downloader.run();
    expect(fetches).toBe(before);
  });
});

describe("download order", () => {
  const word = (id: string, family: string, exercise: string): Word => ({
    id,
    hanzi: id,
    pinyin: id,
    syllables: ["a", "b"],
    tones: [1, 1],
    spoken: [1, 1],
    gloss: "",
    real: true,
    family,
    exercises: [exercise],
  });
  const lesson1 = word("one", "f1", "lesson1");
  const due = word("due", "f2", "lesson2");
  const fresh = word("fresh", "f3", "lesson2");
  const contrast = word("contrast", "f2", "lesson2");
  const deck: Deck = {
    exercises: [],
    voices: [{ key: "v", label: "V" }],
    families: [
      { key: "f1", printed: [], exercises: ["lesson1"], words: ["one"], contrasts: [] },
      { key: "f2", printed: [], exercises: ["lesson2"], words: ["due"], contrasts: [contrast] },
      { key: "f3", printed: [], exercises: ["lesson2"], words: ["fresh"], contrasts: [] },
    ],
    words: [lesson1, due, fresh],
    recordings: Object.fromEntries(
      ["one", "due", "fresh", "contrast", "orphan"].map((id) => [
        `audio/${id}-v.m4a`,
        { v: "a", t: [0, 0.5, 1], p: [] },
      ]),
    ),
  };
  const names = (urls: string[]) => urls.map((u) => u.replace(/^.*\/(\w+)-v\.m4a\?v=a$/, "$1"));

  test("the selected lesson comes first, words under review before new ones", () => {
    const cards = { due: { dueAt: new Date("2026-11-20") } as Card };
    expect(names(recordingUrls(deck, "https://x.test/", "lesson2", cards))).toEqual([
      "due",
      "contrast",
      "fresh",
      "one",
      "orphan",
    ]);
  });

  test("with no lesson under review, families keep the deck's order", () => {
    expect(names(recordingUrls(deck, "https://x.test/", "all", {}))).toEqual([
      "one",
      "due",
      "contrast",
      "fresh",
      "orphan",
    ]);
  });
});
