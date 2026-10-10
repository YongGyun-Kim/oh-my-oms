import 'reflect-metadata';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApi } from '@oms/api';
import { ProtectedStore, backfillU2SecurityState } from '@oms/persistence';
import { ref } from '@oms/core';
import { u2Sources, initializeU2Databases, u2DatabaseProfile } from './databases.js';
import { resetU2Databases } from './reset.js';
import { seedVerifiedRecoveryParty, seedSyntheticAccount } from './identity.js';
import { u2HttpHost } from './http.js';
import { StatefulRecoveryProvider, syntheticPassword } from './provider.js';
import type { PasswordProof, RecoveryProviderTarget } from '@oms/core';
// Only the PC synthetic TOTP calculator/verifier share this clock. Authority,
// challenge, receipt, observation and execution deadlines keep their wall clock.
const factorClockAt = Date.now();
// Private seed material is only compared in memory; diagnostics emit booleans.
const initialSecretsBySubject = new Map<string, Buffer>();
class ObservedPcRecoveryProvider extends StatefulRecoveryProvider {
  override async factor(proof: PasswordProof, response: string) {
    const observedAt = Date.now(),
      key = proof.issuer + ':' + proof.subject,
      state = this.subjects.get(key),
      initialSecret = initialSecretsBySubject.get(key),
      initialSecretMatches =
        !!state?.secret && !!initialSecret && state.secret.equals(initialSecret),
      currentCodeMatches = state?.secret
        ? this.code({
            issuer: proof.issuer,
            subject: proof.subject,
          } as RecoveryProviderTarget) === response
        : null;
    let passed = false;
    try {
      const result = await super.factor(proof, response);
      passed = true;
      return result;
    } finally {
      console.log(
        JSON.stringify({
          event: 'pc-provider-factor-boundary',
          audience: proof.audience,
          observedAt: new Date(observedAt).toISOString(),
          observedStep: Math.floor(factorClockAt / 30000),
          knownSubject: !!state,
          currentlyVerified: state?.verified === true,
          initialSecretMatches,
          currentCodeMatches,
          passed,
        }),
      );
    }
  }
}
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only' ||
  u2DatabaseProfile() !== 'e2e'
)
  throw new Error('명시 U2 local E2E만 허용합니다.');
await initializeU2Databases();
const sources = u2Sources();
for (const s of Object.values(sources)) await s.initialize();
await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
  keys = { verifier: randomBytes(32), vault: randomBytes(32) },
  f = await seedVerifiedRecoveryParty(
    store,
    sources.vault,
    'LOCAL_SYNTHETIC',
    undefined,
    false,
    keys,
  ),
  provider = new ObservedPcRecoveryProvider(
    () => new Date(),
    () => new Date(factorClockAt),
  ),
  inviteeId = randomUUID();
await seedSyntheticAccount(store, inviteeId, 'CUSTOMER');
await backfillU2SecurityState(store);
const initialSecrets: Record<string, string> = {};
for (const row of await store.list('ProviderBinding', { limit: 100 })) {
  const secret = randomBytes(32),
    key = String(row.issuer) + ':' + String(row.subject);
  provider.subjects.set(key, {
    removed: false,
    signedOut: false,
    passwordDigest: null,
    secret,
    challenge: null,
    verified: true,
  });
  initialSecretsBySubject.set(key, Buffer.from(secret));
  initialSecrets[(row.accountRef as import('@oms/contracts').Ref).id] = secret.toString('base64');
}
const customer = await u2HttpHost(store, f, 'CUSTOMER', true, provider, {
  port: 34800,
  origin: 'http://127.0.0.1:3300',
});
const staff = await createApi(customer.owners, {
  audience: 'STAFF',
  origin: 'http://127.0.0.1:3301',
  transportHost: '127.0.0.1:34801',
  cookieKey: randomBytes(32),
  localSynthetic: true,
  staffAdmission: async (request) =>
    request.socket.remoteAddress === '127.0.0.1' ? 'synthetic-private-ingress' : null,
});
await staff.app.listen(34801, '127.0.0.1');
// Private synthetic bootstrap material; no app endpoint exposes these keys.
mkdirSync('.runtime/u2', { recursive: true });
writeFileSync(
  '.runtime/u2/e2e-fixture.json',
  JSON.stringify({
    synthetic: true,
    sourceRef: ref('RecoveryCase', f.source),
    staff: f.staff,
    customer: f.customer,
    customerId: f.customer.principalId,
    staffId: f.staff.principalId,
    inviteeId,
    enterpriseRef: f.enterpriseRef,
    contact: f.contact,
    evidence: f.evidence,
    policy: f.policy,
    password: syntheticPassword,
    factorClockAt,
    initialSecrets,
    verifierKey: keys.verifier.toString('base64'),
    vaultKey: keys.vault.toString('base64'),
  }),
  { mode: 0o600 },
);
let running = false;
const timer = setInterval(() => {
  if (running) return;
  running = true;
  void (async () => {
    for (const row of await store.list('WorkItem', {
      equals: { owner: 'IdentityRecovery', state: 'PENDING' },
      limit: 100,
    })) {
      if (
        [
          'IdentityRecovery.removeOriginalFactor',
          'IdentityRecovery.signOutOriginalSessions',
          'IdentityRecovery.replaceFirstFactor',
        ].includes(String(row.operationId))
      )
        await customer.owners.identityConsumer!.consume(String(row.workId));
    }
  })()
    .catch(() => {
      console.error('합성 E2E 원래 work의 보호 상태 확인이 필요합니다.');
    })
    .finally(() => {
      running = false;
    });
}, 100);
async function close() {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  await customer.app.close();
  await staff.app.close();
  for (const s of Object.values(sources)) await s.destroy();
}
process.once('SIGTERM', () => void close().then(() => process.exit(0)));
process.once('SIGINT', () => void close().then(() => process.exit(0)));
console.log('U2 합성 E2E API34800/34801 준비; 실제 제공자·회사망·receiver 근거가 아닙니다.');
