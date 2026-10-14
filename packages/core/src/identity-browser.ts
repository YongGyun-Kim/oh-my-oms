import { AsyncLocalStorage } from 'node:async_hooks';
import { requireCondition } from '@oms/contracts';
interface BrowserBinding {
  current: string;
  next?: string;
}
const bindings = new AsyncLocalStorage<BrowserBinding>();
// Only the server admission layer supplies this context after host/Origin/CSRF validation.
// A JSON field or a client principal header never becomes a trusted browser binding.
export class IdentityBrowser {
  static run<T>(binding: BrowserBinding, operation: () => Promise<T>): Promise<T> {
    requireCondition(
      /^[A-Za-z0-9_-]{43}$/.test(binding.current) &&
        (!binding.next || /^[A-Za-z0-9_-]{43}$/.test(binding.next)),
      503,
      'BROWSER_BINDING_CONFIGURATION',
      '서버 인증 접점 구성을 확인하세요.',
    );
    return bindings.run(binding, operation);
  }
  static current(synthetic: boolean): string {
    const value = bindings.getStore()?.current;
    requireCondition(
      value || synthetic,
      401,
      'BROWSER_BINDING_REQUIRED',
      '인증을 현재 접점에서 다시 시작하세요.',
    );
    return value ?? 'explicit-local-synthetic-binding';
  }
  static next(synthetic: boolean): string {
    return bindings.getStore()?.next ?? this.current(synthetic);
  }
}
