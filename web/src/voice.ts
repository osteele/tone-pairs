/**
 * Recording the listener saying a word.
 *
 * On iOS, playback is much quieter and slower to start while a microphone is open, so a take
 * releases the microphone as soon as it ends, and anything asked to play first ends the take.
 */

import { onBeforePlay, stop as stopPlayback } from "./audio";
import type { TakeSummary } from "./speaker";

/** Longest take; a word takes about a second to say. */
const MAX_MS = 3000;
/** The take ends this long after the voice falls quiet. */
const QUIET_MS = 450;
/** Loudness that counts as speaking, and the fraction of the loudest that counts as quiet. */
const SPEAKING_RMS = 0.02;
const QUIET_FRACTION = 0.2;

export interface Take {
  /** For playing the take back. */
  blob: Blob;
  samples: Float32Array;
  rate: number;
}

let ending: (() => void) | null = null;

/** End the take being recorded, if any. */
export function endTake(): void {
  ending?.();
}

onBeforePlay(endTake);

/** Record a take, ending it when the voice falls quiet, after MAX_MS, or on endTake(). */
export async function recordTake(): Promise<Take> {
  stopPlayback();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  const context = new AudioContext();
  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const buffer = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let loudest = 0;
    let quietSince: number | null = null;
    let timer: number | undefined;
    const end = () => {
      window.clearInterval(timer);
      ending = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    };
    ending = end;
    recorder.start();
    timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const x of buffer) sum += x * x;
      const rms = Math.sqrt(sum / buffer.length);
      const now = performance.now();
      loudest = Math.max(loudest, rms);
      const speaking = loudest >= SPEAKING_RMS;
      if (speaking && rms < loudest * QUIET_FRACTION) quietSince ??= now;
      else quietSince = null;
      if (now - started >= MAX_MS || (quietSince !== null && now - quietSince >= QUIET_MS)) {
        end();
      }
    }, 30);
    await stopped;
    const blob = new Blob(chunks, { type: chunks[0]?.type || recorder.mimeType });
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    return { blob, samples: audio.getChannelData(0), rate: audio.sampleRate };
  } finally {
    ending = null;
    release();
    await context.close();
  }
}

const SPEAKER_KEY = "tone-pairs/speaker";
/** Takes remembered for the listener's voice. */
const TAKES_KEPT = 50;

/**
 * The listener's voice as kept on this device: the summaries of their recent takes, and the
 * previous speaker's, kept for one undo after starting fresh.
 */
export interface SpeakerStore {
  takes: TakeSummary[];
  previous: TakeSummary[] | null;
}

export function loadSpeaker(): SpeakerStore {
  // Per-take ranges, which nothing reads, were kept under this key.
  localStorage.removeItem("tone-pairs/voice-ranges");
  const text = localStorage.getItem(SPEAKER_KEY);
  return text ? (JSON.parse(text) as SpeakerStore) : { takes: [], previous: null };
}

function saveSpeaker(store: SpeakerStore): SpeakerStore {
  localStorage.setItem(SPEAKER_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(SPEAKER_KEY));
  return store;
}

/** Add a take to the current speaker's. */
export function keepTake(take: TakeSummary): SpeakerStore {
  const store = loadSpeaker();
  return saveSpeaker({ ...store, takes: [...store.takes, take].slice(-TAKES_KEPT) });
}

/** Start a new speaker, from `take` if given, keeping the current one for switchBack. */
export function startFresh(take?: TakeSummary): SpeakerStore {
  const store = loadSpeaker();
  return saveSpeaker({ takes: take ? [take] : [], previous: store.takes });
}

/** Return to the speaker before the last startFresh, keeping the current one in its place. */
export function switchBack(): SpeakerStore {
  const store = loadSpeaker();
  return saveSpeaker({ takes: store.previous ?? [], previous: store.takes });
}

/** Call `listener` whenever the stored speaker changes in this tab. */
export function onSpeakerChange(listener: () => void): () => void {
  window.addEventListener(SPEAKER_KEY, listener);
  return () => window.removeEventListener(SPEAKER_KEY, listener);
}
