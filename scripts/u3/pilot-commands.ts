import type { ProofCommand } from '../u2/ci-full-proof.js';
import type { SourceIdentity } from '../u2/runtime-source.js';
import type { PilotUnit } from './runtime-source.js';
import { pilotCoveragePath } from './coverage-evidence.js';

export interface PilotCommand extends ProofCommand {
  environment: Record<string, string>;
  scope: PilotUnit | 'project';
}
export const PILOT_DEFERRED = [
  'bulk-100k-50min',
  'full-dr-proof',
  'uninterrupted-rollout',
  'operating-owner-registration',
] as const;
export function pilotCommands(source: SourceIdentity): PilotCommand[] {
  const common = {
      NODE_ENV: 'test',
      OMS_U2_SYNTHETIC_PROFILE: 'approved-local-only',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    commands: PilotCommand[] = [];
  for (const unit of ['u1', 'u2', 'u3'] as const) {
    const environment = {
      ...common,
      ['OMS_' + unit.toUpperCase() + '_DATABASE_PROFILE']: 'verification-isolated',
    };
    for (const layer of ['unit', 'integration'] as const) {
      const path = '.reports/u3/pilot/' + unit + '-' + layer + '.json';
      commands.push({
        key: unit + '-' + layer,
        scope: unit,
        environment,
        command: [
          'npm',
          'run',
          'test:' + unit + ':' + layer,
          '--',
          '--reporter=default',
          '--reporter=json',
          '--outputFile=' + path,
        ],
        path,
        ...(unit === 'u3' && layer === 'integration' ? { timeoutMilliseconds: 1200000 } : {}),
      });
    }
    commands.push({
      key: unit + '-coverage',
      scope: unit,
      environment: { ...environment, OMS_PILOT_COVERAGE_UNIT: unit },
      command: [
        'npx',
        '--no-install',
        'vitest',
        'run',
        '--config',
        'tests/project/vitest.pilot.coverage.config.ts',
        '--coverage',
      ],
      path: pilotCoveragePath(unit) + '/evidence.json',
      ...(unit === 'u3' ? { timeoutMilliseconds: 1800000 } : {}),
    });
  }
  commands.push({
    key: 'u2-e2e',
    scope: 'u2',
    environment: { ...common, OMS_U2_DATABASE_PROFILE: 'e2e-isolated' },
    command: ['npm', 'run', 'test:u2:e2e'],
    path: '.reports/u2/e2e.json',
  });
  for (const [key, command, path, timeoutMilliseconds] of [
    [
      'coverage-aggregate',
      ['node', '--import', 'tsx', 'scripts/u3/coverage-aggregate.ts'],
      '.reports/u3/pilot/coverage-aggregate.json',
      600000,
    ],
    [
      'check',
      ['node', '--import', 'tsx', 'scripts/u3/pilot-tools.ts', 'check'],
      '.reports/u3/pilot/check.json',
      600000,
    ],
    [
      'synth',
      ['node', '--import', 'tsx', 'scripts/u3/pilot-tools.ts', 'synth'],
      '.reports/u2/synth.json',
      600000,
    ],
    [
      'image-build',
      [
        'docker',
        'build',
        '--platform',
        'linux/amd64',
        '--label',
        'oms.unit=u2-identity-enterprise-access',
        '--label',
        'oms.pilot.mode=pilot-current',
        '--label',
        'oms.pilot.source=' + source.digest,
        '--label',
        'oms.pilot.lock=' + source.lock,
        '-t',
        'oms-u2-local:verification',
        '.',
      ],
      '.reports/u2/project-image-build.log',
      3600000,
    ],
    [
      'image',
      ['node', '--import', 'tsx', 'scripts/u3/pilot-tools.ts', 'image'],
      '.reports/u3/pilot/image.json',
      600000,
    ],
    [
      'security',
      ['node', '--import', 'tsx', 'scripts/u3/pilot-tools.ts', 'security'],
      '.reports/u2/security.json',
      3600000,
    ],
    [
      'runtime-security-tests',
      [
        'npm',
        'run',
        'test:u2:runtime-security',
        '--',
        '--reporter=default',
        '--reporter=json',
        '--outputFile=.reports/u2/selected/project-runtime-security.json',
      ],
      '.reports/u2/selected/project-runtime-security.json',
      600000,
    ],
    [
      'runtime-security',
      ['node', '--import', 'tsx', 'scripts/u3/pilot-tools.ts', 'runtime-security'],
      '.reports/u2/runtime-security.json',
      1800000,
    ],
  ] as const)
    commands.push({
      key,
      scope: 'project',
      environment: { ...common, OMS_U2_DATABASE_PROFILE: 'verification-isolated' },
      command: [...command],
      path,
      timeoutMilliseconds,
    });
  return commands;
}
