// Only an already visible original progress view polls. Reads never extend server idle.
export function startProgressPolling(
  refresh: () => Promise<void>,
  visibility: () => boolean,
  clock = () => Date.now(),
  onFailure: (error: unknown) => void = () => undefined,
): () => void {
  const started = clock();
  let additional = 0;
  let stopped = false;
  let busy = false;
  const timer = setInterval(() => {
    if (stopped || busy || !visibility()) return;
    if (clock() - started >= 10 * 60000 && additional++ >= 20) {
      clearInterval(timer);
      return;
    }
    busy = true;
    void refresh()
      .catch(onFailure)
      .finally(() => {
        busy = false;
      });
  }, 30000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
