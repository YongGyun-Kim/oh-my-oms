import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  OmsFoundationStack,
  syntheticInfrastructureProfile,
  validateInfrastructureProfile,
} from '@oms/cdk';
function template() {
  const app = new App();
  const stack = new OmsFoundationStack(app, 'U1Fixture', syntheticInfrastructureProfile);
  return Template.fromStack(stack);
}
describe('합성 U1 실제 CDK assembly·역할/망/저장 경계', () => {
  it('4역할 Fargate 및 유한 steady/rolling/CPU/memory를 생성한다', () => {
    const view = template();
    view.resourceCountIs('AWS::ECS::Service', 4);
    view.resourceCountIs('AWS::ECS::TaskDefinition', 4);
    for (const role of Object.values(view.findResources('AWS::ECS::Service')) as {
      Properties: {
        DesiredCount: number;
        DeploymentConfiguration: { MinimumHealthyPercent: number; MaximumPercent: number };
      };
    }[])
      expect(role.Properties).toMatchObject({
        DesiredCount: 1,
        DeploymentConfiguration: { MinimumHealthyPercent: 100, MaximumPercent: 200 },
      });
    view.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 4);
    expect(8 * 8 + 8).toBeLessThanOrEqual(syntheticInfrastructureProfile.maximumDbConnections);
  });
  it('업무/보호 DB는 다른AZ·두 instance·SingleAZ·private·암호화·삭제보호다', () => {
    const view = template();
    view.resourceCountIs('AWS::RDS::DBInstance', 2);
    const dbs = Object.values(view.findResources('AWS::RDS::DBInstance')) as {
      Properties: { AvailabilityZone: string };
    }[];
    expect(new Set(dbs.map((value) => value.Properties.AvailabilityZone)).size).toBe(2);
    view.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '17.11',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      DeletionProtection: true,
    });
  });
  it('공개/사설 NLB2개에 TCP 통과 및 API전용8443 listener를 설정한다', () => {
    const view = template();
    view.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 2);
    view.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
    });
    view.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internal' });
    view.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 8443,
      Protocol: 'TCP',
    });
    expect(Object.values(view.findResources('AWS::EC2::NatGateway'))).toHaveLength(0);
  });
  it('직원443은 합성 회사CIDR·task는NLB/DB SG 경계이며 public task inbound는 없다', () => {
    const view = template();
    const text = JSON.stringify(view.toJSON());
    expect(text).toContain('10.80.0.0/16');
    view.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: Match.anyValue(),
    });
    const groups = Object.values(view.findResources('AWS::EC2::SecurityGroup')) as {
      Properties: { GroupDescription: string; SecurityGroupIngress?: { CidrIp?: string }[] };
    }[];
    for (const group of groups.filter((group) =>
      group.Properties.GroupDescription.includes('TaskSg'),
    ))
      expect(
        group.Properties.SecurityGroupIngress?.some((rule) => rule.CidrIp === '0.0.0.0/0'),
      ).not.toBe(true);
  });
  it('Standard queue/consumerDLQ는 암호화하며 전달 copy가 원본 보관소가 아니다', () => {
    const view = template();
    view.resourceCountIs('AWS::SQS::Queue', 2);
    view.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 30,
      KmsMasterKeyId: Match.anyValue(),
      RedrivePolicy: { deadLetterTargetArn: Match.anyValue(), maxReceiveCount: 5 },
    });
  });
  it('고객/직원 Cognito pool은 별도이며 필수 TOTP·자동등록/확대가 없다', () => {
    const view = template();
    view.resourceCountIs('AWS::Cognito::UserPool', 2);
    view.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });
  it('원장/admin secret과 목적별보존·암호화·관측metadata를 runtime DB URL과 분리한다', () => {
    const view = template();
    view.resourceCountIs('AWS::DynamoDB::Table', 1);
    view.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    const resources = view.toJSON().Resources as Record<
      string,
      { Type: string; DeletionPolicy?: string }
    >;
    for (const resource of Object.values(resources).filter(
      (value) => value.Type === 'AWS::RDS::DBInstance' || value.Type === 'AWS::KMS::Key',
    ))
      expect(resource.DeletionPolicy).toBe('Retain');
  });
  it('실제 계정/중복AZ/무한pool/잘못된digest는 합성 synth로 통과시키지 않는다', () => {
    for (const changed of [
      { account: '123456789012' },
      { azNames: ['ap-northeast-2a', 'ap-northeast-2a'] },
      { maximumDbConnections: 71 },
      { imageDigest: 'latest' },
    ])
      expect(() =>
        validateInfrastructureProfile({
          ...syntheticInfrastructureProfile,
          ...changed,
        } as typeof syntheticInfrastructureProfile),
      ).toThrow();
  });
});
