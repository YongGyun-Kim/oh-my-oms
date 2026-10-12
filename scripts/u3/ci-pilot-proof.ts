import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, requireCondition } from '@oms/contracts';
import {
  collectCommandProof,
  preserveOutput,
  runProofCommand,
  securityOutputPaths,
} from '../u2/ci-full-proof.js';
import type { ProofPorts, ProofRunner } from '../u2/ci-full-proof.js';
import type { SourceIdentity } from '../u2/runtime-source.js';
import { pilotSourceIdentity } from './runtime-source.js';
import type { PilotUnit } from './runtime-source.js';
import { pilotCommands, PILOT_DEFERRED } from './pilot-commands.js';
import type { PilotCommand } from './pilot-commands.js';
import {
  mergePilotProofs,
  validatePilotProof,
  validatePilotReceipt,
  validatePilotCommandReport,
} from './pilot-validation.js';
import type { PilotProof, PilotReceipt } from './pilot-validation.js';
import { pilotCoveragePath } from './coverage-evidence.js';

export interface PilotPorts extends ProofPorts {
  archive(path: string): void;
  write(path: string, bytes: Buffer): void;
}
const actualPorts: PilotPorts = {
  identity: pilotSourceIdentity,
  exists: existsSync,
  read: readFileSync,
  mtime: (path) => statSync(path).mtimeMs,
  archive: preserveOutput,
  write: (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytes, { mode: 0o600 });
  },
};
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2));
export async function collectPilotCommand(
  spec: PilotCommand,
  source: SourceIdentity,
  run: ProofRunner = runProofCommand,
  ports: PilotPorts = actualPorts,
): Promise<PilotReceipt> {
  ports.archive(spec.path);
  ports.archive('.reports/u2/project-' + spec.key + '.log');
  if (spec.key.endsWith('-coverage') && spec.scope !== 'project')
    for (const suffix of [
      'coverage-final.json',
      'coverage-summary.json',
      'lcov.info',
      'evidence.json',
    ])
      ports.archive(pilotCoveragePath(spec.scope) + '/' + suffix);
  if (spec.key === 'security') for (const path of securityOutputPaths()) ports.archive(path);
  const previous = Object.fromEntries(
    Object.keys(spec.environment).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, spec.environment);
    const result = await collectCommandProof(
      spec,
      source,
      async (...args) => {
        const outcome = await run(...args);
        requireCondition(
          outcome !== undefined,
          503,
          'PILOT_CHILD_UNOBSERVED',
          'void child 결과는 실행 성공이 아닙니다.',
        );
        return outcome;
      },
      ports,
    );
    const receipt: PilotReceipt = {
      ...result,
      mode: 'pilot-current',
      source,
      environment: spec.environment,
    };
    if (receipt.passed) {
      try {
        validatePilotCommandReport(
          spec,
          validatePilotReceipt(receipt, spec, source, ports.read),
          source,
        );
      } catch {
        receipt.passed = false;
      }
    }
    return receipt;
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
}
export async function collectPilotProof(
  scope: PilotUnit | 'project' | 'all',
  run: ProofRunner = runProofCommand,
  ports: PilotPorts = actualPorts,
) {
  requireCondition(
    ['u1', 'u2', 'u3', 'project', 'all'].includes(scope) &&
      process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only',
    503,
    'PILOT_PROOF_ADMISSION',
    '명시 pilot 격리 합성 수집만 허용합니다.',
  );
  const source = ports.identity(),
    file = '.reports/u3/pilot/validation-' + scope + '.json',
    specs = pilotCommands(source).filter((spec) => scope === 'all' || spec.scope === scope);
  let proof: PilotProof = {
      version: 2,
      mode: 'pilot-current',
      source,
      reports: {},
      deferred: [...PILOT_DEFERRED],
    },
    passed = false;
  if (ports.exists(file)) {
    const prior = JSON.parse(ports.read(file).toString()) as PilotProof;
    if (
      prior.version === 2 &&
      prior.mode === 'pilot-current' &&
      canonicalJson(prior.source) === canonicalJson(source)
    )
      proof = mergePilotProofs([prior], source);
    else {
      ports.archive(file);
      for (const receipt of Object.values(prior.reports ?? {})) ports.archive(receipt.path);
    }
  }
  try {
    if (scope === 'project')
      proof = mergePilotProofs(
        [
          proof,
          ...(['u1', 'u2', 'u3'] as const).map(
            (unit) =>
              JSON.parse(
                ports.read('.reports/u3/pilot/validation-' + unit + '.json').toString(),
              ) as PilotProof,
          ),
        ],
        source,
      );
    for (const spec of specs) {
      const prior = proof.reports[spec.key];
      if (prior)
        validatePilotCommandReport(
          spec,
          validatePilotReceipt(prior, spec, source, ports.read),
          source,
        );
      else {
        try {
          proof.reports[spec.key] = await collectPilotCommand(spec, source, run, ports);
          requireCondition(
            proof.reports[spec.key]!.passed === true,
            503,
            'PILOT_CHILD_FAILED',
            '실패/취소/누락 증거를 보존하고 다음 검사를 차단합니다: ' + spec.key,
          );
        } finally {
          ports.write(file, jsonBytes(proof));
        }
      }
    }
    if (scope === 'project' || scope === 'all') {
      const result = validatePilotProof(proof, source, ports.read);
      ports.write('.reports/u3/pilot/release-validation.json', jsonBytes(result));
    }
    requireCondition(
      canonicalJson(ports.identity()) === canonicalJson(source),
      503,
      'PILOT_FINAL_SOURCE',
      '수집 종료의 전체 source가 달라졌습니다.',
    );
    passed = true;
    return proof;
  } finally {
    ports.write(file, jsonBytes(proof));
    ports.write(
      '.reports/u3/pilot/' + scope + '-job-summary.json',
      jsonBytes({
        passed,
        mode: 'pilot-current',
        sourceDigest: source.digest,
        scope,
        completed: Object.entries(proof.reports)
          .filter(([, receipt]) => receipt.passed)
          .map(([key]) => key),
        deferred: [...PILOT_DEFERRED],
        realActivationAllowed: false,
        observedAt: new Date().toISOString(),
      }),
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scope = process.argv[2] ?? 'all';
  requireCondition(
    ['u1', 'u2', 'u3', 'project', 'all'].includes(scope),
    503,
    'PILOT_PROOF_SCOPE',
    '명시 수집 역할만 실행합니다.',
  );
  await collectPilotProof(scope as PilotUnit | 'project' | 'all');
}
