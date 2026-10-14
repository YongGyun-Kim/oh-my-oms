export class PayloadLimit extends Error {}
export async function readLimited(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  signal.throwIfAborted();
  if (!stream) return undefined;
  const reader = stream.getReader();
  const buffer = new Uint8Array(maximum);
  let total = 0;
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      if (part.value.byteLength > maximum - total) {
        void reader.cancel().catch(() => undefined);
        throw new PayloadLimit('유한 크기 초과');
      }
      buffer.set(part.value, total);
      total += part.value.byteLength;
    }
    return buffer.slice(0, total);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
