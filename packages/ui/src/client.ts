import { OriginalIntents } from './original-intents.ts';
import { readLimited } from './limited-stream.ts';
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly requestNotSent = false,
    readonly superseded = false,
  ) {
    super(message);
  }
}
export class BrowserApi {
  readonly originals = new OriginalIntents();
  private generation = 0;
  private csrf: string | null = null;
  private readonly active = new Set<AbortController>();
  reset(): void {
    this.generation++;
    this.csrf = null;
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
  async read<T>(path: string): Promise<T> {
    return this.execute<T>(path);
  }
  async command<T>(
    path: string,
    input: unknown,
    headers: Record<string, string> = {},
    onSent?: () => void,
  ): Promise<T> {
    return this.execute<T>(path, input, headers, onSent);
  }
  private async execute<T>(
    path: string,
    input?: unknown,
    additional: Record<string, string> = {},
    onSent?: () => void,
  ): Promise<T> {
    const generation = this.generation;
    const controller = new AbortController();
    this.active.add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(input === undefined ? 5000 : 10000),
    ]);
    let sent = false;
    const decode = async <Result>(response: Response): Promise<Result> => {
      const bytes = await readLimited(response.body, 4 * 1024 * 1024, signal);
      signal.throwIfAborted();
      return JSON.parse(new TextDecoder().decode(bytes)) as Result;
    };
    try {
      if (input !== undefined && !this.csrf) {
        const response = await fetch('/api/security/csrf', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        });
        if (!response.ok)
          throw new ApiFailure(response.status, '인증 접점을 다시 확인하세요.', true);
        const result = await decode<{ csrfToken: string }>(response);
        if (generation !== this.generation)
          throw new ApiFailure(401, '계정이 변경되었습니다.', true, true);
        this.csrf = result.csrfToken;
      }
      const body = input === undefined ? undefined : JSON.stringify(input);
      if (body && new TextEncoder().encode(body).byteLength > 65536)
        throw new ApiFailure(400, '입력 크기를 확인하세요.', true);
      signal.throwIfAborted();
      onSent?.();
      sent = true;
      const response = await fetch('/api' + path, {
        method: input === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: {
          ...(input === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf! }),
          ...additional,
        },
        ...(body === undefined ? {} : { body }),
      });
      if (input !== undefined) this.csrf = null;
      const result = await decode<T & { detail?: string }>(response);
      if (generation !== this.generation)
        throw new ApiFailure(401, '계정이 변경되었습니다.', false, true);
      if (!response.ok) {
        if (response.status === 401) this.reset();
        throw new ApiFailure(response.status, result.detail ?? '요청을 확인할 수 없습니다.');
      }
      return result;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (generation !== this.generation)
        throw new ApiFailure(401, '현재 계정에서 다시 확인하세요.', !sent, true);
      throw new ApiFailure(
        503,
        '처리 결과를 아직 확인할 수 없습니다. 원래 요청을 다시 대조하세요.',
        !sent,
      );
    } finally {
      if (input !== undefined) this.csrf = null;
      this.active.delete(controller);
    }
  }
}
