export type AnalysisStage = 0 | 1 | 2 | 3 | 4;

export const LOADING_MOTION_MS = 650;

export async function runAnalysis<T>(
  load: () => Promise<T>,
  onStage: (stage: AnalysisStage) => void,
  pause: () => Promise<void>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  onStage(1);
  const [result] = await Promise.all([load(), pause()]);
  signal.throwIfAborted();
  for (const stage of [2, 3, 4] as const) {
    onStage(stage);
    await pause();
    signal.throwIfAborted();
  }
  return result;
}

export function waitForMotion(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, LOADING_MOTION_MS);
    signal.addEventListener("abort", abort, { once: true });
  });
}
