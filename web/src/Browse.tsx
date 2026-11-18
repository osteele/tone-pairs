import { useState } from "react";
import { FaArrowLeft } from "react-icons/fa6";
import { play } from "./audio";
import type { Deck, Family, Tone, Word } from "./deck";
import { ALL, recorded, recordingOf, wordFor } from "./deck";
import { markSyllable } from "./pinyin";
import { clipFor } from "./session";
import { ToneGraph } from "./ToneGraph";
import { TONE_COLORS } from "./tones";

const FIRST: Tone[] = [1, 2, 3, 4];
const SECOND: Tone[] = [1, 2, 3, 4, 5];

interface Props {
  deck: Deck;
  /** A lesson id, or ALL. */
  scope: string;
  onBack: () => void;
}

/** A lesson's syllable families, and for each, the recording of every tone pattern. */
export function Browse({ deck, scope, onBack }: Props) {
  const [family, setFamily] = useState<Family | null>(null);
  const title =
    scope === ALL ? "All lessons" : (deck.exercises.find((e) => e.id === scope)?.title ?? scope);
  const families = deck.families.filter((f) => scope === ALL || f.exercises.includes(scope));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <header className="flex items-center gap-2">
        <button
          type="button"
          aria-label={family ? `Back to ${title}` : "Back to lessons"}
          onClick={family ? () => setFamily(null) : onBack}
          className="rounded-full p-2 text-stone-500 active:bg-stone-200"
        >
          <FaArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">{family ? family.key : title}</h1>
      </header>
      {family ? (
        <FamilyGrid deck={deck} family={family} />
      ) : (
        <ul className="flex flex-col gap-2">
          {families.map((f) => {
            const real = deck.words.filter((w) => w.family === f.key && w.real).length;
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => setFamily(f)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left active:bg-stone-100"
                >
                  <span className="font-medium">{f.key.replaceAll("u:", "ü")}</span>
                  <span className="text-sm text-stone-500">
                    {real} {real === 1 ? "word" : "words"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function FamilyGrid({ deck, family }: { deck: Deck; family: Family }) {
  const [realOnly, setRealOnly] = useState(true);
  const [voice, setVoice] = useState(deck.voices[0]!.key);
  const [selected, setSelected] = useState<Word | null>(null);
  const words = deck.words.filter((w) => w.family === family.key);
  const all = words.length > 0 ? recorded(deck, words[0]!) : family.contrasts;
  const syllables = (words[0] ?? family.contrasts[0])?.syllables ?? family.key.split(" ");

  const hear = (word: Word, inVoice = voice) => {
    setSelected(word);
    const clip = clipFor(deck, word, inVoice);
    if (clip) void play(clip);
  };
  const recording = selected ? recordingOf(deck, selected, voice) : undefined;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={realOnly}
            onChange={(e) => setRealOnly(e.target.checked)}
            className="size-4"
          />
          Real words only
        </label>
        <span className="flex-1" />
        {deck.voices.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              setVoice(v.key);
              if (selected) hear(selected, v.key);
            }}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              v.key === voice ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1">
        {FIRST.flatMap((a) =>
          SECOND.map((b) => {
            const pattern: Tone[] = [a, b];
            const word = wordFor(all, pattern);
            const shown = word && (!realOnly || word.real) && recordingOf(deck, word, voice);
            const key = `${a}-${b}`;
            if (!word || !shown) {
              return (
                <div
                  key={key}
                  className="flex h-14 items-center justify-center rounded-lg bg-stone-100 text-[10px] text-stone-400"
                >
                  {a === 3 && b === 3 ? "said 2-3" : ""}
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => hear(word)}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-xs active:scale-95 ${
                  selected?.id === word.id ? "border-stone-800" : "border-stone-200"
                } ${word.real ? "bg-white" : "bg-stone-50 opacity-70"}`}
              >
                <span className="font-medium">
                  {syllables.map((s, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a word's syllables never reorder.
                    <span key={i} style={{ color: TONE_COLORS[pattern[i]!] }}>
                      {markSyllable(s, pattern[i]!)}
                    </span>
                  ))}
                </span>
                <span className="text-stone-500">{word.hanzi}</span>
              </button>
            );
          }),
        )}
      </div>

      {selected && (
        <div className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-3">
          <p>
            <span className="font-medium">{selected.pinyin}</span> <span>{selected.hanzi}</span>{" "}
            <span className="text-sm text-stone-500">
              {selected.madeFrom
                ? `re-pitched from ${selected.madeFrom}`
                : selected.real
                  ? selected.gloss
                  : "not a word"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => hear(selected)}
            aria-label={`Play ${selected.pinyin}`}
          >
            <ToneGraph
              line={{
                key: selected.id,
                pattern: selected.spoken,
                label: selected.pinyin,
                path: recording?.url,
                timing: recording?.timing,
                track: recording?.track,
              }}
            />
          </button>
        </div>
      )}
    </section>
  );
}
