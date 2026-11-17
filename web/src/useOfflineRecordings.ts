import { useEffect, useRef, useState } from "react";
import type { Deck } from "./deck";
import type { SyncStatus } from "./offline";
import { AUDIO_CACHE, createDownloader, recordingUrls } from "./offline";
import type { Card } from "./progress";

/**
 * Starts saving the deck's recordings once it has loaded, and resumes when the network
 * comes back or the app returns to the foreground. Null where the browser has no Cache API.
 * Choosing another lesson restarts the download with that lesson's recordings first.
 */
export function useOfflineRecordings(
  deck: Deck | null,
  scope: string,
  cards: Record<string, Card>,
): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  // Read when a download starts; answering a word should not restart it.
  const latestCards = useRef(cards);
  latestCards.current = cards;

  useEffect(() => {
    if (!deck || !("caches" in window)) return;
    const downloader = createDownloader(
      recordingUrls(
        deck,
        new URL(import.meta.env.BASE_URL, location.href).href,
        scope,
        latestCards.current,
      ),
      () => caches.open(AUDIO_CACHE),
      (url, signal) => fetch(url, { signal }),
      setStatus,
    );
    const resume = () => {
      if (document.visibilityState === "visible") void downloader.run();
    };

    // Without this, Safari may evict the recordings after a few weeks without a visit.
    void navigator.storage?.persist?.();
    void downloader.run();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      downloader.stop();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [deck, scope]);

  return status;
}
