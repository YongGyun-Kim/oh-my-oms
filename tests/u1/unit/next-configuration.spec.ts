import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
describe('양쪽 Next runtime config·secret 비고정·custom TLS 호환', () => {
  it.each(['customer-web', 'staff-web'])(
    '%s의 mjs config는 runtime compiler 없이 import하고 secret을 build env에 고정하지 않는다',
    async (app) => {
      const config = (await import(pathToFileURL(resolve('apps', app, 'next.config.mjs')).href))
        .default;
      expect(config.env).toBeUndefined();
      expect(config.output).not.toBe('standalone');
      expect(config.poweredByHeader).toBe(false);
      expect(config.transpilePackages).toContain('@oms/ui');
    },
  );
});
