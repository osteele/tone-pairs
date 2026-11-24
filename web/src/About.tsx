import { FaGithub } from "react-icons/fa6";

const CREDITS = [
  {
    name: "HSK Standard Course 1 Workbook",
    href: "https://www.blcup.com/",
    note: "Beijing Language and Culture University Press. The drilled words come from its pronunciation exercises.",
  },
  {
    name: "CC-CEDICT",
    href: "https://cc-cedict.org/",
    note: "Words, readings, and glosses. CC BY-SA 4.0.",
  },
  {
    name: "wordfreq",
    href: "https://github.com/rspeer/wordfreq",
    note: "Word and character frequencies, by Robyn Speer. Data CC BY-SA 4.0.",
  },
  {
    name: "Microsoft Edge text-to-speech",
    href: "https://github.com/rany2/edge-tts",
    note: "The recordings, synthesized with the Xiaoxiao, Yunxi, Xiaoyi, and Yunjian voices via edge-tts.",
  },
  {
    name: "ts-fsrs",
    href: "https://github.com/open-spaced-repetition/ts-fsrs",
    note: "The FSRS review scheduler. MIT License.",
  },
  {
    name: "React Icons",
    href: "https://react-icons.github.io/react-icons/",
    note: "Font Awesome icons. CC BY 4.0.",
  },
];

const LINK = "font-medium text-teal-700 underline";
const REPO = "https://github.com/osteele/tone-pairs";

export function About() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-4">
        <img
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          className="size-16 shrink-0 rounded-2xl"
        />
        <div>
          <p className="text-base font-semibold">Tone Pairs</p>
          <p className="text-stone-600">
            By{" "}
            <a href="https://osteele.com" target="_blank" rel="noreferrer" className={LINK}>
              Oliver Steele
            </a>
          </p>
          <p className="text-xs text-stone-400">
            Build {__BUILD_ID__} · {new Date(__BUILD_TIME__).toLocaleDateString()}
          </p>
        </div>
      </div>
      <p>
        A listening drill for the tones of two-syllable Mandarin words. You hear a word and name its
        two tones. Spaced repetition brings back the words you miss sooner.
      </p>
      <h3 className="font-semibold">Credits</h3>
      <ul className="flex flex-col gap-2">
        {CREDITS.map((c) => (
          <li key={c.name}>
            <a href={c.href} target="_blank" rel="noreferrer" className={LINK}>
              {c.name}
            </a>
            <span className="text-stone-600"> — {c.note}</span>
          </li>
        ))}
      </ul>
      <a
        href={`${REPO}/blob/main/docs/how-it-works.md`}
        target="_blank"
        rel="noreferrer"
        className={LINK}
      >
        How it works: the words, recordings, pitch graphs, and grading
      </a>
      <a
        href={REPO}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 font-medium text-teal-700"
      >
        <FaGithub size={18} /> Source code on GitHub
      </a>
      <p className="text-stone-500">
        © 2026 Oliver Steele. The code is released under the{" "}
        <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className={LINK}>
          MIT License
        </a>
        . The word list is derived from CC-CEDICT and wordfreq data and shares their{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          CC BY-SA 4.0
        </a>{" "}
        license.
      </p>
    </div>
  );
}
