import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCdkBundle } from '../u1/cdk-bundle.js';
import { runCommand } from '../u1/process.js';
import { classifyInfrastructureFinding } from '../u1/iac-findings.js';
import type { Finding } from '../u1/iac-findings.js';
import { evaluateSecurityExceptions, evaluateSecretExposures } from '../u1/security-policy.js';
import { runtimeSourceIdentity, sha256 } from './runtime-source.js';
interface Report {
  Results?: {
    Secrets?: unknown[];
    Vulnerabilities?: { Severity: string }[];
    Misconfigurations?: Finding[];
  }[];
}
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
function scanned(path: string): Report {
  const value = json<Report>(path);
  if (!value || !Array.isArray(value.Results))
    throw new Error('완전한 scanner 결과 배열이 필요합니다.');
  return value;
}
const trivy = '.runtime/u1/tools/trivy';
const semgrep = '.runtime/u1/semgrep-venv/bin/semgrep';
export async function securityU2(): Promise<void> {
  mkdirSync('.reports/u2', { recursive: true });
  verifyCdkBundle(process.cwd());
  const exceptions = evaluateSecurityExceptions(
    json('docs/u2/security-exceptions.json'),
    new Date(),
  );
  const exposures = evaluateSecretExposures(json('docs/u2/secret-exposures.json'));
  writeFileSync(
    '.reports/u2/security-policy.json',
    JSON.stringify(
      { exceptions, exposures, observedExposureInThisRun: null, realActivationAllowed: false },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (exceptions.hasUnresolvedRisk || exposures.some((value) => value.state === 'OBSERVED_OPEN'))
    throw new Error('보안 예외/노출 대응의 미해결 근거가 있으며 검사 통과로 대체할 수 없습니다.');
  for (const [name, expected] of [
    ['typescript', '63fbcca1826e787ca43282bf139ccec16745ad6551c87850b9ccee9ca9f98c0b'],
    ['nodejs', 'eed00ab904b1c439c4c4d6064fd61a50407f042c288a92c9cbd347ddf2fea78f'],
  ])
    if (
      createHash('sha256')
        .update(readFileSync('scripts/u1/security-rules/' + name + '.yaml'))
        .digest('hex') !== expected
    )
      throw new Error('고정된 공식 SAST 규칙 원문이 다릅니다.');
  const completed: string[] = [];
  let passed = false;
  let scannedImageId: string | null = null;
  try {
    await runCommand('npm', ['audit', '--json'], '.reports/u2/dependency-audit.json');
    const audit = json<{ metadata: { vulnerabilities: Record<string, number> } }>(
      '.reports/u2/dependency-audit.json',
    );
    if (Object.values(audit.metadata.vulnerabilities).some((count) => count !== 0))
      throw new Error('의존성 취약점이 있습니다.');
    completed.push('dependencies-physical-bundle-and-audit');
    await runCommand(
      semgrep,
      [
        'scan',
        '--config',
        'scripts/u1/security-rules/typescript.yaml',
        '--config',
        'scripts/u1/security-rules/nodejs.yaml',
        '--metrics',
        'off',
        '--disable-version-check',
        '--json',
        '--output',
        '.reports/u2/sast.json',
        'apps',
        'packages',
        'infra/cdk',
        'scripts/u1',
        'scripts/u2',
      ],
      '.reports/u2/sast.log',
    );
    const sast = json<{ results: unknown[]; errors: unknown[] }>('.reports/u2/sast.json');
    if (sast.results.length || sast.errors.length)
      throw new Error('SAST 발견/검사 오류가 있습니다.');
    completed.push('sast');
    await runCommand(
      trivy,
      [
        'fs',
        '--scanners',
        'secret',
        '--skip-dirs',
        'node_modules,.runtime,.reports,aidlc,.codex,.agents,.git',
        '--format',
        'json',
        '--output',
        '.reports/u2/secrets.json',
        '.',
      ],
      '.reports/u2/secrets.log',
    );
    const observedExposureInThisRun = Boolean(
      scanned('.reports/u2/secrets.json').Results?.some((row) => row.Secrets?.length),
    );
    writeFileSync(
      '.reports/u2/security-policy.json',
      JSON.stringify(
        { exceptions, exposures, observedExposureInThisRun, realActivationAllowed: false },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (observedExposureInThisRun) throw new Error('source 비밀 유입이 있습니다.');
    completed.push('secrets');
    const synth = json<{ passed: boolean; sourceDigest: string; templateSha256: string }>(
      '.reports/u2/synth.json',
    );
    if (
      !synth.passed ||
      synth.sourceDigest !== runtimeSourceIdentity().digest ||
      synth.templateSha256 !==
        sha256(readFileSync('.reports/u2/cdk.out/OmsU2Synthetic.template.json'))
    )
      throw new Error('같은 현재source의 원래 offline synth/template 원문이 필요합니다.');
    await runCommand(
      trivy,
      [
        'config',
        '--format',
        'json',
        '--output',
        '.reports/u2/iac-security.json',
        '.reports/u2/cdk.out',
      ],
      '.reports/u2/iac-security.log',
    );
    const template = json<{ Resources: Parameters<typeof classifyInfrastructureFinding>[1] }>(
      '.reports/u2/cdk.out/OmsU2Synthetic.template.json',
    );
    const findings =
      scanned('.reports/u2/iac-security.json')
        .Results?.flatMap((row) => row.Misconfigurations ?? [])
        .filter((row) => row.Status === 'FAIL') ?? [];
    const evaluated = findings.map((finding) => ({
      finding,
      ...classifyInfrastructureFinding(finding, template.Resources),
    }));
    writeFileSync(
      '.reports/u2/iac-adjudication.json',
      JSON.stringify(
        {
          evaluated,
          realActivationAllowed: false,
          policySource: 'NI-01·승인 task HTTPS443 egress 후보; 실제 준비는 미확인',
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (
      evaluated.some(
        (row) =>
          ['HIGH', 'CRITICAL'].includes(row.finding.Severity) &&
          row.classification === 'ACTIONABLE',
      )
    )
      throw new Error('미해결 인프라 high/critical이 있습니다.');
    completed.push('iac-context-verified-no-real-activation');
    await runCommand(
      'docker',
      ['image', 'inspect', 'oms-u2-local:verification', '--format', '{{.Id}}'],
      '.reports/u2/scanned-image-id.txt',
    );
    const imageId = readFileSync('.reports/u2/scanned-image-id.txt', 'utf8').trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId))
      throw new Error('실제 고정 scanner image ID가 필요합니다.');
    scannedImageId = imageId;
    await runCommand(
      trivy,
      [
        'image',
        '--scanners',
        'vuln',
        '--format',
        'json',
        '--output',
        '.reports/u2/container-security.json',
        imageId,
      ],
      '.reports/u2/container-security.log',
    );
    const container = scanned('.reports/u2/container-security.json');
    if (
      container.Results?.some((row) =>
        row.Vulnerabilities?.some((issue) => ['HIGH', 'CRITICAL'].includes(issue.Severity)),
      )
    )
      throw new Error('container OS/라이브러리 high/critical이 있습니다.');
    completed.push('container-os-and-library');
    passed = true;
  } finally {
    writeFileSync(
      '.reports/u2/security.json',
      JSON.stringify(
        {
          completed,
          passed,
          imageId: scannedImageId,
          realActivationAllowed: false,
          observedAt: new Date().toISOString(),
          limitations: [
            '실제 회사망/Cognito/수신자/자료/운영 증거를 대신하지 않습니다.',
            'IaC raw 경고와 조건부 대조, container medium/low는 별도 원문을 보존합니다.',
            '격리 runtime 공격/HTTP/UI 경계 회귀는 전체 integration/E2E 보고서와 함께 확인해야 합니다.',
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await securityU2();
