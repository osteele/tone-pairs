/**
 * Where the playhead is: when the playing clip started, by `performance.now()`, given the
 * player's own position.
 *
 * `play()` resolves before sound comes out (on iOS, sometimes by hundreds of milliseconds), so
 * the clock does not start until the player's position first moves. After that it runs on
 * `performance.now()`, which is smooth, where the player's position is updated only every few
 * hundred milliseconds in Safari. The position is a lower bound on how far the clip has played,
 * so a clock that falls behind it is moved up to it.
 *
 * Returns the new start time, or null while the player has not yet moved.
 */
export function anchor(startedAt: number | null, now: number, position: number): number | null {
  if (position <= 0) return startedAt;
  const fromPosition = now - position * 1000;
  return startedAt === null ? fromPosition : Math.min(startedAt, fromPosition);
}
