import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runCommand } from './process.js';
export async function checkUnit(): Promise<void> {
  if (process.version !== 'v22.23.3') throw new Error('검증된 프로젝트 Node22.23.3이 필요합니다.');
  const checks = [
    ['type', ['tsc', '--noEmit']],
    [
      'lint',
      ['eslint', 'apps', 'packages', 'infra/cdk', 'scripts/u1', 'tests/u1', 'eslint.config.mjs'],
    ],
    [
      'format',
      [
        'prettier',
        '--check',
        'apps',
        'packages',
        'infra/cdk',
        'scripts/u1',
        'tests/u1',
        'docs/u1',
        'package.json',
        'tsconfig.json',
        'eslint.config.mjs',
      ],
    ],
  ] as const;
  const completed: string[] = [];
  try {
    for (const [name, args] of checks) {
      await runCommand('npx', args, '.reports/u1/check-' + name + '.log');
      completed.push(name);
    }
  } finally {
    writeFileSync(
      '.reports/u1/check.json',
      JSON.stringify(
        {
          node: process.version,
          completed,
          passed: completed.length === checks.length,
          observedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await checkUnit();
