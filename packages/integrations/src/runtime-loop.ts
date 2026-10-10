export async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((done) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      done();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}
export async function runWorkerLoop(
  cycle: () => Promise<void>,
  signal: AbortSignal,
  failure: (error: unknown) => void,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await cycle();
    } catch (error) {
      if (!signal.aborted) {
        failure(error);
        await abortableDelay(1000, signal);
      }
    }
  }
}
