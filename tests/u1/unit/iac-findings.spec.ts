import { describe, expect, it } from 'vitest';
import { classifyInfrastructureFinding as classify } from '../../../scripts/u1/iac-findings.js';
const task = () => ({
  Type: 'AWS::ECS::TaskDefinition',
  Properties: { Volumes: [{ Name: 'RuntimeTmp' }] },
});
const taskResources = () => ({ a: task(), b: task(), c: task(), d: task() });
const sg = (
  egress: Record<string, unknown>[] = [
    { CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 443, ToPort: 443 },
  ],
  inbound: Record<string, unknown>[] = [],
) => ({
  ApiTaskSgOne: {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: { SecurityGroupEgress: egress, SecurityGroupIngress: inbound },
  },
});
describe('raw IaC finding의 실제 구성·승인 목적에 한정된 대조', () => {
  it('EFS 없는4개 이름만 가진 임시volume을 EFS 암호화 누락과 구분한다', () =>
    expect(
      classify(
        {
          ID: 'AWS-0035',
          Severity: 'HIGH',
          CauseMetadata: { Resource: 'Oms.template.json:1-100' },
        },
        taskResources(),
      ).classification,
    ).toBe('FALSE_POSITIVE'));
  it('실제 EFSVolumeConfiguration이 추가되면 high를 가리지 않는다', () => {
    const resources = taskResources();
    Object.assign(resources.a.Properties.Volumes[0]!, {
      EFSVolumeConfiguration: { FileSystemId: 'one' },
    });
    expect(
      classify(
        {
          ID: 'AWS-0035',
          Severity: 'HIGH',
          CauseMetadata: { Resource: 'Oms.template.json:1-100' },
        },
        resources,
      ).classification,
    ).toBe('ACTIONABLE');
  });
  it('승인된443 송신도 실제 운영 활성화 허용으로 만들지 않는다', () =>
    expect(
      classify(
        { ID: 'AWS-0104', Severity: 'CRITICAL', CauseMetadata: { Resource: 'ApiTaskSgOne' } },
        sg(),
      ).classification,
    ).toBe('APPROVED_EXPOSURE_ACTIVATION_BLOCKED'));
  it('전체포트·다른포트·IPv6 전체출구는443 예외에 넣지 않는다', () => {
    for (const row of [
      { CidrIp: '0.0.0.0/0', IpProtocol: '-1' },
      { CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 80, ToPort: 80 },
      { CidrIpv6: '::/0', IpProtocol: '-1' },
    ])
      expect(
        classify(
          { ID: 'AWS-0104', Severity: 'CRITICAL', CauseMetadata: { Resource: 'ApiTaskSgOne' } },
          sg([row]),
        ).classification,
      ).toBe('ACTIONABLE');
  });
  it('task 직접public ingress가 있으면443송신 목적 판정도 차단한다', () =>
    expect(
      classify(
        { ID: 'AWS-0104', Severity: 'CRITICAL', CauseMetadata: { Resource: 'ApiTaskSgOne' } },
        sg(undefined, [{ CidrIp: '0.0.0.0/0' }]),
      ).classification,
    ).toBe('ACTIONABLE'));
  it('직원/내부 edge의 public exposure는 고객 목적과 구분한다', () =>
    expect(
      classify(
        { ID: 'AWS-0053', Severity: 'HIGH', CauseMetadata: { Resource: 'PrivateNlb' } },
        {
          PrivateNlb: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: { Scheme: 'internet-facing' },
          },
        },
      ).classification,
    ).toBe('ACTIONABLE'));
  it('고객 목적에서도 실제두edge/등록TCP포트가 없으면 raw high를 유지한다', () =>
    expect(
      classify(
        { ID: 'AWS-0053', Severity: 'HIGH', CauseMetadata: { Resource: 'CustomerNlbOne' } },
        {
          CustomerNlbOne: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: { Scheme: 'internet-facing' },
          },
        },
      ).classification,
    ).toBe('ACTIONABLE'));
  it('미등록 check/없는 실제resource는 언제나 해결할 발견으로 남는다', () =>
    expect(classify({ ID: 'NEW-CHECK', Severity: 'CRITICAL' }, {}).classification).toBe(
      'ACTIONABLE',
    ));
});
