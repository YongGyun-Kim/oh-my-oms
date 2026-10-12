import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { canonicalJson, requireCondition } from '@oms/contracts';
import { runtimeSourceIdentity, sha256 } from '../u2/runtime-source.js';
import type { SourceIdentity } from '../u2/runtime-source.js';

export type PilotUnit = 'u1' | 'u2' | 'u3';
// 구형 full-proof의 inventory/계약은 그대로 둔다. pilot만 U3의 모든 실제 source를 추가한다.
export function pilotSourceIdentity(): SourceIdentity {
  const base = runtimeSourceIdentity(),
    files = { ...base.files };
  const collect = (path: string) => {
    requireCondition(
      Object.keys(files).length < 20000,
      503,
      'PILOT_SOURCE_LIMIT',
      '유한 전체 소스 inventory가 필요합니다.',
    );
    const stat = lstatSync(path);
    requireCondition(
      !stat.isSymbolicLink(),
      503,
      'PILOT_SOURCE_SYMLINK',
      '소스 symbolic link를 추정하지 않습니다.',
    );
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (['node_modules', '.next', 'dist', 'cdk.out', '.reports', '.runtime'].includes(name))
          continue;
        collect(path + '/' + name);
      }
    } else {
      requireCondition(
        stat.isFile() && stat.size <= 4 * 1024 * 1024,
        503,
        'PILOT_SOURCE_FILE',
        '정규 유한 소스 원문이 필요합니다.',
      );
      files[path] = sha256(readFileSync(path));
    }
  };
  for (const path of ['scripts/u3', 'tests/u3', 'docs/u3']) if (existsSync(path)) collect(path);
  const payload = { head: base.head, files, lock: base.lock, tools: base.tools };
  return { version: 1, ...payload, digest: sha256(canonicalJson(payload)) };
}
export function pilotProductInventory(source: SourceIdentity): string[] {
  return Object.keys(source.files)
    .filter(
      (path) =>
        /\.(ts|tsx|js|mjs|cjs)$/.test(path) &&
        !path.endsWith('.d.ts') &&
        (path.startsWith('apps/') ||
          /^packages\/[^/]+\/src\//.test(path) ||
          path.startsWith('infra/cdk/') ||
          /^scripts\/u[123]\//.test(path)),
    )
    .sort();
}
export function pilotTestInventory(source: SourceIdentity, unit: PilotUnit): string[] {
  return Object.keys(source.files)
    .filter((path) =>
      new RegExp('^tests/' + unit + '/(unit|integration)/.*\\.spec\\.(ts|tsx)$').test(path),
    )
    .sort();
}
