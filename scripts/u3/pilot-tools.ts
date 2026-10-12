import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, requireCondition } from '@oms/contracts';
import { runCommand } from '../u1/process.js';
import { pilotSourceIdentity } from './runtime-source.js';
import type { SourceIdentity } from '../u2/runtime-source.js';

export const PILOT_CHECKS = ['type', 'lint', 'format'] as const;
export function validatePilotImage(observation: unknown, source: SourceIdentity) {
  const image = observation as {
    Id?: unknown;
    Config?: { Labels?: Record<string, unknown> };
  } | null;
  const labels = image?.Config?.Labels;
  requireCondition(
    typeof image?.Id === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(image.Id) &&
      labels?.['oms.pilot.mode'] === 'pilot-current' &&
      labels['oms.pilot.source'] === source.digest &&
      labels['oms.pilot.lock'] === source.lock,
    503,
    'PILOT_IMAGE_SOURCE',
    '이번 source·lock으로 생성한 정확 image ID와 label이 필요합니다.',
  );
  return {
    passed: true,
    mode: 'pilot-current',
    sourceDigest: source.digest,
    lock: source.lock,
    imageId: image.Id,
    realActivationAllowed: false,
  };
}
async function pilotCheck() {
  const source = pilotSourceIdentity(),
    completed: string[] = [];
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
          'scripts/u3',
          'tests/u1',
          'tests/u2',
          'tests/u3',
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
          'scripts/u3',
          'tests/u1',
          'tests/u2',
          'tests/u3',
          'tests/project',
          'docs/u1',
          'docs/u2',
          'package.json',
          'tsconfig.json',
          'eslint.config.mjs',
        ],
      ],
    ] as const) {
      await runCommand(
        'npx',
        ['--no-install', ...args],
        '.reports/u3/pilot/check-' + name + '.log',
      );
      completed.push(name);
    }
    requireCondition(
      canonicalJson(pilotSourceIdentity()) === canonicalJson(source),
      503,
      'PILOT_CHECK_SOURCE',
      '검사 중 전체 source 변경을 차단합니다.',
    );
  } finally {
    writeFileSync(
      '.reports/u3/pilot/check.json',
      JSON.stringify(
        {
          passed:
            canonicalJson(completed) === canonicalJson(PILOT_CHECKS) &&
            canonicalJson(pilotSourceIdentity()) === canonicalJson(source),
          completed,
          sourceDigest: source.digest,
          realActivationAllowed: false,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
export async function pilotTool(name: string): Promise<void> {
  requireCondition(
    process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only',
    503,
    'PILOT_TOOL_ADMISSION',
    '등록한 격리 합성 검증에서만 실행합니다.',
  );
  mkdirSync('.reports/u3/pilot', { recursive: true, mode: 0o700 });
  if (name === 'check') await pilotCheck();
  else if (name === 'synth') (await import('../u2/synth.js')).synthU2(pilotSourceIdentity);
  else if (name === 'security')
    await (
      await import('../u2/security.js')
    ).securityU2({ identity: pilotSourceIdentity, extraSastRoots: ['scripts/u3'] });
  else if (name === 'runtime-security')
    await (
      await import('../u2/runtime-security-report.js')
    ).runtimeSecurityReport(pilotSourceIdentity);
  else if (name === 'image') {
    const observation = JSON.parse(
      execFileSync(
        'docker',
        ['image', 'inspect', 'oms-u2-local:verification', '--format', '{{json .}}'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
    writeFileSync(
      '.reports/u3/pilot/image.json',
      JSON.stringify(validatePilotImage(observation, pilotSourceIdentity()), null, 2),
      { mode: 0o600 },
    );
  } else requireCondition(false, 503, 'PILOT_TOOL', '등록한 bounded 검증 도구만 실행합니다.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await pilotTool(process.argv[2] ?? '');
