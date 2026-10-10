import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { IdentityRecovery, ProductCatalog, ref } from '@oms/core';
import type { Ref } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { localSources } from './databases.js';
import { SyntheticIdentityProvider } from './identity.js';
import { syntheticBasis } from './enterprise.js';
import { seedHistoricalOrders } from './performance-orders.js';

if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 로컬 합성 준비 재개만 허용합니다.');
const sources = localSources();
for (const source of [sources.primaryApp, sources.journalAppend]) await source.initialize();
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
const checkpointPath = '.runtime/u1/performance-resume-checkpoint.json';
mkdirSync('.runtime/u1', { recursive: true });
const checkpoint = existsSync(checkpointPath)
  ? (JSON.parse(readFileSync(checkpointPath, 'utf8')) as {
      verifier: string;
      cookieKey: string;
      credentials: { password: string; factor: string };
      id: string;
    })
  : {
      verifier: randomBytes(32).toString('hex'),
      cookieKey: randomBytes(32).toString('hex'),
      credentials: {
        password: randomBytes(24).toString('hex'),
        factor: randomBytes(12).toString('hex'),
      },
      id: randomUUID(),
    };
writeFileSync(checkpointPath, JSON.stringify(checkpoint), { mode: 0o600 });
const now = () => new Date();
const identity = new IdentityRecovery(
  store,
  new SyntheticIdentityProvider(false, checkpoint.credentials),
  {
    synthetic: true,
    verifierKey: Buffer.from(checkpoint.verifier, 'hex'),
    now,
    staffIngress: async (proof) => proof === 'synthetic-private-ingress',
  },
);
async function* rows(model: string) {
  let cursor: string | undefined;
  for (;;) {
    const page = await store.list(model, { cursor, limit: 100 });
    for (const row of page) yield row;
    if (page.length < 100) break;
    cursor = ref(model, page[page.length - 1]!).id;
  }
}
try {
  // The failed preparation never checkpointed its ephemeral synthetic secrets.
  // Preserve all business originals and protection history. Explicitly invalidate
  // that synthetic fixture's old sessions/code sets before creating a new profile.
  // This is not an operational signing-key rotation or real identity assertion.
  for (const model of ['IdentitySession', 'RecoveryCodeSet'])
    for await (const row of rows(model)) {
      const account = row.accountRef as Ref;
      if (!account.id.startsWith('nfr-'))
        throw new Error('합성 성능 자료 밖의 신원 원본은 변경하지 않습니다.');
      if (model === 'IdentitySession' ? row.phase === 'INVALIDATED' : row.invalidated === true)
        continue;
      await store.execute(
        {
          principalId: 'synthetic-nfr-profile-recovery',
          audience: 'SYSTEM',
          owner: 'IdentityRecovery',
          operation: 'synthetic-lost-preparation-secrets',
          target: null,
          idempotencyKey: checkpoint.id + '-' + ref(model, row).id,
          input: { model, id: ref(model, row).id, revision: row.revision },
          correlationId: checkpoint.id,
          epoch: await store.currentEpoch(),
        },
        async (transaction) => {
          await transaction.put(
            model,
            {
              ...row,
              ...(model === 'IdentitySession' ? { phase: 'INVALIDATED' } : { invalidated: true }),
              revision: Number(row.revision) + 1,
            },
            Number(row.revision),
          );
        },
      );
    }
  const ingress = 'synthetic-private-ingress';
  const start = await identity.login(
    'STAFF',
    'nfr-staff-0@example.invalid',
    checkpoint.credentials.password,
    'nfr-resume-peer',
    ingress,
  );
  await identity.verifyFactor(
    start.challengeId!,
    checkpoint.credentials.factor,
    'nfr-resume-peer',
    ingress,
  );
  const codes = await identity.issueRecoveryCodes(start.challengeId!, ingress);
  const authenticated = await identity.acknowledgeRecoveryCodes(
    start.challengeId!,
    codes.setId,
    true,
    ingress,
  );
  const token = authenticated.sessionToken!;
  const enterprises: Ref[] = Array(100);
  for await (const row of rows('Enterprise')) {
    const application = await store.read('EnterpriseApplication', (row.applicationRef as Ref).id);
    const index = Number(String(application?.legalName).replace('합성 성능 기업 ', ''));
    if (!Number.isInteger(index) || index < 0 || index >= 100 || enterprises[index])
      throw new Error('원래 합성 기업 index를 확인해야 합니다.');
    enterprises[index] = ref('Enterprise', row);
  }
  if (enterprises.filter(Boolean).length !== 100)
    throw new Error('기존 기업100개를 유지해야 합니다.');
  const products: { productRef: Ref; offerRef: Ref; productType: 'HARDWARE' | 'SOFTWARE' }[] =
    Array(10000);
  for await (const row of rows('Product')) {
    const index = Number(String(row.label).replace('합성 성능 품목 ', ''));
    if (!Number.isInteger(index) || index < 0 || index >= 10000 || products[index])
      throw new Error('원래 합성 상품 index를 확인해야 합니다.');
    products[index] = {
      productRef: ref('Product', row),
      offerRef: row.currentOfferRef as Ref,
      productType: row.productType as 'HARDWARE' | 'SOFTWARE',
    };
  }
  const catalog = new ProductCatalog(store, now);
  for (let index = 0; index < 10000; index++)
    if (!products[index]) {
      const productType = index % 2 === 0 ? 'HARDWARE' : 'SOFTWARE';
      const context = await identity.authenticate(token, 'STAFF', randomUUID(), ingress);
      const receipt = await catalog.register(context, {
        meta: {
          clientRequestId: 'nfr-resume-product-' + index,
          expectedRevision: null,
          reason: '기존 합성 성능 준비의 누락 상품 재개',
          evidenceRefs: [syntheticBasis],
        },
        productType,
        softwareTermKind: productType === 'SOFTWARE' ? 'TERM' : null,
        label: '합성 성능 품목 ' + index,
        salesDescription: '실제 공급/지급/발급 조건 미확인',
        commonPrice: { currency: 'KRW', value: '100' },
        salesConditionRefs: [],
      });
      products[index] = {
        productRef: receipt.targetRef!,
        offerRef: receipt.resultRefs.find((value) => value.entity === 'CommonOfferRevision')!,
        productType,
      };
      await identity.recordRegisteredActivity(
        token,
        'STAFF',
        'registerProduct',
        randomUUID(),
        ingress,
      );
    }
  await identity.logout(token);
  console.log(
    '기업100·상품10000의 기존 원본 보존/누락 준비 완료. 과거 주문의 원래 키로 재개합니다.',
  );
  await seedHistoricalOrders(store, enterprises, products);
  writeFileSync(
    '.runtime/u1/performance-profile.json',
    JSON.stringify({
      ...checkpoint,
      enterprises,
      products: products.slice(0, 100),
      preparedAt: now().toISOString(),
      counts: {
        enterprises: 100,
        customers: 1000,
        staff: 10,
        products: 10000,
        orders: 100000,
        averageItems: 5,
        maximumItems: 50,
      },
    }),
    { mode: 0o600 },
  );
  console.log('전체 합성 규모 준비 완료. 실제 신원/기업/성능 통과 증거가 아닙니다.');
} finally {
  for (const source of [sources.primaryApp, sources.journalAppend])
    if (source.isInitialized) await source.destroy();
}
