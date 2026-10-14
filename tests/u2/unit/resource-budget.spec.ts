import { describe, it, expect, vi } from 'vitest';
import { ExecutionBudget } from '@oms/contracts';
import { U2WorkQueue } from '../../../apps/api/src/u2-authentication.js';
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: ((
      path: import('node:fs').PathOrFileDescriptor,
      options?: Parameters<typeof actual.readFileSync>[1],
    ) =>
      path === 'synthetic-ca.pem'
        ? 'synthetic-ca'
        : actual.readFileSync(path, options)) as typeof actual.readFileSync,
  };
});
describe('replica 목적 실행/crypto 유한 대기', () => {
  const hold = () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { gate, release };
  };
  it('잘못된 실행/대기/250ms 상한을 설정으로 완화할 수 없다', () => {
    for (const config of [
      [0, 16, 250],
      [33, 16, 250],
      [4, 33, 250],
      [4, 16, 251],
      [4, -1, 250],
    ])
      expect(() => new U2WorkQueue(...(config as [number, number, number]))).toThrow();
  });
  it('4개만 시작하고 다음16개는 대기하며17번째 대기는503이다', async () => {
    const queue = new U2WorkQueue(4, 16),
      budget = new ExecutionBudget(1000),
      g = hold();
    let entered = 0;
    const operation = async () => {
      entered++;
      await g.gate;
    };
    const active = Array.from({ length: 4 }, () => queue.run(budget, operation)),
      waiting = Array.from({ length: 16 }, () => queue.run(budget, operation));
    expect(entered).toBe(4);
    await expect(queue.run(budget, operation)).rejects.toMatchObject({ code: 'U2_QUEUE_FULL' });
    g.release();
    await Promise.all([...active, ...waiting]);
    expect(entered).toBe(20);
  });
  it('대기는250ms에 실패하고 owner/업무 effect를 실행하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const queue = new U2WorkQueue(1, 1),
        g = hold(),
        active = queue.run(new ExecutionBudget(1000), () => g.gate),
        owner = vi.fn(async () => {}),
        waiting = queue.run(new ExecutionBudget(1000), owner),
        check = expect(waiting).rejects.toMatchObject({ code: 'U2_QUEUE_WAIT' });
      await vi.advanceTimersByTimeAsync(250);
      await check;
      expect(owner).not.toHaveBeenCalled();
      g.release();
      await active;
      await queue.run(new ExecutionBudget(1000), owner);
      expect(owner).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it('대기 중 이탈은 슬롯을 제거하고 뒤의 원래 요청에 넘긴다', async () => {
    const queue = new U2WorkQueue(1, 2),
      g = hold(),
      active = queue.run(new ExecutionBudget(1000), () => g.gate),
      controller = new AbortController(),
      owner = vi.fn(async () => {}),
      waiting = queue.run(new ExecutionBudget(1000, () => Date.now(), controller.signal), owner),
      check = expect(waiting).rejects.toMatchObject({ code: 'U2_QUEUE_ABORTED' });
    controller.abort();
    await check;
    const next = queue.run(new ExecutionBudget(1000), owner);
    g.release();
    await Promise.all([active, next]);
    expect(owner).toHaveBeenCalledOnce();
  });
  it('owner 오류도 원래 slot을 해제하며 오류를 성공으로 바꾸지 않는다', async () => {
    const queue = new U2WorkQueue(1, 1);
    await expect(
      queue.run(new ExecutionBudget(1000), async () => {
        throw new Error('합성 owner 실패');
      }),
    ).rejects.toThrow('합성 owner 실패');
    await expect(queue.run(new ExecutionBudget(1000), async () => 7)).resolves.toBe(7);
  });
});
import { u2WorkerConfiguration as workerConfiguration } from '@oms/integrations';
import { createDataSource } from '@oms/persistence';
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  OMS_PRIMARY_DATABASE_URL: 'postgres://worker@primary.invalid/verification',
  OMS_JOURNAL_DATABASE_URL: 'postgres://append@journal.invalid/verification',
  OMS_DATABASE_CA_FILE: 'synthetic-ca.pem',
  OMS_NOTICE_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/notice',
  OMS_IDENTITY_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/identity',
  OMS_HANDOFF_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/handoff',
  OMS_INVITATION_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/invitation',
  OMS_TELEMETRY_COLLECTOR_ORIGIN: 'https://collector.example.invalid',
  OMS_U2_VAULT_DATABASE_URL: 'postgres://vault@journal.invalid/verification',
  OMS_U2_PURPOSE_VERIFIER_KEY: 'a'.repeat(64),
  OMS_U2_VAULT_KEY: 'b'.repeat(64),
  OMS_U2_PURPOSE_VERIFIER_KEY_VERSION: 'synthetic-purpose-1',
  OMS_U2_VAULT_KEY_VERSION: 'synthetic-vault-1',
  OMS_CUSTOMER_POOL_ID: 'ap-northeast-2_syntheticCustomer',
  OMS_CUSTOMER_CLIENT_ID: 'syntheticCustomer',
  OMS_STAFF_POOL_ID: 'ap-northeast-2_syntheticStaff',
  OMS_STAFF_CLIENT_ID: 'syntheticStaff',
};
describe('worker4소비자 구성·분리 키/역할 자원 상한', () => {
  it('정확한 legacy notice 구성만 fallback하고 partial/unknown U2는 거절한다', () => {
    expect(
      workerHostU2Requested({
        NODE_ENV: 'production',
        OMS_NOTICE_QUEUE_URL: environment.OMS_NOTICE_QUEUE_URL,
      }),
    ).toBe(false);
    expect(workerHostU2Requested({ ...environment, OMS_U2_RUNTIME_PROFILE: 'UNREGISTERED' })).toBe(
      true,
    );
    expect(() => workerHostU2Requested(environment)).toThrow(
      expect.objectContaining({ code: 'U2_WORKER_PARTIAL_CONFIGURATION' }),
    );
    for (const profile of ['', 'READY', 'LOCAL_SYNTHETIC'])
      expect(() =>
        workerHostU2Requested({ ...environment, OMS_U2_RUNTIME_PROFILE: profile }),
      ).toThrow();
    for (const name of [
      'OMS_U2_VAULT_DATABASE_URL',
      'OMS_IDENTITY_QUEUE_URL',
      'OMS_U2_PURPOSE_VERIFIER_KEY',
    ])
      expect(() => workerHostU2Requested({ NODE_ENV: 'production', [name]: 'partial' })).toThrow();
    expect(() =>
      workerConfiguration({ NODE_ENV: 'production', OMS_U2_RUNTIME_PROFILE: 'UNREGISTERED' }),
    ).toThrow();
  });
  it('정확4큐와 별도 vault/key/version만 파싱하며 실제 준비/활성 근거를 만들지 않는다', () => {
    const c = workerConfiguration(environment);
    expect(Object.keys(c.queueUrls)).toEqual([
      'u1-in-app-notice',
      'u2-identity',
      'u2-handoff-delivery',
      'u2-invitation-delivery',
    ]);
    expect(c.vaultUrl).toBe(environment.OMS_U2_VAULT_DATABASE_URL);
    expect(c.purposeVerifierKey.equals(c.vaultKey)).toBe(false);
    expect(c.cognito.region).toBe('ap-northeast-2');
  });
  it('누락된 목적 key/version/queue를 임의 기본값으로 채우지 않는다', () => {
    for (const name of [
      'OMS_U2_VAULT_DATABASE_URL',
      'OMS_U2_VAULT_KEY',
      'OMS_U2_VAULT_KEY_VERSION',
      'OMS_U2_PURPOSE_VERIFIER_KEY',
      'OMS_U2_PURPOSE_VERIFIER_KEY_VERSION',
      'OMS_IDENTITY_QUEUE_URL',
      'OMS_HANDOFF_QUEUE_URL',
      'OMS_INVITATION_QUEUE_URL',
    ])
      expect(() => workerConfiguration({ ...environment, [name]: undefined })).toThrow();
  });
  it('같은 암호/검증 키와 synthetic 운영 활성화는 거절한다', () => {
    expect(() =>
      workerConfiguration({
        ...environment,
        OMS_U2_VAULT_KEY: environment.OMS_U2_PURPOSE_VERIFIER_KEY,
      }),
    ).toThrow();
    expect(() => workerConfiguration({ ...environment, OMS_LOCAL_SYNTHETIC: '1' })).toThrow();
    expect(() =>
      workerConfiguration({ ...environment, OMS_U2_VAULT_KEY_VERSION: 'invalid version' }),
    ).toThrow();
  });
  it('worker primary5·journal append2+vault1은 원래 worker3상한 안이며 timeout도 고정이다', () => {
    const connection = {
      url: 'postgres://synthetic@journal.invalid/verification',
      ca: 'synthetic-ca',
      applicationName: 'synthetic-u2-config',
    };
    const primary = createDataSource({ ...connection, role: 'worker-primary' }),
      append = createDataSource({
        ...connection,
        role: 'worker-protection',
        protectionMaterial: 'append',
      }),
      vault = createDataSource({
        ...connection,
        role: 'worker-protection',
        protectionMaterial: 'vault',
      });
    expect(primary.options.extra.max).toBe(5);
    expect(append.options.extra.max + vault.options.extra.max).toBe(3);
    for (const source of [primary, append, vault])
      expect(source.options.extra).toMatchObject({
        connectionTimeoutMillis: 500,
        statement_timeout: 2000,
        lock_timeout: 500,
        options: '-c transaction_timeout=3000',
      });
  });
});
import { workerHostU2Requested } from '../../../apps/worker/src/main.js';
