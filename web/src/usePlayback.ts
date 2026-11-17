import { useEffect, useState } from "react";
import type { Playback } from "./audio";
import { subscribe } from "./audio";

/** The shared player's state, updated every animation frame while it plays. */
export function usePlayback(): Playback | null {
  const [state, setState] = useState<Playback | null>(null);
  useEffect(() => subscribe(setState), []);
  return state;
}
