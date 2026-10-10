import { App } from 'aws-cdk-lib';
import { OmsFoundationStack, syntheticInfrastructureProfile } from '@oms/cdk';
import { verifyCdkBundle } from './cdk-bundle.js';
verifyCdkBundle(process.cwd());
const app = new App({ outdir: '.reports/u1/cdk.out' });
new OmsFoundationStack(app, 'OmsU1Synthetic', syntheticInfrastructureProfile);
const assembly = app.synth();
if (assembly.stacks.length !== 1) throw new Error('U1 synth assembly를 확인하세요.');
console.log('U1 합성 CDK synth 완료. 실제 자원/망/비밀/배포 증거가 아닙니다.');
