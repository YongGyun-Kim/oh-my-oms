import { describe, expect, it } from 'vitest';
import { runtimeSourceIdentity, runtimeSourceDigest } from '../../../scripts/u1/runtime-source.js';
function fixture() {
  const dirs: Record<string, string[]> = {
    apps: ['a.ts', 'config.mjs', 'node_modules', '.next', 'dist'],
    packages: ['contracts'],
    'packages/contracts': ['schema.json'],
    'infra/cdk': ['stack.ts'],
    'scripts/u1': ['guard.cjs'],
    'tests/u1': [],
  };
  const bodies: Record<string, string> = {
    'apps/a.ts': '원래 source',
    'apps/config.mjs': 'export default {}',
    'packages/contracts/schema.json': '{}',
    'infra/cdk/stack.ts': 'stack',
    'scripts/u1/guard.cjs': 'guard',
  };
  let symlink = '';
  let large = '';
  let irregular = '';
  const ports = {
    readdirSync: (path: string) => dirs[path]!,
    readFileSync: (path: string) => Buffer.from(bodies[path]!),
    lstatSync: (path: string) => ({
      size: path === large ? 4 * 1024 * 1024 + 1 : 10,
      isDirectory: () => path in dirs,
      isFile: () => !(path in dirs) && path !== irregular,
      isSymbolicLink: () => path === symlink,
    }),
  } as unknown as NonNullable<Parameters<typeof runtimeSourceIdentity>[0]>;
  return {
    ports,
    bodies,
    symlink: (path: string) => {
      symlink = path;
    },
    large: (path: string) => {
      large = path;
    },
    irregular: (path: string) => {
      irregular = path;
    },
  };
}
describe('현재 전체 runtime source identity의 실제파일 포트', () => {
  it('TS뿐 아니라MJS/CJS와닫힌계약JSON까지포함한다', () => {
    const f = fixture();
    const result = runtimeSourceIdentity(f.ports);
    expect(Object.keys(result)).toHaveLength(5);
    expect(result['apps/config.mjs']).toMatch(/^[a-f0-9]{64}$/);
    expect(result['scripts/u1/guard.cjs']).toBeDefined();
  });
  it('생성dist/.next와설치node_modules는제품source로섞지않는다', () => {
    const result = runtimeSourceIdentity(fixture().ports);
    expect(Object.keys(result).some((key) => /node_modules|\.next|dist\//.test(key))).toBe(false);
  });
  it('source내용변화는같은경로에서도digest를바꾼다', () => {
    const f = fixture();
    const before = runtimeSourceDigest(runtimeSourceIdentity(f.ports));
    f.bodies['apps/a.ts'] = '새 source';
    expect(runtimeSourceDigest(runtimeSourceIdentity(f.ports))).not.toBe(before);
  });
  it('외부symbolic link를따라가서허가되지않은source를hash하지않는다', () => {
    const f = fixture();
    f.symlink('apps/a.ts');
    expect(() => runtimeSourceIdentity(f.ports)).toThrow('symbolic');
  });
  it('유한파일한도초과와파일아닌자료는준비오류다', () => {
    const f = fixture();
    f.large('apps/a.ts');
    expect(() => runtimeSourceIdentity(f.ports)).toThrow('유한');
    const other = fixture();
    other.irregular('apps/a.ts');
    expect(() => runtimeSourceIdentity(other.ports)).toThrow('유한');
  });
  it('map삽입순서만다르고내용이같으면같은canonical digest다', () => {
    expect(runtimeSourceDigest({ a: '1', b: '2' })).toBe(runtimeSourceDigest({ b: '2', a: '1' }));
  });
});
