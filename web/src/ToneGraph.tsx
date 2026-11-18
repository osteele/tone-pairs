import { levelAt, patternLevels, placeAt, syllableWeights } from "./contour";
import type { Pattern, PitchTrack, Timing, Tone } from "./deck";
import { TONE_COLORS, TONE_DARK, TONE_PALE } from "./tones";
import { usePlayback } from "./usePlayback";

export interface GraphLine {
  key: string;
  pattern: Pattern;
  label: string;
  /** The recording this line animates along, with its timing; absent if there is none. */
  path?: string;
  timing?: Timing;
  /** The recording's measured pitch, drawn over the idealized contour. */
  track?: PitchTrack;
}

const W = 320;
const H = 90;
const LEFT = 18;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 10;
const GAP = 18;
const SAMPLES = 32;
const STROKE = 6;
/** The measured pitch: thin, so the contour it is drawn over shows around it. */
const TRACK_STROKE = 1.5;
const JOIN_COLOR = "#a8a29e";

const y = (level: number) => TOP + ((5 - level) / 4) * (H - TOP - BOTTOM);

interface Syllable {
  id: string;
  tone: Tone;
  levels: readonly number[];
  /** [x start, width] */
  span: [number, number];
}

function syllables(key: string, pattern: Pattern): Syllable[] {
  const weights = syllableWeights(pattern);
  const levels = patternLevels(pattern);
  const total = weights.reduce((a, b) => a + b, 0);
  const usable = W - LEFT - RIGHT - GAP * (pattern.length - 1);
  let x = LEFT;
  return weights.map((w, i) => {
    const span: [number, number] = [x, (usable * w) / total];
    x += span[1] + GAP;
    return { id: `${key}:${i}`, tone: pattern[i]!, levels: levels[i]!, span };
  });
}

/** SVG path for one syllable's contour, up to fraction `until` of the syllable. */
function syllablePath(levels: readonly number[], [x0, width]: [number, number], until = 1): string {
  const points: string[] = [];
  const steps = Math.max(1, Math.round(SAMPLES * until));
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * until;
    points.push(`${(x0 + f * width).toFixed(1)},${y(levelAt(levels, f)).toFixed(1)}`);
  }
  return `M${points.join("L")}`;
}

/**
 * SVG path through a syllable's measured pitch, in tenths of a level, broken where the
 * recording is unvoiced.
 */
function trackPath(points: readonly (number | null)[], [x0, width]: [number, number]): string {
  let d = "";
  let drawing = false;
  points.forEach((tenths, k) => {
    if (tenths === null) {
      drawing = false;
      return;
    }
    const x = x0 + ((k + 0.5) / points.length) * width;
    const clamped = Math.min(Math.max(tenths / 10, 0.5), 5.5);
    d += `${drawing ? "L" : "M"}${x.toFixed(1)},${y(clamped).toFixed(1)}`;
    drawing = true;
  });
  return d;
}

/**
 * The idealized contour of one tone pattern on the five-level staff, each syllable in its
 * tone's color, with the recording's measured pitch drawn over it in a darker shade and a dot that follows
 * the recording while it plays. The caller says which word the staff shows.
 */
export function ToneGraph({ line }: { line: GraphLine }) {
  const playback = usePlayback();
  const playing = line.path !== undefined && line.path === playback?.clip?.path;
  const parts = syllables(line.key, line.pattern);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${line.label}: ${line.pattern.join("-")}`}
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <line x1={LEFT} x2={W - RIGHT} y1={y(level)} y2={y(level)} stroke="#e7e5e4" />
          <text x={2} y={y(level) + 4} fontSize={10} fill="#a8a29e">
            {level}
          </text>
        </g>
      ))}
      {parts.map((syllable, i) => {
        const next = parts[i + 1];
        const [x0, width] = syllable.span;
        return (
          <g key={syllable.id}>
            <path
              d={syllablePath(syllable.levels, syllable.span)}
              fill="none"
              stroke={TONE_COLORS[syllable.tone]}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
            {/* Dotted, as in the course's diagrams: how the pitch moves into the next syllable. */}
            {next && (
              <line
                x1={x0 + width}
                y1={y(levelAt(syllable.levels, 1))}
                x2={next.span[0]}
                y2={y(levelAt(next.levels, 0))}
                stroke={JOIN_COLOR}
                strokeWidth={STROKE / 2}
                strokeDasharray="2 5"
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
      {/* The measured pitch, on top of the textbook contour in a darker shade of its color,
          edged in a pale shade of it so it stays distinct where it crosses a contour of the same hue. It
          breaks wherever the recording is unvoiced: voiceless consonants have no pitch. */}
      {line.track &&
        parts.flatMap((syllable, i) => {
          const d = trackPath(line.track?.[i] ?? [], syllable.span);
          return [
            <path
              key={`edge:${syllable.id}`}
              d={d}
              fill="none"
              stroke={TONE_PALE[syllable.tone]}
              strokeWidth={TRACK_STROKE + 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />,
            <path
              key={`track:${syllable.id}`}
              d={d}
              fill="none"
              stroke={TONE_DARK[syllable.tone]}
              strokeWidth={TRACK_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />,
          ];
        })}
      {playing && line.timing && playback && (
        <Playhead parts={parts} timing={line.timing} trail={STROKE + 4} time={playback.time} />
      )}
    </svg>
  );
}

function Playhead({
  parts,
  timing,
  trail,
  time,
}: {
  parts: Syllable[];
  timing: Timing;
  trail: number;
  time: number;
}) {
  const place = placeAt(time, timing);
  const current = parts[place.syllable]!;
  const [x0, width] = current.span;
  return (
    <g>
      {parts.slice(0, place.syllable).map((done) => (
        <path
          key={done.id}
          d={syllablePath(done.levels, done.span)}
          fill="none"
          stroke={TONE_COLORS[done.tone]}
          strokeWidth={trail}
          strokeLinecap="round"
        />
      ))}
      <path
        d={syllablePath(current.levels, current.span, place.fraction)}
        fill="none"
        stroke={TONE_COLORS[current.tone]}
        strokeWidth={trail}
        strokeLinecap="round"
      />
      <circle
        cx={x0 + place.fraction * width}
        cy={y(levelAt(current.levels, place.fraction))}
        r={8}
        fill="white"
        stroke={TONE_COLORS[current.tone]}
        strokeWidth={4}
      />
    </g>
  );
}
