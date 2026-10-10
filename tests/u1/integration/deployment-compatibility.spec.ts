import { journalEntries } from '../fixtures/journal-entries.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeploymentControl, validateRelease } from '@oms/integrations';
import type {
  DeploymentAttempt,
  DeploymentControlStore,
  DeploymentPlatform,
  ReleaseIdentity,
  RollbackEvidence,
} from '@oms/integrations';
import { ProtectedStore } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
const sources = localSources();
let store: ProtectedStore;
let requestId: string;
let epoch: string;
let passedCases = 0;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const account = () => ({
  accountId: 'original-person',
  loginIdentifier: 'original@example.invalid',
  displayName: '합성 원래 계정',
  contactAddress: 'original@example.invalid',
  active: true,
  identityBasis: [],
  revision: 1,
});
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  epoch = await store.currentEpoch();
  requestId = (
    await store.execute(
      {
        principalId: 'synthetic-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'synthetic-current-source',
        target: null,
        idempotencyKey: 'original-key',
        input: { accountId: 'original-person' },
        correlationId: 'correlation:원본',
        epoch,
      },
      (transaction) => transaction.put('Account', account()),
    )
  ).requestId;
});
afterAll(async () => {
  writeFileSync(
    '.reports/u1/deployment-compatibility.json',
    JSON.stringify(
      {
        passed: passedCases === 8,
        cases: passedCases,
        actualPgOriginalsChecked: true,
        actualAwsDeploymentPerformed: false,
        sourceScope:
          '현재 실제schema/registry/decoder와합성플랫폼제어;실제이전release/staging/승인은미확인',
        schemaDigest: sha('packages/contracts/schemas/c00-v2.json'),
        registryDigest: sha('packages/contracts/schemas/operations-v2.json'),
        recoveryDecoderDigest: sha('packages/persistence/src/recovery-types.ts'),
        observedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
class Store implements DeploymentControlStore {
  readonly kind = 'SYNTHETIC';
  value: DeploymentAttempt | null = null;
  async read() {
    return this.value ? { ...this.value } : null;
  }
  async compareAndSet(value: DeploymentAttempt, revision: number | null) {
    if ((this.value?.revision ?? null) !== revision) throw new Error('CAS conflict');
    this.value = { ...value };
  }
}
function evidence(): RollbackEvidence {
  const release: ReleaseIdentity = {
    sourceSha: createHash('sha1')
      .update(readFileSync('packages/persistence/src/recovery-types.ts'))
      .digest('hex'),
    imageDigest: 'sha256:' + 'a'.repeat(64),
    schemaDigest: sha('packages/contracts/schemas/c00-v2.json'),
    registryDigest: sha('packages/contracts/schemas/operations-v2.json'),
    recoveryDecoderDigest: sha('packages/persistence/src/recovery-types.ts'),
    configRevision: 'synthetic-config',
    keyGeneration: 'original-key-generation',
    bindingGeneration: 'original-binding-generation',
    epoch,
    acceptedWorkVersions: [2],
  };
  validateRelease(release);
  return {
    incidentId: 'synthetic-incident',
    attemptId: 'original-attempt',
    current: release,
    previous: { ...release, imageDigest: 'sha256:' + 'b'.repeat(64) },
    previousState: 'COMPLETED',
    pendingWorkVersions: [2],
    originalKeysRetained: true,
    currentSecurityConfirmed: true,
    stagedCompatibilityPassed: true,
    manifestApproved: true,
  };
}
async function snapshot() {
  return {
    account: await store.read('Account', 'original-person'),
    requestKey: await sources.primaryApp.query(
      "SELECT request_id,data FROM u1_request_key WHERE data->>'key'=$1",
      ['original-key'],
    ),
    epoch: await store.currentEpoch(),
    entries: await sources.journalAppend.query(
      'SELECT count(*)::text AS count FROM u1_protected_entry',
    ),
  };
}
function fixture(value = evidence()) {
  const state = new Store();
  const platform: DeploymentPlatform = {
    observe: vi.fn(async () => value),
    notifyStarted: vi.fn(async () => undefined),
    applyApplicationImage: vi.fn(async () => undefined),
  };
  return {
    state,
    platform,
    control: new DeploymentControl(state, platform, true, async () => true),
  };
}
describe('현재canonical/원래PG원본을유지하는합성배포호환·제어연결', () => {
  it('실제schema/registry/decoderidentity를사용하며앱target만바꾸고원래키/원본/epoch는유지한다', async () => {
    const before = await snapshot(),
      f = fixture();
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('APPLIED_UNVERIFIED');
    expect(await snapshot()).toEqual(before);
    expect((await journalEntries(store, epoch))[0]!.requestId).toBe(requestId);
    passedCases++;
  });
  it('같은원래시도재전달은다른callback/새PG업무를만들지않는다', async () => {
    const before = await snapshot(),
      f = fixture();
    await f.control.rollback('synthetic-incident', 'original-attempt', AbortSignal.timeout(1000));
    await f.control.rollback('synthetic-incident', 'original-attempt', AbortSignal.timeout(1000));
    expect(f.platform.applyApplicationImage).toHaveBeenCalledOnce();
    expect(await snapshot()).toEqual(before);
    passedCases++;
  });
  it('olddecoder가현재pending2를읽지못하면자동되돌림을거절하고대기를삭제하지않는다', async () => {
    const before = await snapshot(),
      value = evidence();
    value.previous.acceptedWorkVersions = [1];
    const f = fixture(value);
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('MANUAL_REQUIRED');
    expect(f.platform.applyApplicationImage).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
    passedCases++;
  });
  it('현재schema/키/binding/epoch불일치를DBdowngrade로해결하지않는다', async () => {
    const before = await snapshot(),
      value = evidence();
    value.previous.keyGeneration = 'different';
    const f = fixture(value);
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('MANUAL_REQUIRED');
    expect(await snapshot()).toEqual(before);
    passedCases++;
  });
  it('실제보안회수미보호상태를포착한경우앱target을적용하지않는다', async () => {
    await sources.primaryAdmin.query(
      'UPDATE u1_account SET active=false,revision=2 WHERE "accountId"=$1',
      ['original-person'],
    );
    const f = fixture();
    vi.mocked(f.platform.observe).mockImplementation(async () => {
      try {
        await store.currentProtected('Account', 'original-person');
        return evidence();
      } catch {
        return { ...evidence(), currentSecurityConfirmed: false };
      }
    });
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('MANUAL_REQUIRED');
    expect(f.platform.applyApplicationImage).not.toHaveBeenCalled();
    expect((await sources.primaryAdmin.query('SELECT active FROM u1_account'))[0].active).toBe(
      false,
    );
    passedCases++;
  });
  it('알림뒤실제현재state변경은apply직전에재대조하여차단한다', async () => {
    const before = await snapshot(),
      f = fixture();
    vi.mocked(f.platform.notifyStarted).mockImplementation(async () => {
      await sources.primaryAdmin.query(
        'UPDATE u1_account SET active=false,revision=2 WHERE "accountId"=$1',
        ['original-person'],
      );
    });
    let calls = 0;
    vi.mocked(f.platform.observe).mockImplementation(async () => ({
      ...evidence(),
      currentSecurityConfirmed: ++calls === 1,
    }));
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('UNKNOWN');
    expect(f.platform.applyApplicationImage).not.toHaveBeenCalled();
    expect((await snapshot()).requestKey).toEqual(before.requestKey);
    passedCases++;
  });
  it('실제원래data 보호뒤platform결과불명은재시도를자동발행하지않는다', async () => {
    const before = await snapshot(),
      f = fixture();
    vi.mocked(f.platform.applyApplicationImage).mockRejectedValue(
      new Error('synthetic unknown platform'),
    );
    expect(
      (
        await f.control.rollback(
          'synthetic-incident',
          'original-attempt',
          AbortSignal.timeout(1000),
        )
      ).state,
    ).toBe('UNKNOWN');
    await f.control.rollback('synthetic-incident', 'original-attempt', AbortSignal.timeout(1000));
    expect(f.platform.applyApplicationImage).toHaveBeenCalledOnce();
    expect(await snapshot()).toEqual(before);
    passedCases++;
  });
  it('실제manifest/role준비미등록은platform조회/적용전에막는다', async () => {
    const f = fixture();
    await expect(
      new DeploymentControl(f.state, f.platform, true).rollback(
        'synthetic-incident',
        'original-attempt',
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_ACTIVATION_UNVERIFIED' });
    expect(f.platform.observe).not.toHaveBeenCalled();
    expect((await store.read('Account', 'original-person'))?.active).toBe(true);
    passedCases++;
  });
});
