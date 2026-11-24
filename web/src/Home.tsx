import { useEffect, useState } from "react";
import { FaCircleInfo, FaGear } from "react-icons/fa6";
import { About } from "./About";
import type { Deck } from "./deck";
import { ALL, drillWords, wordsInScope } from "./deck";
import { HelpButton } from "./Help";
import { Modal } from "./Modal";
import type { SyncStatus } from "./offline";
import { describeRecordings } from "./offline";
import type { HomeMode, Progress, Settings } from "./progress";
import { emptyProgress, localDate } from "./progress";
import { countScope } from "./queue";
import type { Mode } from "./session";
import { newAllowed } from "./session";
import { fitSpeaker } from "./speaker";
import { loadSpeaker, onSpeakerChange, startFresh, switchBack } from "./voice";

const MODES: { id: HomeMode; label: string; hint: string }[] = [
  { id: "learn", label: "Learn", hint: "Tap a lesson to review what's due and learn new words." },
  {
    id: "practice",
    label: "Practice",
    hint: "Tap a lesson to drill its words without changing the schedule. The tone patterns you miss most come up more often.",
  },
  {
    id: "browse",
    label: "Browse",
    hint: "Tap a lesson to hear every tone pattern of its syllables.",
  },
];

interface Props {
  deck: Deck;
  progress: Progress;
  setProgress: (update: (p: Progress) => Progress) => void;
  onStart: (mode: Mode, scope: string) => void;
  onBrowse: (scope: string) => void;
  /** Progress saving recordings for offline use; null where that is unsupported. */
  recordings: SyncStatus | null;
}

export function Home({ deck, progress, setProgress, onStart, onBrowse, recordings }: Props) {
  const [panel, setPanel] = useState<"settings" | "about" | null>(null);
  const now = new Date();
  const allowed = newAllowed(progress, now);
  const scopes = [{ id: ALL, title: "All lessons" }, ...deck.exercises];
  const mode = progress.settings.homeMode;

  const today = localDate(now);
  const todays = progress.reviews.filter((r) => localDate(new Date(r.at)) === today);
  const right = todays.filter((r) => r.correct).length;

  const update = (patch: Partial<Settings>) =>
    setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tone Pairs</h1>
        <div className="flex">
          <HelpButton topic="start" />
          <button
            type="button"
            aria-label="About"
            className="rounded-full p-2 text-stone-500 active:bg-stone-200"
            onClick={() => setPanel("about")}
          >
            <FaCircleInfo size={20} />
          </button>
          <button
            type="button"
            aria-label="Settings"
            className="rounded-full p-2 text-stone-500 active:bg-stone-200"
            onClick={() => setPanel("settings")}
          >
            <FaGear size={20} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-3 rounded-xl bg-stone-200 p-1" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => update({ homeMode: m.id })}
              className={`rounded-lg py-2 text-sm font-medium ${
                mode === m.id ? "bg-white shadow-sm" : "text-stone-600"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-sm text-stone-500">{MODES.find((m) => m.id === mode)?.hint}</p>
      </section>

      <section className="flex flex-col gap-2">
        {scopes.map((scope) => {
          const words = drillWords(deck, scope.id, progress.settings.realOnly);
          // A lesson whose pronunciation exercises have no two-syllable items is listed
          // anyway, so its absence from the drill does not look like a fault.
          if (wordsInScope(deck, scope.id).length === 0) {
            return (
              <div
                key={scope.id}
                className="flex items-center justify-between rounded-xl border border-dashed border-stone-200 px-4 py-3 text-stone-400"
              >
                <span className="font-medium">{scope.title}</span>
                <span className="text-sm">no tone pairs to drill</span>
              </div>
            );
          }
          const counts = countScope(words, progress.cards, now);
          const learnable = counts.due + Math.min(counts.unseen, allowed);
          const families = new Set(words.map((w) => w.family)).size;
          const idle = mode === "learn" && learnable === 0;
          const last = progress.settings.scope === scope.id;
          return (
            <button
              key={scope.id}
              type="button"
              disabled={idle}
              onClick={() =>
                mode === "browse"
                  ? onBrowse(scope.id)
                  : onStart(mode === "learn" ? "scheduled" : "extra", scope.id)
              }
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left active:bg-stone-100 disabled:opacity-50 ${
                last ? "border-teal-600 bg-teal-50" : "border-stone-200 bg-white"
              }`}
            >
              <span className="font-medium">{scope.title}</span>
              <span className="text-sm text-stone-500">
                {mode === "learn"
                  ? idle
                    ? "nothing due"
                    : `${counts.due} due · ${Math.min(counts.unseen, allowed)} new`
                  : mode === "practice"
                    ? `${counts.learned} seen · ${words.length} words`
                    : `${families} ${families === 1 ? "family" : "families"}`}
              </span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-center text-sm text-stone-500">
          Today: {todays.length} answers
          {todays.length > 0 && `, ${Math.round((100 * right) / todays.length)}% right`}
        </p>
        {recordings && recordings.state !== "saved" && (
          <p className="text-center text-sm text-stone-500">{describeRecordings(recordings)}</p>
        )}
      </section>

      <Modal title="About" open={panel === "about"} onClose={() => setPanel(null)}>
        <About />
      </Modal>

      <Modal title="Settings" open={panel === "settings"} onClose={() => setPanel(null)}>
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between">
            <span>New words per day</span>
            <input
              type="number"
              min={0}
              max={200}
              step={5}
              value={progress.settings.newPerDay}
              onChange={(e) => update({ newPerDay: Math.max(0, Number(e.target.value)) })}
              className="w-20 rounded border border-stone-300 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>Only real words (leave out the made-up words that fill out each family)</span>
            <input
              type="checkbox"
              checked={progress.settings.realOnly}
              onChange={(e) => update({ realOnly: e.target.checked })}
              className="size-5 shrink-0"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Next word automatically after a right answer</span>
            <input
              type="checkbox"
              checked={progress.settings.autoAdvance}
              onChange={(e) => update({ autoAdvance: e.target.checked })}
              className="size-5"
            />
          </label>
          <YourVoice />
          <Flagged progress={progress} setProgress={setProgress} />
          <Reset setProgress={setProgress} />
          {import.meta.env.DEV && (
            <a href="#teacher" className="text-sm text-stone-500 underline">
              Teacher comparison (development)
            </a>
          )}
        </div>
      </Modal>
    </main>
  );
}

function Flagged({ progress, setProgress }: Pick<Props, "progress" | "setProgress">) {
  const [copied, setCopied] = useState(false);
  if (progress.flagged.length === 0) {
    return <p className="text-sm text-stone-500">No recordings flagged.</p>;
  }
  const text = progress.flagged.join("\n");
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {progress.flagged.length} flagged recording{progress.flagged.length === 1 ? "" : "s"} (not
        played again):
      </p>
      <pre className="max-h-32 overflow-auto rounded bg-stone-100 p-2">{text}</pre>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-stone-300 px-3 py-1"
          onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy list"}
        </button>
        <button
          type="button"
          className="rounded border border-stone-300 px-3 py-1"
          onClick={() => setProgress((p) => ({ ...p, flagged: [] }))}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/**
 * Erase review history, scheduling, and flagged recordings, keeping the settings. A second
 * tap within a few seconds confirms, so one stray tap does nothing.
 */
function Reset({ setProgress }: Pick<Props, "setProgress">) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={`self-start rounded border px-3 py-1 text-sm ${
        armed ? "border-rose-600 bg-rose-600 text-white" : "border-stone-300 text-rose-700"
      }`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        setProgress((p) => ({ ...emptyProgress(), settings: p.settings }));
      }}
    >
      {armed ? "Tap again to erase all progress" : "Reset progress"}
    </button>
  );
}

/** What Say it has learned of the listener's voice, with a way to start over for someone else. */
function YourVoice() {
  const [store, setStore] = useState(loadSpeaker);
  useEffect(() => onSpeakerChange(() => setStore(loadSpeaker())), []);
  const speaker = fitSpeaker(store.takes);
  const low = Math.round(speaker.range.lo);
  const high = Math.round(speaker.range.hi);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        <span className="font-medium">Your voice (Say it): </span>
        {speaker.takes === 0
          ? "not heard yet."
          : `${speaker.calibrated ? "learned" : "still learning"} from ${speaker.takes} ${
              speaker.takes === 1 ? "take" : "takes"
            }; your staff runs from ${low} to ${high} Hz.`}
        {store.previous !== null && " The voice before it is kept, in case you switch back."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={speaker.takes === 0}
          onClick={() => startFresh()}
          className="rounded border border-stone-300 px-3 py-1 disabled:opacity-40"
        >
          Start fresh for a new voice
        </button>
        {store.previous !== null && (
          <button
            type="button"
            onClick={() => switchBack()}
            className="rounded border border-stone-300 px-3 py-1"
          >
            Switch back
          </button>
        )}
      </div>
    </div>
  );
}
