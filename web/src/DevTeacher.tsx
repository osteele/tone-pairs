/**
 * A development page (`just dev`, then Settings → Teacher comparison): the workbook readers'
 * pitch for each drilled word, from `just teacher`, over the synthesized voices' pitch. The
 * workbook audio and its measurements stay in .cache/teacher, which only the dev server serves;
 * a production build has neither this page nor its data.
 */

import { useEffect, useState } from "react";
import { FaArrowLeft, FaPlay } from "react-icons/fa6";
import { play } from "./audio";
import type { Deck, PitchTrack, Word } from "./deck";
import { recordingOf } from "./deck";
import { clipFor } from "./session";

interface Take {
  clip: string;
  t: [number, number, number];
  p: PitchTrack;
}

interface Item {
  lesson: string;
  item: number;
  options: string[];
  heard: string;
  word: string | null;
  takes: Take[];
}

const DATA = "/dev/teacher/";
const VOICE_COLORS = ["#e11d48", "#2563eb", "#f59e0b", "#059669"];

/** Mean difference in levels where both tracks are voiced, or null with too few points. */
export function trackDistance(a: PitchTrack, b: PitchTrack): number | null {
  const diffs: number[] = [];
  a.forEach((syllable, s) => {
    syllable.forEach((x, k) => {
      const y = b[s]?.[k];
      if (x !== null && y !== null && y !== undefined) diffs.push(Math.abs(x - y) / 10);
    });
  });
  return diffs.length >= 6 ? diffs.reduce((p, q) => p + q, 0) / diffs.length : null;
}

export function DevTeacher({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [items, setItems] = useState<Item[] | "missing" | null>(null);
  useEffect(() => {
    void fetch(`${DATA}teacher.json`).then(async (response) =>
      setItems(response.ok ? ((await response.json()) as Item[]) : "missing"),
    );
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <button type="button" aria-label="Back" onClick={onBack} className="p-2">
          <FaArrowLeft />
        </button>
        <h1 className="text-lg font-semibold">Teacher comparison</h1>
      </header>
      <p className="text-sm text-stone-600">
        Black: the workbook reader's pitch (solid, first reading; dashed, second). Colors: the
        synthesized voices. Each is scaled to its own speaker's range. The number after a voice is
        its mean distance from the nearer reading, in levels.
      </p>
      {items === null && <p className="text-stone-500">Loading…</p>}
      {items === "missing" && (
        <p className="text-stone-700">
          No measurements. Run <code>just teacher</code>, with TONE_PAIRS_WORKBOOK_AUDIO set in
          .env, then reload.
        </p>
      )}
      {Array.isArray(items) &&
        items.map((item) => (
          <ItemRow
            key={`${item.lesson}-${item.item}`}
            deck={deck}
            item={item}
            word={deck.words.find((w) => w.id === item.word)}
          />
        ))}
    </main>
  );
}

function ItemRow({ deck, item, word }: { deck: Deck; item: Item; word: Word | undefined }) {
  const voices = deck.voices.map((v, i) => ({
    ...v,
    color: VOICE_COLORS[i % VOICE_COLORS.length]!,
    track: word ? recordingOf(deck, word, v.key)?.track : undefined,
  }));
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-sm">
        <b>
          {item.lesson.replace("hsk1-", "Lesson ")} #{item.item}
        </b>{" "}
        {item.options.join(" / ")} → {item.heard}{" "}
        {word ? `${word.pinyin}, said ${word.spoken.join("-")}` : "(not in the word list)"}
      </p>
      <Staff
        lines={[
          ...voices.flatMap((v) =>
            v.track ? [{ track: v.track, color: v.color, width: 1.3 }] : [],
          ),
          ...item.takes.map((take, k) => ({
            track: take.p,
            color: "#111",
            width: 2.4,
            dash: k > 0 ? "4 3" : undefined,
          })),
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {item.takes.map((take, k) => (
          <button
            key={take.clip}
            type="button"
            onClick={() => void new Audio(`${DATA}${take.clip}`).play()}
            className="flex items-center gap-1 rounded-full border border-stone-300 px-2 py-1"
          >
            <FaPlay size={9} /> reading {k + 1}
          </button>
        ))}
        {word &&
          voices.map((v) => {
            const clip = clipFor(deck, word, v.key);
            const distances = v.track
              ? item.takes.map((take) => trackDistance(take.p, v.track!)).filter((d) => d !== null)
              : [];
            return (
              <button
                key={v.key}
                type="button"
                disabled={!clip}
                onClick={() => clip && void play(clip)}
                className="flex items-center gap-1 rounded-full border px-2 py-1"
                style={{ borderColor: v.color, color: v.color }}
              >
                <FaPlay size={9} /> {v.label}
                {distances.length > 0 && ` ${Math.min(...distances).toFixed(2)}`}
              </button>
            );
          })}
      </div>
    </section>
  );
}

const W = 320;
const H = 90;

function Staff({
  lines,
}: {
  lines: { track: PitchTrack; color: string; width: number; dash?: string }[];
}) {
  const y = (level: number) => 8 + (5 - level) * 18;
  const spans: [number, number][] = [
    [16, 140],
    [168, 140],
  ];
  const path = (points: readonly (number | null)[], [x0, width]: [number, number]) => {
    let d = "";
    let drawing = false;
    points.forEach((tenths, k) => {
      if (tenths === null) {
        drawing = false;
        return;
      }
      const x = x0 + ((k + 0.5) / points.length) * width;
      d += `${drawing ? "L" : "M"}${x.toFixed(1)},${y(Math.min(Math.max(tenths / 10, 0.5), 5.5)).toFixed(1)}`;
      drawing = true;
    });
    return d;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Pitch comparison">
      {[1, 2, 3, 4, 5].map((level) => (
        <line key={level} x1={12} x2={W - 8} y1={y(level)} y2={y(level)} stroke="#e7e5e4" />
      ))}
      {lines.flatMap((line, i) =>
        line.track.map((syllable, s) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: lines and syllables never reorder.
            key={`${i}:${s}`}
            d={path(syllable, spans[s] ?? spans[1]!)}
            fill="none"
            stroke={line.color}
            strokeWidth={line.width}
            strokeDasharray={line.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )),
      )}
    </svg>
  );
}
