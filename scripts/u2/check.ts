import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from '../u1/process.js';

export async function checkU2(): Promise<void> {
  if (process.version !== 'v22.23.3') throw new Error('검증된 Node22.23.3이 필요합니다.');
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  const completed: string[] = [];
  try {
    for (const [name, args] of [
      ['type', ['tsc', '--noEmit']],
      [
        'lint',
        [
          'eslint',
          'apps',
          'packages',
          'infra/cdk',
          'scripts/u1',
          'scripts/u2',
          'tests/u1',
          'tests/u2',
          'tests/project',
          'eslint.config.mjs',
        ],
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
          'scripts/u2',
          'tests/u1',
          'tests/u2',
          'tests/project',
          'docs/u2',
          'docs/u1',
          'package.json',
          'tsconfig.json',
          'eslint.config.mjs',
        ],
      ],
    ] as const) {
      await runCommand('npx', [...args], '.reports/u2/check-' + name + '.log');
      completed.push(name);
    }
  } finally {
    writeFileSync(
      '.reports/u2/check.json',
      JSON.stringify(
        {
          completed,
          passed: completed.length === 3,
          realActivationAllowed: false,
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
  await checkU2();
