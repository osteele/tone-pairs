import type { ReactNode } from "react";
import { useState } from "react";
import { FaCircleQuestion, FaPen, FaVolumeHigh } from "react-icons/fa6";
import type { Tone } from "./deck";
import { Modal } from "./Modal";
import { TONE_COLORS } from "./tones";

export type HelpTopic = "start" | "question" | "feedback" | "browse";

const TONE_NAMES: [Tone, string][] = [
  [1, "first"],
  [2, "second"],
  [3, "third"],
  [4, "fourth"],
  [5, "neutral"],
];

const SECTIONS: Record<HelpTopic, { title: string; body: ReactNode }> = {
  start: {
    title: "Start screen",
    body: (
      <>
        <p>
          The switch at the top sets what tapping a lesson does. <b>Learn</b> reviews the words due
          and introduces new ones. <b>Practice</b> drills the lesson's words without changing the
          schedule, and favors the tone patterns you miss most. <b>Browse</b> lists the lesson's
          syllables, so you can hear every tone pattern of each.
        </p>
        <p>
          ⓘ shows credits and the build. ⚙ holds the settings, among them the number of new words a
          day and a drill of real words only.
        </p>
      </>
    ),
  },
  question: {
    title: "Answering",
    body: (
      <>
        <p>
          You hear a word and see its syllables without tone marks. Tap a tone for each syllable, in
          either order. The answer counts once both are chosen.
        </p>
        <p>
          The play button replays the word. It spins while the word loads, and a ring around it
          fills as the word plays. Below it, <b>½ speed</b> plays the word slowly at the same pitch.
          The voice's name plays the word in the next voice, which the answer screen then uses. Tap
          a syllable to hear it alone. If you don't know the tones, tap <b>Show answer</b>, which
          counts as a miss.
        </p>
      </>
    ),
  },
  feedback: {
    title: "After you answer",
    body: (
      <>
        <p>
          <FaVolumeHigh className="inline" /> and a gray frame mark the word played.{" "}
          <FaPen className="inline" /> and a purple frame mark your answer. Tap a staff to hear its
          word, and tap characters to copy them. <b>Play both</b> plays the two in a row, and{" "}
          <b>Loop both</b> repeats them until you stop it.
        </p>
        <p>
          Each staff is the pitch scale, 1 low to 5 high. The thick line is the textbook shape of
          the tones. The thin line over it, in a deeper shade, is the pitch measured in the
          recording. It breaks where there is no pitch to measure: voiceless consonants such as s,
          sh, x, f, h, and p are made without voice. A dot follows the word as it plays.
        </p>
        <p>
          The four voices say some tones differently, as people do. A first tone at the end of a
          word is the clearest case: the two women, Xiaoxiao and Xiaoyi, hold it level or let it
          rise a little, while the two men, Yunxi and Yunjian, often let it sag. A sagging first
          tone is still a first tone. A fourth tone starts high and falls much further.
        </p>
        <p>
          <b>Say it</b> records you saying the word and draws your pitch on its staff, scaled to
          your own range, which it learns from your takes. <b>Mine</b> plays your take. The
          recording stays on this device.
        </p>
        <p>
          "Not a word" marks a made-up word that fills out a family. "Re-pitched" marks a recording
          made by changing another word's pitch, for tones that no word has.
        </p>
      </>
    ),
  },
  browse: {
    title: "Browsing",
    body: (
      <p>
        Each family is a pair of syllables. Its grid has a row for each tone of the first syllable
        and a column for each tone of the second. Tap a cell to hear it and see its pitch. Gray
        cells have no recording. A word written 3-3 is said 2-3, so it is listed under 2-3.{" "}
        <b>Include non-words</b> adds the made-up words, and the buttons above the grid choose the
        voice.
      </p>
    ),
  },
};

/** A help button for a screen's header: one dialog, with that screen's section first. */
export function HelpButton({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  const order: HelpTopic[] = [
    topic,
    ...(["start", "question", "feedback", "browse"] as const).filter((t) => t !== topic),
  ];
  return (
    <>
      <button
        type="button"
        aria-label="Help"
        className="rounded-full p-2 text-stone-500 active:bg-stone-200"
        onClick={() => setOpen(true)}
      >
        <FaCircleQuestion size={20} />
      </button>
      <Modal title="Help" open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4 text-sm">
          {order.map((t) => (
            <section key={t} className="flex flex-col gap-2">
              <h3 className="font-semibold">{SECTIONS[t].title}</h3>
              {SECTIONS[t].body}
            </section>
          ))}
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Tone colors</h3>
            <p className="flex flex-wrap gap-x-3">
              {TONE_NAMES.map(([tone, name]) => (
                <span key={tone} style={{ color: TONE_COLORS[tone] }} className="font-medium">
                  {name}
                </span>
              ))}
            </p>
          </section>
        </div>
      </Modal>
    </>
  );
}
