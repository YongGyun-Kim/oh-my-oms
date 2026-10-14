import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { it, expect } from 'vitest';
import { OmsFoundationStack, syntheticU2InfrastructureProfile, runtimePoolBudget } from '@oms/cdk';
import { createDataSource } from '@oms/persistence';
import { u2RuntimeConfiguration } from '@oms/integrations';
function template() {
  return Template.fromStack(
    new OmsFoundationStack(new App(), 'U2Fixture', syntheticU2InfrastructureProfile),
  ).toJSON().Resources as Record<string, { Type: string; Properties: Record<string, unknown> }>;
}
it('4개 shared host의 실제 CDK desired/scaling/rolling은 API/worker 각2개와 전체32+32를 보존한다', () => {
  const r = template(),
    services = Object.values(r).filter((x) => x.Type === 'AWS::ECS::Service'),
    scaling = Object.values(r).filter(
      (x) => x.Type === 'AWS::ApplicationAutoScaling::ScalableTarget',
    );
  expect(services).toHaveLength(4);
  expect(scaling).toHaveLength(4);
  for (const s of services)
    expect(s.Properties).toMatchObject({
      DesiredCount: 1,
      DeploymentConfiguration: { MinimumHealthyPercent: 100, MaximumPercent: 200 },
    });
  for (const s of scaling) expect(s.Properties).toMatchObject({ MinCapacity: 1, MaxCapacity: 1 });
  const cap = (
    role:
      'api-primary' | 'worker-primary' | 'administrative' | 'api-protection' | 'worker-protection',
    material?: 'append' | 'vault',
  ) => {
    const source = createDataSource({
      url: 'postgresql://synthetic:synthetic@127.0.0.1:15432/oms_u2_verification',
      applicationName: 'u2-unit-no-connect',
      localSynthetic: true,
      role,
      protectionMaterial: material,
    });
    return (source.options.extra as { max: number }).max;
  };
  const apiPrimary = cap('api-primary'),
    workerPrimary = cap('worker-primary'),
    apiAppend = cap('api-protection', 'append'),
    apiVault = cap('api-protection', 'vault'),
    workerAppend = cap('worker-protection', 'append'),
    workerVault = cap('worker-protection', 'vault'),
    admin = cap('administrative'),
    b = runtimePoolBudget();
  expect(b.normal).toEqual({
    primary: apiPrimary + workerPrimary + admin,
    journal: apiAppend + apiVault + workerAppend + workerVault + admin,
  });
  expect(b.rolling).toEqual({
    primary: 2 * (apiPrimary + workerPrimary) + admin,
    journal: 2 * (apiAppend + apiVault + workerAppend + workerVault) + admin,
  });
  expect(b.rolling).toEqual({ primary: 32, journal: 18 });
  // Snapshot and control reserve TWO connections in one administrative pool;
  // a second administrative pool would violate the primary worst-case cap.
  expect(b.administrativeRoles).toEqual(['snapshot', 'control']);
  expect(admin).toBe(2);
  expect(() => runtimePoolBudget(2, 200)).toThrow();
});
it('Standard4 consumer queues와 각 DLQ·기한/암호화가 있고 worker만exact queue·Cognito admin 권위를 갖는다', () => {
  const r = template(),
    queues = Object.values(r).filter((x) => x.Type === 'AWS::SQS::Queue');
  expect(queues).toHaveLength(8);
  for (const queue of queues) expect(queue.Properties.KmsMasterKeyId).toBeTruthy();
  const tasks = Object.entries(r).filter(([, x]) => x.Type === 'AWS::ECS::TaskDefinition');
  expect(tasks).toHaveLength(4);
  for (const [, task] of tasks) {
    const container = (
        task.Properties.ContainerDefinitions as {
          Name: string;
          Environment: { Name: string; Value: string }[];
          Secrets: { Name: string; ValueFrom: unknown }[];
        }[]
      )[0]!,
      env = Object.fromEntries(container.Environment.map((x) => [x.Name, x.Value]));
    expect(env.OMS_READINESS).toBe('REAL_ACTIVATION_UNVERIFIED');
    if (container.Name === 'worker') {
      expect(env.OMS_U2_RUNTIME_PROFILE).toBe('UNREGISTERED');
      for (const variable of [
        'OMS_NOTICE_QUEUE_URL',
        'OMS_IDENTITY_QUEUE_URL',
        'OMS_HANDOFF_QUEUE_URL',
        'OMS_INVITATION_QUEUE_URL',
      ])
        expect(env[variable]).toBeTruthy();
      for (const variable of [
        'OMS_U2_VAULT_KEY',
        'OMS_U2_PURPOSE_VERIFIER_KEY',
        'OMS_CUSTOMER_CLIENT_SECRET',
        'OMS_STAFF_CLIENT_SECRET',
        'OMS_U2_VAULT_DATABASE_URL',
      ])
        expect(container.Secrets.some((x) => x.Name === variable)).toBe(true);
    }
    if (container.Name === 'api')
      expect(container.Secrets.find((x) => x.Name === 'OMS_U2_VAULT_DATABASE_URL')).toBeTruthy();
  }
  const policies = Object.entries(r).filter(([, x]) => x.Type === 'AWS::IAM::Policy');
  const apiPolicies = policies.filter(([id]) => id.startsWith('api'));
  expect(apiPolicies.length).toBeGreaterThan(0);
  for (const [, policy] of apiPolicies)
    for (const action of [
      'AdminDeleteSoftwareToken',
      'AdminUserGlobalSignOut',
      'AdminSetUserPassword',
    ])
      expect(JSON.stringify(policy.Properties.PolicyDocument)).not.toContain(action);
  for (const [id, policy] of policies) {
    const statements = (
      policy.Properties.PolicyDocument as {
        Statement: { Action: string | string[]; Resource: unknown }[];
      }
    ).Statement;
    for (const statement of statements) {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      if (
        actions.some((x) =>
          [
            'cognito-idp:AdminSetUserPassword',
            'cognito-idp:AdminDeleteSoftwareToken',
            'cognito-idp:AdminUserGlobalSignOut',
          ].includes(x),
        )
      ) {
        expect(id.toLowerCase()).toContain('worker');
        expect(statement.Resource).not.toBe('*');
      }
    }
  }
});
it('U2 config profile은 실제 계정·운영 준비로 승격하지 않는다', () => {
  expect(
    () =>
      new OmsFoundationStack(new App(), 'Bad', {
        ...syntheticU2InfrastructureProfile,
        account: '123456789012',
      } as unknown as typeof syntheticU2InfrastructureProfile),
  ).toThrow();
  const pools = Object.values(template()).filter((x) => x.Type === 'AWS::Cognito::UserPool');
  expect(pools).toHaveLength(2);
  for (const pool of pools)
    expect(pool.Properties).toMatchObject({
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
});
it('U2 host는 명시 미등록 profile과 별도 purpose/vault/key versions만 해석하고 legacy 또는잘못된값을 권위로 만들지 않는다', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    OMS_U2_RUNTIME_PROFILE: 'UNREGISTERED',
    OMS_U2_PURPOSE_VERIFIER_KEY: Buffer.alloc(32, 21).toString('hex'),
    OMS_U2_PURPOSE_VERIFIER_KEY_VERSION: 'synthetic-verifier-1',
    OMS_U2_VAULT_KEY: Buffer.alloc(32, 22).toString('hex'),
    OMS_U2_VAULT_KEY_VERSION: 'synthetic-vault-1',
    OMS_U2_VAULT_DATABASE_URL: 'postgresql://synthetic:synthetic@journal.example.invalid/oms',
  };
  expect(u2RuntimeConfiguration({ NODE_ENV: 'production' })).toBeNull();
  expect(u2RuntimeConfiguration(env)?.registration).toBe('UNREGISTERED');
  for (const change of [
    { OMS_U2_RUNTIME_PROFILE: 'READY' },
    { OMS_U2_PURPOSE_VERIFIER_KEY: 'short' },
    { OMS_U2_VAULT_KEY: env.OMS_U2_PURPOSE_VERIFIER_KEY },
    { OMS_U2_VAULT_KEY_VERSION: '' },
    { OMS_U2_VAULT_DATABASE_URL: undefined },
  ])
    expect(() => u2RuntimeConfiguration({ ...env, ...change })).toThrow();
  expect(() => u2RuntimeConfiguration(env, [Buffer.alloc(32, 21)])).toThrow();
});
