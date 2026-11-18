import { useEffect, useState } from "react";
import { play } from "./audio";
import { Drill } from "./Drill";
import type { Deck } from "./deck";
import { loadDeck } from "./deck";
import { Home } from "./Home";
import type { Progress, Scheduler } from "./progress";
import { createScheduler, loadProgress, migrateIds, saveProgress } from "./progress";
import type { Mode, Prompt } from "./session";
import { clipFor, nextPrompt } from "./session";
import { useOfflineRecordings } from "./useOfflineRecordings";

interface Session {
  /** Distinct per session, so starting one from the end of another remounts the drill. */
  key: number;
  mode: Mode;
  first: Prompt | null;
}

export function App() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordings = useOfflineRecordings(deck, progress.settings.scope, progress.cards);

  useEffect(() => {
    Promise.all([loadDeck(), createScheduler()]).then(
      ([d, s]) => {
        setProgress((p) =>
          migrateIds(
            p,
            d.words.map((w) => w.id),
          ),
        );
        setDeck(d);
        setScheduler(() => s);
      },
      (e: unknown) => setError(String(e)),
    );
  }, []);

  useEffect(() => saveProgress(progress), [progress]);

  if (error) return <p className="p-6 text-red-700">Could not load: {error}</p>;
  if (!deck || !scheduler) return <p className="p-6 text-stone-500">Loading…</p>;

  // Called from the Start button's click handler, so the first clip plays inside a user gesture.
  const start = (mode: Mode) => {
    const first = nextPrompt(deck, progress, mode, undefined, new Date());
    const clip = first && clipFor(deck, first.word, first.voice);
    if (clip) void play(clip);
    setSession((previous) => ({ key: (previous?.key ?? 0) + 1, mode, first }));
  };

  if (session) {
    return (
      <Drill
        key={session.key}
        deck={deck}
        scheduler={scheduler}
        progress={progress}
        setProgress={setProgress}
        mode={session.mode}
        first={session.first}
        onExit={() => setSession(null)}
        onExtra={() => start("extra")}
      />
    );
  }
  return (
    <Home
      deck={deck}
      progress={progress}
      setProgress={setProgress}
      onStart={start}
      recordings={recordings}
    />
  );
}
