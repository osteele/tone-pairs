import { useState } from "react";
import { FaGear } from "react-icons/fa6";
import type { Deck } from "./deck";
import { ALL, wordsInScope } from "./deck";
import type { Progress, Settings } from "./progress";
import { localDate } from "./progress";
import { countScope } from "./queue";
import type { Mode } from "./session";
import { newAllowed } from "./session";

interface Props {
  deck: Deck;
  progress: Progress;
  setProgress: (update: (p: Progress) => Progress) => void;
  onStart: (mode: Mode) => void;
}

export function Home({ deck, progress, setProgress, onStart }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const now = new Date();
  const allowed = newAllowed(progress, now);
  const scopes = [{ id: ALL, title: "All lessons" }, ...deck.exercises];
  const current = countScope(wordsInScope(deck, progress.settings.scope), progress.cards, now);
  const available = current.due + Math.min(current.unseen, allowed);

  const today = localDate(now);
  const todays = progress.reviews.filter((r) => localDate(new Date(r.at)) === today);
  const right = todays.filter((r) => r.correct).length;

  const update = (patch: Partial<Settings>) =>
    setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tone Pairs</h1>
        <button
          type="button"
          aria-label="Settings"
          className="rounded-full p-2 text-stone-500 active:bg-stone-200"
          onClick={() => setShowSettings((s) => !s)}
        >
          <FaGear size={20} />
        </button>
      </header>

      <section className="flex flex-col gap-2">
        {scopes.map((scope) => {
          const counts = countScope(wordsInScope(deck, scope.id), progress.cards, now);
          const selected = progress.settings.scope === scope.id;
          return (
            <button
              key={scope.id}
              type="button"
              onClick={() => update({ scope: scope.id })}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${
                selected ? "border-teal-600 bg-teal-50" : "border-stone-200 bg-white"
              }`}
            >
              <span className="font-medium">{scope.title}</span>
              <span className="text-sm text-stone-500">
                {counts.due} due · {counts.unseen} new · {counts.learned} seen
              </span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          disabled={available === 0}
          onClick={() => onStart("scheduled")}
          className="rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white active:bg-teal-700 disabled:bg-stone-300"
        >
          {available === 0
            ? "Nothing due"
            : `Review ${current.due} · learn ${Math.min(current.unseen, allowed)}`}
        </button>
        <button
          type="button"
          onClick={() => onStart("extra")}
          className="rounded-xl border border-stone-300 bg-white py-3 font-medium active:bg-stone-100"
        >
          Extra practice (not scheduled)
        </button>
        <p className="text-center text-sm text-stone-500">
          Today: {todays.length} answers
          {todays.length > 0 && `, ${Math.round((100 * right) / todays.length)}% right`}
        </p>
      </section>

      {showSettings && (
        <section className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4">
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
          <label className="flex items-center justify-between">
            <span>Next word automatically after a right answer</span>
            <input
              type="checkbox"
              checked={progress.settings.autoAdvance}
              onChange={(e) => update({ autoAdvance: e.target.checked })}
              className="size-5"
            />
          </label>
          <Flagged progress={progress} setProgress={setProgress} />
        </section>
      )}
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
