/**
 * Saves every recording for offline use, in the background, after the app has loaded.
 *
 * The service worker precaches only the app and the word list, so a new build takes effect
 * as soon as that small core has downloaded. Recordings go into their own cache, which the
 * service worker serves from first (vite.config.ts); a recording not saved yet streams from
 * the network. Each recording's URL carries a content hash, so a re-recorded clip has a new
 * URL and the old entry is deleted as stale.
 */

import type { Deck, Word } from "./deck";
import { recordingOf, wordsInScope } from "./deck";
import type { Card } from "./progress";

/** Must match the runtime cache name in vite.config.ts. */
export const AUDIO_CACHE = "audio";

const CONCURRENCY = 4;

/**
 * "offline": the network is unreachable. "interrupted": the server answered with an error.
 * Both resume on the next attempt; "full" (storage quota) and "saved" are final.
 */
export type SyncState = "saving" | "saved" | "offline" | "interrupted" | "full";

export interface SyncStatus {
  state: SyncState;
  saved: number;
  total: number;
}

/** The parts of the Cache interface used here, so tests can supply an in-memory cache. */
export interface RecordingCache {
  keys(): Promise<readonly Request[]>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

/**
 * Absolute URLs of every recording in the deck, in the order they are likely to be needed:
 * first the families of the selected lesson that are already under review, soonest due first;
 * then the lesson's other families, in the order new words are introduced; then the rest.
 * Within a family, its drill words come before the recordings kept for comparisons.
 */
export function recordingUrls(
  deck: Deck,
  base: string,
  scope: string,
  cards: Record<string, Card>,
): string[] {
  const inScope = new Set(wordsInScope(deck, scope).map((w) => w.family));
  const members = new Map<string, Word[]>();
  for (const w of deck.words) members.set(w.family, [...(members.get(w.family) ?? []), w]);
  const nextDue = (key: string) =>
    Math.min(...(members.get(key) ?? []).map((w) => cards[w.id]?.dueAt.getTime() ?? Infinity));
  const rank = (key: string) => (inScope.has(key) ? (nextDue(key) < Infinity ? 0 : 1) : 2);
  const families = deck.families
    .map((family, index) => ({ family, index, rank: rank(family.key), due: nextDue(family.key) }))
    .sort((a, b) => a.rank - b.rank || (a.rank === 0 ? a.due - b.due : 0) || a.index - b.index)
    .map((f) => f.family);

  const ordered: string[] = [];
  for (const family of families) {
    for (const word of [...(members.get(family.key) ?? []), ...family.contrasts]) {
      for (const voice of deck.voices) {
        const recording = recordingOf(deck, word, voice.key);
        if (recording) ordered.push(recording.url);
      }
    }
  }
  // Every recording is listed, even one no family claims.
  const listed = new Set(ordered);
  const rest = Object.entries(deck.recordings)
    .map(([path, measured]) => `${path}?v=${measured.v}`)
    .filter((url) => !listed.has(url));
  return [...new Set([...ordered, ...rest])].map((url) => new URL(url, base).href);
}

export function plan(wanted: string[], cached: string[]): { missing: string[]; stale: string[] } {
  const want = new Set(wanted);
  const have = new Set(cached);
  return {
    missing: wanted.filter((url) => !have.has(url)),
    stale: cached.filter((url) => !want.has(url)),
  };
}

/**
 * Download whatever is missing, reporting progress after each recording. Stops early, with
 * state "offline", "interrupted", or "full", when the network fails, the server answers with
 * an error, or storage runs out; calling it again
 * resumes from what was saved. Aborting the signal stops it without a final report.
 */
export async function sync(
  wanted: string[],
  cache: RecordingCache,
  fetcher: (url: string, signal: AbortSignal) => Promise<Response>,
  report: (status: SyncStatus) => void,
  signal: AbortSignal,
): Promise<SyncState | "cancelled"> {
  const { missing, stale } = plan(
    wanted,
    (await cache.keys()).map((r) => r.url),
  );
  await Promise.all(stale.map((url) => cache.delete(url)));
  let saved = wanted.length - missing.length;
  report({ state: missing.length ? "saving" : "saved", saved, total: wanted.length });

  let stopped: SyncState | null = null;
  const queue = [...missing];
  const worker = async () => {
    while (!stopped && !signal.aborted) {
      const url = queue.shift();
      if (url === undefined) return;
      let response: Response;
      try {
        response = await fetcher(url, signal);
      } catch (error) {
        if (signal.aborted) return;
        // fetch rejects with a TypeError when the network is unreachable.
        if (!(error instanceof TypeError)) throw error;
        stopped = "offline";
        return;
      }
      if (!response.ok) {
        console.error(`${url}: HTTP ${response.status}`);
        stopped = "interrupted";
        return;
      }
      try {
        await cache.put(url, response);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
        stopped = "full";
        return;
      }
      saved += 1;
      report({ state: "saving", saved, total: wanted.length });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (signal.aborted) return "cancelled";

  const state = stopped ?? "saved";
  report({ state, saved, total: wanted.length });
  return state;
}

export interface Downloader {
  /** Start or resume saving; does nothing while a run is in progress or after a final state. */
  run(): Promise<void>;
  stop(): void;
}

/**
 * Runs sync at most once at a time. A run that ends in an error still allows the next one,
 * so a fault in one attempt does not stop the download for the rest of the session.
 */
export function createDownloader(
  wanted: string[],
  openCache: () => Promise<RecordingCache>,
  fetcher: (url: string, signal: AbortSignal) => Promise<Response>,
  report: (status: SyncStatus) => void,
): Downloader {
  const abort = new AbortController();
  let running = false;
  let done = false;
  return {
    async run() {
      if (running || done || abort.signal.aborted) return;
      running = true;
      try {
        const state = await sync(wanted, await openCache(), fetcher, report, abort.signal);
        done = state === "saved" || state === "full";
      } finally {
        running = false;
      }
    },
    stop() {
      abort.abort();
    },
  };
}

export function describeRecordings({ state, saved, total }: SyncStatus): string {
  const count = `${saved.toLocaleString()} of ${total.toLocaleString()}`;
  switch (state) {
    case "saving":
      return `Saving recordings for offline use: ${count}`;
    case "offline":
      return `Recordings saved for offline use: ${count}. The rest download when you're online.`;
    case "interrupted":
      return `Recordings saved for offline use: ${count}. The server failed; the rest download next time the app opens.`;
    case "full":
      return `Storage is full: ${count} recordings saved for offline use.`;
    case "saved":
      return `All ${total.toLocaleString()} recordings are saved for offline use.`;
  }
}
