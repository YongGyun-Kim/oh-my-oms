import { App } from 'aws-cdk-lib';
import { OmsFoundationStack, syntheticU2InfrastructureProfile } from '@oms/cdk';
import { verifyCdkBundle } from '../u1/cdk-bundle.js';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { runtimeSourceIdentity, sha256 } from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export function synthU2(identity: () => SourceIdentity = runtimeSourceIdentity) {
  verifyCdkBundle(process.cwd());
  const app = new App({ outdir: '.reports/u2/cdk.out' });
  new OmsFoundationStack(app, 'OmsU2Synthetic', syntheticU2InfrastructureProfile);
  const assembly = app.synth();
  if (assembly.stacks.length !== 1) throw Error('단일 shared host 합성 synth만 허용합니다.');
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  writeFileSync(
    '.reports/u2/synth.json',
    JSON.stringify({
      passed: true,
      sourceDigest: identity().digest,
      templateSha256: sha256(readFileSync('.reports/u2/cdk.out/OmsU2Synthetic.template.json')),
      stacks: assembly.stacks.map((s) => s.stackName),
      actualAwsDeploymentPerformed: false,
      realActivationAllowed: false,
    }),
    { mode: 0o600 },
  );
  console.log('U2 offline synthetic synth 완료; 실제 계정/국내 경로/망/자격/배포 증거가 아닙니다.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) synthU2();
