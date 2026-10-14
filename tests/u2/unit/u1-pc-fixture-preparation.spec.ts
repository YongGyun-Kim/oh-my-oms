import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProtectedStore } from '@oms/persistence';

type Row = Record<string, unknown>;
interface ServiceStore {
  read: (model: string, id: string) => Promise<Row | null>;
  list: () => Promise<Row[]>;
  currentProtected: (model: string, id: string) => Promise<Row | null>;
}
const fixture = vi.hoisted(() => ({
  events: [] as string[],
  sources: {} as Record<string, { options: { type: string; url: string }; initialize: () => void }>,
  store: null as unknown as ServiceStore,
  accounts: new Map<string, Row>(),
  grant: false,
  rawFence: null as Row | null,
  protectedFence: null as Row | null,
  backfillFailure: false,
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
      String(path).startsWith('.runtime/u1/') ? false : actual.existsSync(path),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});
vi.mock('@oms/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oms/persistence')>();
  return {
    ...actual,
    ProtectedStore: vi.fn(function () {
      return fixture.store;
    }),
    backfillU2SecurityState: async () => {
      fixture.events.push('backfill');
      if (fixture.backfillFailure) throw Error('FIXTURE_BACKFILL_FAILURE');
    },
  };
});
vi.mock('@oms/api', () => ({
  createApi: async (_owners: unknown, transport: { audience: string }) => {
    fixture.events.push('api:' + transport.audience);
    return { app: { listen: async () => {}, close: async () => {} } };
  },
}));
vi.mock('@oms/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oms/core')>();
  class Owner {}
  return {
    ...actual,
    Assessments: Owner,
    EnterpriseAccess: Owner,
    IdentityRecovery: Owner,
    NoticeWorker: Owner,
    NotificationDelivery: Owner,
    OrderAcceptance: Owner,
    ProductCatalog: Owner,
    StaffAccess: Owner,
    WorkInquiry: Owner,
  };
});
vi.mock('../../u1/fixtures/databases.js', () => ({ localSources: () => fixture.sources }));
vi.mock('../../u1/fixtures/migrate.js', () => ({
  initializeDatabases: async () => {
    fixture.events.push('initialize');
  },
}));
vi.mock('../../u1/fixtures/reset.js', () => ({
  resetSyntheticDatabases: async () => {
    fixture.events.push('reset');
    fixture.accounts.clear();
    fixture.grant = false;
    fixture.rawFence = fixture.protectedFence = null;
  },
}));
vi.mock('../../u1/fixtures/identity.js', () => ({
  SyntheticIdentityProvider: class {},
  seedSyntheticAccount: async (_store: unknown, accountId: string, audience: string) => {
    fixture.events.push('seed:' + accountId);
    const seeded = await syntheticRecords(accountId, audience as 'CUSTOMER' | 'STAFF');
    fixture.accounts.set(accountId, seeded.account);
  },
}));
vi.mock('../../u1/fixtures/staff-bootstrap.js', () => ({
  seedMinimumStaffManager: async () => {
    fixture.events.push('manager');
    fixture.grant = true;
    fixture.rawFence = fixture.protectedFence = {
      fenceId: 'u2-staff-authority',
      authorityRevision: 1,
      revision: 1,
    };
  },
}));

const originalArgv = [...process.argv];
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('OMS_U1_SYNTHETIC_PROFILE', 'approved-local-only');
  vi.stubEnv('OMS_U1_DATABASE_PROFILE', 'e2e-isolated');
  vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as NodeJS.Timeout);
  vi.spyOn(process, 'once').mockReturnValue(process);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.argv = [...originalArgv, '--reset-synthetic'];
  fixture.events = [];
  fixture.accounts = new Map();
  fixture.grant = false;
  fixture.rawFence = fixture.protectedFence = null;
  fixture.backfillFailure = false;
  fixture.sources = Object.fromEntries(
    [
      ['primaryApp', '15432', 'oms_u1_e2e', 'u1_verify_app'],
      ['journalAppend', '25432', 'oms_u1_journal_e2e', 'u1_verify_journal_append'],
      ['primaryAdmin', '15432', 'oms_u1_e2e', 'u1_primary_admin'],
      ['journalAdmin', '25432', 'oms_u1_journal_e2e', 'u1_journal_admin'],
    ].map(([name, port, database, user]) => [
      name,
      {
        options: { type: 'postgres', url: `postgresql://${user}@127.0.0.1:${port}/${database}` },
        initialize: async () => {},
      },
    ]),
  );
  fixture.store = {
    read: async (model, id) =>
      model === 'Account' ? (fixture.accounts.get(id) ?? null) : fixture.rawFence,
    list: async () => (fixture.grant ? [{ staffGrantId: 'existing' }] : []),
    currentProtected: async () => fixture.protectedFence,
  };
});
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const startService = () => import('../../u1/fixtures/local-service.js');
const apiWasOpened = () => fixture.events.some((event) => event.startsWith('api:'));

describe('U1 PC prepare order', () => {
  it('등록 reset과 원래4계정 seed 뒤 backfill/fence를 준비하고 API를 연다', async () => {
    await startService();
    expect(fixture.events).toEqual([
      'initialize',
      'reset',
      'seed:customer',
      'seed:other',
      'seed:unrelated',
      'seed:staff',
      'backfill',
      'manager',
      'api:CUSTOMER',
      'api:STAFF',
    ]);
    expect(fixture.accounts.size).toBe(4);
  });
  it('production과 등록되지 않은 synthetic profile은 준비 쓰기 전에 거절한다', async () => {
    for (const [key, value] of [
      ['NODE_ENV', 'production'],
      ['OMS_U1_SYNTHETIC_PROFILE', 'unknown'],
    ]) {
      vi.stubEnv(key, value);
      vi.resetModules();
      await expect(startService()).rejects.toThrow();
      expect(fixture.events).toEqual([]);
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('OMS_U1_SYNTHETIC_PROFILE', 'approved-local-only');
    }
  });
  it('잘못된 host/port/database/user/protocol은 initialize나 reset 전에 거절한다', async () => {
    const source = fixture.sources.primaryApp!;
    const original = source.options.url;
    for (const invalid of [
      original.replace('127.0.0.1', 'other.invalid'),
      original.replace('15432', '15433'),
      original.replace('oms_u1_e2e', 'oms_u1_verification'),
      original.replace('u1_verify_app', 'u1_primary_admin'),
      original.replace('postgresql:', 'https:'),
    ]) {
      source.options.url = invalid;
      vi.resetModules();
      await expect(startService()).rejects.toThrow();
      expect(fixture.events).toEqual([]);
    }
  });
  it('journal 오대상과 비PostgreSQL source도 준비 전에 거절한다', async () => {
    fixture.sources.journalAppend!.options.url = fixture.sources.primaryApp!.options.url;
    await expect(startService()).rejects.toThrow();
    expect(fixture.events).toEqual([]);
    fixture.sources.primaryApp!.options.type = 'sqlite';
    vi.resetModules();
    await expect(startService()).rejects.toThrow();
    expect(fixture.events).toEqual([]);
  });
  it('backfill 실패를 전파하고 manager/API를 시작하지 않는다', async () => {
    fixture.backfillFailure = true;
    await expect(startService()).rejects.toThrow('FIXTURE_BACKFILL_FAILURE');
    expect(fixture.events).toContain('seed:staff');
    expect(fixture.events).not.toContain('manager');
    expect(apiWasOpened()).toBe(false);
  });
  it('기존 grant가 있는 no-reset 자료에 fence가 없으면 새 fence를 합성하지 않는다', async () => {
    process.argv = originalArgv;
    fixture.grant = true;
    await expect(startService()).rejects.toThrow('보호된 현재 staff fence');
    expect(fixture.events).not.toContain('manager');
    expect(fixture.rawFence).toBeNull();
    expect(apiWasOpened()).toBe(false);
  });
  it('기존 fence의 raw-only/불일치는 거절하고 현재 확인된 fence는 보존한다', async () => {
    process.argv = originalArgv;
    fixture.grant = true;
    const fence = { fenceId: 'u2-staff-authority', authorityRevision: 3, revision: 3 };
    fixture.rawFence = fence;
    for (const visible of [null, { ...fence, revision: 2 }]) {
      fixture.protectedFence = visible;
      vi.resetModules();
      await expect(startService()).rejects.toThrow('보호된 현재 staff fence');
      expect(apiWasOpened()).toBe(false);
    }
    fixture.protectedFence = { ...fence };
    vi.resetModules();
    await startService();
    expect(fixture.rawFence).toEqual(fence);
    expect(fixture.events).not.toContain('manager');
  });
  it('기존 verification profile의 준비는 새 E2E backfill을 호출하지 않는다', async () => {
    vi.stubEnv('OMS_U1_DATABASE_PROFILE', 'verification-isolated');
    await startService();
    expect(fixture.events).not.toContain('backfill');
    expect(apiWasOpened()).toBe(true);
  });
});

async function syntheticRecords(accountId = 'staff', audience: 'CUSTOMER' | 'STAFF' = 'STAFF') {
  const actual = await vi.importActual<typeof import('../../u1/fixtures/identity.js')>(
    '../../u1/fixtures/identity.js',
  );
  const persistence = await vi.importActual<typeof import('@oms/persistence')>('@oms/persistence');
  const captured = new Map<string, Row>();
  const capture = {
    currentEpoch: async () => 'initial',
    execute: async (
      _meta: unknown,
      callback: (tx: { put: (model: string, data: Row) => Promise<void> }) => Promise<void>,
    ) =>
      callback({
        put: async (model, data) => {
          const attributes = persistence.modelDefinition(model).attributes;
          if (
            Object.keys(data).some(
              (key) => !attributes.some((attribute) => attribute.name === key),
            ) ||
            attributes.some((attribute) => attribute.required && data[attribute.name] === undefined)
          )
            throw Error('FIXTURE_SEED_MODEL_MISMATCH');
          captured.set(model, structuredClone(data));
        },
      }),
  } as unknown as ProtectedStore;
  // Execute the existing seed builder; only its persistence writes are isolated.
  const seeded = await actual.seedSyntheticAccount(capture, accountId, audience);
  expect(captured.get('Account')).toEqual(seeded.account);
  expect(captured.get('ProviderBinding')).toEqual(seeded.binding);
  return seeded;
}
async function bootstrapStore() {
  const { account, binding } = await syntheticRecords();
  const state = {
    rawAccount: account as Row | null,
    protectedAccount: { ...account } as Row | null,
    txAccount: { ...account } as Row | null,
    rawBindings: [{ ...binding }] as Row[],
    protectedBinding: { ...binding } as Row | null,
    txBindings: [{ ...binding }] as Row[],
    rawFence: null as Row | null,
    protectedFence: null as Row | null,
    failFence: false,
    committed: [] as { model: string; data: Row }[],
    rolledBack: false,
    meta: null as Row | null,
  };
  const selectBindings = (rows: Row[], equals: Row, limit: number) =>
    rows
      .filter(
        (row) =>
          row.audience === equals.audience &&
          row.active === equals.active &&
          (row.accountRef as Row).id === (equals.accountRef as Row).id,
      )
      .slice(0, limit);
  const store = {
    read: async () => state.rawAccount,
    list: async (model: string, query: { equals: Row; limit: number }) => {
      if (model !== 'ProviderBinding') throw Error('UNEXPECTED_FIXTURE_MODEL');
      return selectBindings(state.rawBindings, query.equals, query.limit);
    },
    currentProtected: async (model: string, id: string) => {
      if (model === 'Account') return state.protectedAccount;
      if (model === 'ProviderBinding')
        return state.protectedBinding?.bindingId === id ? state.protectedBinding : null;
      return state.protectedFence;
    },
    currentEpoch: async () => 'initial',
    execute: async (
      meta: Row,
      callback: (
        tx: {
          get: (model: string) => Promise<Row | null>;
          list: (model: string, equals: Row, limit: number) => Promise<Row[]>;
          put: (model: string, data: Row) => void;
        },
        requestId: string,
      ) => Promise<void>,
    ) => {
      state.meta = meta;
      const pending: { model: string; data: Row }[] = [];
      try {
        await callback(
          {
            get: async (model) => (model === 'Account' ? state.txAccount : state.rawFence),
            list: async (model, equals, limit) => {
              if (model !== 'ProviderBinding') throw Error('UNEXPECTED_FIXTURE_MODEL');
              return selectBindings(state.txBindings, equals, limit);
            },
            put: async (model, data) => {
              if (model === 'StaffAuthorityFence' && state.failFence)
                throw Error('FIXTURE_FENCE_WRITE_FAILURE');
              pending.push({ model, data: structuredClone(data) });
            },
          },
          'fixture-request',
        );
        state.committed.push(...pending);
      } catch (error) {
        state.rolledBack = true;
        throw error;
      }
    },
  } as unknown as ProtectedStore;
  return { state, store };
}
async function seedManager(store: ProtectedStore) {
  const actual = await vi.importActual<typeof import('../../u1/fixtures/staff-bootstrap.js')>(
    '../../u1/fixtures/staff-bootstrap.js',
  );
  return actual.seedMinimumStaffManager(store, 'staff', new Date('2026-10-11T00:00:00.000Z'));
}
describe('U1 initial staff fence', () => {
  it('실제 Account/STAFF binding seed로 최소 권한과 fence를 같은 보호 transaction에 기록한다', async () => {
    const { state, store } = await bootstrapStore();
    expect(state.rawAccount).not.toHaveProperty('audience');
    expect(state.rawBindings[0]?.audience).toBe('STAFF');
    await seedManager(store);
    expect(state.meta?.operation).toBe('initial-minimum-staff-role');
    expect(state.meta?.input).toEqual({ accountId: 'staff', action: 'staff.role.manage' });
    expect(state.committed.map((entry) => entry.model)).toEqual([
      'StaffRole',
      'StaffRoleGrant',
      'StaffAuthorityFence',
      'RequestReceipt',
      'AccessHistory',
    ]);
    expect(state.committed[0]!.data.actions).toEqual(['staff.role.manage']);
    const receipt = state.committed.find((entry) => entry.model === 'RequestReceipt')!.data;
    expect(receipt.requestState).toBe('RESULT_RECORDED');
    expect((receipt.resultRefs as Row[]).map((ref) => ref.entity)).toEqual([
      'StaffRole',
      'StaffRoleGrant',
    ]);
  });
  it('Account 없음/비활성/미보호/원본 개정 불일치는 최소 준비 전에 거절한다', async () => {
    for (const mode of ['missing', 'inactive', 'unprotected', 'stale'] as const) {
      const { state, store } = await bootstrapStore();
      if (mode === 'missing') state.rawAccount = null;
      if (mode === 'inactive') {
        state.rawAccount = { ...state.rawAccount, active: false };
        state.protectedAccount = { ...state.protectedAccount, active: false };
      }
      if (mode === 'unprotected') state.protectedAccount = null;
      if (mode === 'stale') state.protectedAccount = { ...state.protectedAccount, revision: 2 };
      if (mode === 'missing')
        await expect(seedManager(store)).rejects.toThrow('합성 직원 계정 준비');
      else await expect(seedManager(store)).rejects.toMatchObject({ code: 'FIXTURE_STAFF_SOURCE' });
      expect(state.meta).toBeNull();
      expect(state.committed).toEqual([]);
    }
  });
  it('STAFF binding 없음/타계정/CUSTOMER/비활성/제거/모호/미보호/원본 불일치는 거절한다', async () => {
    for (const mode of [
      'missing',
      'other-account',
      'customer',
      'inactive',
      'unknown-removal',
      'removed',
      'ambiguous',
      'unprotected',
      'stale',
      'wrong-owner',
    ] as const) {
      const { state, store } = await bootstrapStore();
      const binding = state.rawBindings[0]!;
      if (mode === 'missing') state.rawBindings = [];
      if (mode === 'other-account')
        binding.accountRef = { ...(binding.accountRef as Row), id: 'other' };
      if (mode === 'customer') binding.audience = 'CUSTOMER';
      if (mode === 'inactive') binding.active = false;
      if (mode === 'unknown-removal') binding.removalState = 'UNKNOWN';
      if (mode === 'removed') binding.removalState = 'COMPLETED';
      if (mode === 'ambiguous')
        state.rawBindings.push({ ...binding, bindingId: 'second-staff-binding' });
      if (mode === 'unprotected') state.protectedBinding = null;
      if (mode === 'stale')
        state.protectedBinding = { ...state.protectedBinding, authRevision: 2, revision: 2 };
      if (mode === 'wrong-owner') {
        binding.accountRef = { ...(binding.accountRef as Row), owner: 'EnterpriseAccess' };
        state.protectedBinding = { ...binding };
      }
      await expect(seedManager(store)).rejects.toMatchObject({ code: 'FIXTURE_STAFF_BINDING' });
      expect(state.meta).toBeNull();
      expect(state.committed).toEqual([]);
    }
  });
  it('tx 안의 Account 또는 binding 변경/소실/복수는 Role/Grant까지 rollback한다', async () => {
    for (const mode of ['account', 'binding', 'missing-binding', 'duplicate-binding'] as const) {
      const { state, store } = await bootstrapStore();
      if (mode === 'account') state.txAccount = { ...state.txAccount, revision: 2 };
      if (mode === 'binding')
        state.txBindings[0] = { ...state.txBindings[0], authRevision: 2, revision: 2 };
      if (mode === 'missing-binding') state.txBindings = [];
      if (mode === 'duplicate-binding')
        state.txBindings.push({ ...state.txBindings[0], bindingId: 'second-staff-binding' });
      await expect(seedManager(store)).rejects.toMatchObject({
        code: mode === 'account' ? 'FIXTURE_STAFF_SOURCE_CHANGED' : 'FIXTURE_STAFF_BINDING_CHANGED',
      });
      expect(state.rolledBack).toBe(true);
      expect(state.committed).toEqual([]);
    }
  });
  it('확인된 기존 fence를 revision1로 되돌리거나 다시 쓰지 않는다', async () => {
    const { state, store } = await bootstrapStore();
    const fence = { fenceId: 'u2-staff-authority', authorityRevision: 7, revision: 7 };
    state.rawFence = { ...fence };
    state.protectedFence = { ...fence };
    await seedManager(store);
    expect(state.committed.some((entry) => entry.model === 'StaffAuthorityFence')).toBe(false);
    expect(state.rawFence).toEqual(fence);
    expect(state.protectedFence).toEqual(fence);
  });
  it('raw-only/보호 불일치/보호 원본만 남은 fence는 덮어쓰지 않고 거절한다', async () => {
    const fence = { fenceId: 'u2-staff-authority', authorityRevision: 7, revision: 7 };
    for (const [raw, protectedRow] of [
      [fence, null],
      [fence, { ...fence, revision: 6 }],
      [null, fence],
    ]) {
      const { state, store } = await bootstrapStore();
      state.rawFence = raw;
      state.protectedFence = protectedRow;
      await expect(seedManager(store)).rejects.toMatchObject({
        code: 'FIXTURE_STAFF_FENCE_UNCONFIRMED',
      });
      expect(state.rolledBack).toBe(true);
      expect(state.committed).toEqual([]);
    }
  });
  it('최초 fence 쓰기 실패에서 접수/권한/이력의 일부 commit은 없다', async () => {
    const { state, store } = await bootstrapStore();
    state.failFence = true;
    await expect(seedManager(store)).rejects.toThrow('FIXTURE_FENCE_WRITE_FAILURE');
    expect(state.rolledBack).toBe(true);
    expect(state.committed).toEqual([]);
  });
  it('기존 verification 호출은 새 보호 binding/fence를 요구하거나 추가하지 않는다', async () => {
    vi.stubEnv('OMS_U1_DATABASE_PROFILE', 'verification-isolated');
    const { state, store } = await bootstrapStore();
    state.protectedAccount = null;
    state.protectedBinding = null;
    state.rawBindings = [];
    await seedManager(store);
    expect(state.committed.map((entry) => entry.model)).toEqual([
      'StaffRole',
      'StaffRoleGrant',
      'RequestReceipt',
      'AccessHistory',
    ]);
  });
});
