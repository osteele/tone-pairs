/**
 * Run `step`, reporting it as loading until it settles, whether it succeeds or fails, so a
 * failure cannot leave a loading indicator stuck on. The failure itself still propagates.
 */
export async function whileLoading<T>(
  setLoading: (loading: boolean) => void,
  step: () => Promise<T>,
): Promise<T> {
  setLoading(true);
  try {
    return await step();
  } finally {
    setLoading(false);
  }
}
