import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { canonicalJson, requireCondition } from '@oms/contracts';
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export interface SourceIdentity {
  version: 1;
  head: string;
  digest: string;
  lock: string;
  files: Record<string, string>;
  tools: { node: string; vitest: string; v8: string; typescript: string };
}
export function runtimeSourceIdentity(): SourceIdentity {
  const files: Record<string, string> = {};
  const collect = (path: string) => {
    requireCondition(
      Object.keys(files).length < 20000,
      503,
      'SOURCE_INVENTORY_LIMIT',
      '유한 소스 inventory를 확인하세요.',
    );
    const s = lstatSync(path);
    requireCondition(
      !s.isSymbolicLink(),
      503,
      'SOURCE_SYMLINK',
      '소스 symbolic link를 임의 해석하지 않습니다.',
    );
    if (s.isDirectory())
      for (const name of readdirSync(path).sort()) {
        if (['node_modules', '.next', 'dist', 'cdk.out', '.reports', '.runtime'].includes(name))
          continue;
        collect(path + '/' + name);
      }
    else {
      requireCondition(
        s.isFile() && s.size <= 4 * 1024 * 1024,
        503,
        'SOURCE_FILE_LIMIT',
        '정규 유한 소스 파일이 필요합니다.',
      );
      files[path] = sha256(readFileSync(path));
    }
  };
  for (const path of [
    'apps',
    'packages',
    'infra/cdk',
    'scripts/u1',
    'scripts/u2',
    'tests/u1',
    'tests/u2',
    'tests/project',
    'docs/u1',
    'docs/u2',
    '.github/workflows',
  ])
    if (existsSync(path)) collect(path);
  for (const path of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'Dockerfile',
    '.dockerignore',
    '.npmrc',
    '.gitignore',
    'eslint.config.mjs',
  ])
    collect(path);
  const version = (name: string) =>
    (
      JSON.parse(readFileSync('node_modules/' + name + '/package.json', 'utf8')) as {
        version: string;
      }
    ).version;
  const tools = {
    node: process.version,
    vitest: version('vitest'),
    v8: version('@vitest/coverage-v8'),
    typescript: version('typescript'),
  };
  requireCondition(
    tools.node === 'v22.23.3' &&
      tools.vitest === '5.0.3' &&
      tools.v8 === '5.0.3' &&
      tools.typescript === '6.0.3',
    503,
    'SOURCE_TOOL_VERSION',
    '승인된 실제 도구 identity가 필요합니다.',
  );
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  requireCondition(
    /^[a-f0-9]{40}$/.test(head),
    503,
    'SOURCE_HEAD',
    '현재 HEAD identity가 필요합니다.',
  );
  const lock = files['package-lock.json']!,
    payload = { head, files, lock, tools };
  return { version: 1, ...payload, digest: sha256(canonicalJson(payload)) };
}
export function productInventory(source: SourceIdentity): string[] {
  return Object.keys(source.files)
    .filter(
      (path) =>
        /\.(ts|tsx|js|mjs|cjs)$/.test(path) &&
        !path.endsWith('.d.ts') &&
        (path.startsWith('apps/') ||
          /^packages\/[^/]+\/src\//.test(path) ||
          path.startsWith('infra/cdk/') ||
          /^scripts\/u[12]\//.test(path)),
    )
    .sort();
}
export function testInventory(source: SourceIdentity, unit: 'u1' | 'u2'): string[] {
  return Object.keys(source.files)
    .filter((path) =>
      new RegExp('^tests/' + unit + '/(unit|integration)/.*\\.spec\\.(ts|tsx)$').test(path),
    )
    .sort();
}
