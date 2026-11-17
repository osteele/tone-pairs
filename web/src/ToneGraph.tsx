import { levelAt, patternLevels, placeAt, syllableWeights } from "./contour";
import type { Pattern, Timing } from "./deck";
import { usePlayback } from "./usePlayback";

export interface GraphLine {
  key: string;
  pattern: Pattern;
  label: string;
  color: string;
  /** The recording this line animates along, with its timing; absent if there is none. */
  path?: string;
  timing?: Timing;
}

const W = 320;
const H = 130;
const LEFT = 18;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 10;
const GAP = 18;
const SAMPLES = 32;

const y = (level: number) => TOP + ((5 - level) / 4) * (H - TOP - BOTTOM);

interface Syllable {
  id: string;
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
    return { id: `${key}:${i}`, levels: levels[i]!, span };
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

/** Idealized contours of one or two tone patterns, with a dot that follows playback. */
export function ToneGraph({ lines }: { lines: GraphLine[] }) {
  const playback = usePlayback();
  const active = lines.find((l) => l.path !== undefined && l.path === playback?.clip?.path);

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={lines.map((l) => `${l.label}: ${l.pattern.join("-")}`).join("; ")}
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <g key={level}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(level)} y2={y(level)} stroke="#e7e5e4" />
            <text x={2} y={y(level) + 4} fontSize={10} fill="#a8a29e">
              {level}
            </text>
          </g>
        ))}
        {lines.map((line, i) => {
          const dim = active !== undefined && active.key !== line.key;
          return (
            <g key={line.key} opacity={dim ? 0.35 : 1}>
              {syllables(line.key, line.pattern).map((syllable) => (
                <path
                  key={syllable.id}
                  d={syllablePath(syllable.levels, syllable.span)}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={strokeWidth(i)}
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}
        {active?.timing && playback && (
          <Playhead
            line={active}
            trail={strokeWidth(lines.indexOf(active)) + 4}
            time={playback.time}
          />
        )}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 text-sm">
        {lines.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-4 rounded" style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** The first line (the heard word) is drawn wide; later lines narrower, on top, so both
 * stay visible where the contours coincide. */
function strokeWidth(index: number): number {
  return index === 0 ? 7 : 3;
}

function Playhead({ line, trail, time }: { line: GraphLine; trail: number; time: number }) {
  const parts = syllables(line.key, line.pattern);
  const place = placeAt(time, line.timing!);
  const current = parts[place.syllable]!;
  const [x0, width] = current.span;
  return (
    <g>
      {parts.slice(0, place.syllable).map((done) => (
        <path
          key={done.id}
          d={syllablePath(done.levels, done.span)}
          fill="none"
          stroke={line.color}
          strokeWidth={trail}
          strokeLinecap="round"
        />
      ))}
      <path
        d={syllablePath(current.levels, current.span, place.fraction)}
        fill="none"
        stroke={line.color}
        strokeWidth={trail}
        strokeLinecap="round"
      />
      <circle
        cx={x0 + place.fraction * width}
        cy={y(levelAt(current.levels, place.fraction))}
        r={8}
        fill="white"
        stroke={line.color}
        strokeWidth={4}
      />
    </g>
  );
}
