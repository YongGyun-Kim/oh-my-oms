import { randomBytes } from 'node:crypto';
import { createApi } from '@oms/api';
import type { ApiOwners } from '@oms/api';
import {
  Assessments,
  EnrollmentAuthorities,
  EnterpriseAccess,
  IdentityRecovery,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
  RecoveryFactorEnrollment,
  RecoveryPurposeCodes,
  RecoveryCodes,
  RecoveryCompletions,
  IdentityConsumer,
  RecoveryCases,
  SavedCodeRecoveries,
} from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { SyntheticIdentityProvider } from '../../u1/fixtures/identity.js';
import { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';
import type { seedVerifiedRecoveryParty } from './identity.js';
import type { StatefulRecoveryProvider } from './provider.js';
import type { IdentityProvider } from '@oms/core';
export async function u2HttpHost(
  store: ProtectedStore,
  f: Awaited<ReturnType<typeof seedVerifiedRecoveryParty>>,
  audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
  admitted = true,
  provider?: StatefulRecoveryProvider,
  transport?: {
    port: number;
    origin: string;
    tls?: { key: string; cert: string };
    cookieKey?: Buffer;
    host?: string;
    listenHost?: '127.0.0.1' | '0.0.0.0';
    identityProvider?: IdentityProvider;
  },
) {
  const authorities = new EnrollmentAuthorities(
      store,
      f.verifier,
      f.now,
      async (proof) => proof === 'synthetic-private-ingress',
    ),
    key = randomBytes(32),
    factors = provider
      ? new RecoveryFactorEnrollment(store, provider, authorities, f.vault, f.now, true, f.verifier)
      : undefined,
    identity = new IdentityRecovery(
      store,
      provider ?? transport?.identityProvider ?? new SyntheticIdentityProvider(),
      {
        synthetic: true,
        verifierKey: key,
        now: f.now,
        staffIngress: async (proof) => proof === 'synthetic-private-ingress',
      },
      {
        parties: f.parties,
        handoffs: f.handoffs,
        authorities,
        cases: new RecoveryCases(
          store,
          key,
          f.now,
          async (proof) => proof === 'synthetic-private-ingress',
          async () => {},
        ),
        savedCodes: new SavedCodeRecoveries(store, f.verifier, f.vault, f.now, 'LOCAL_SYNTHETIC'),
        completions: new RecoveryCompletions(store, authorities, f.now, 'LOCAL_SYNTHETIC'),
        ...(factors
          ? {
              recoveryFactors: factors,
              recoveryCodes: new RecoveryPurposeCodes(
                store,
                factors,
                new RecoveryCodes(key),
                f.now,
              ),
            }
          : {}),
      },
    );
  const owners: ApiOwners = {
    store,
    identity,
    enterprise: new EnterpriseAccess(store, f.access.verification, f.now, true, {
      verifier: f.verifier,
      vault: f.vault,
      authorities,
    }),
    catalog: new ProductCatalog(store, f.now),
    orders: new OrderAcceptance(store, new Assessments(f.now), f.now),
    staff: new StaffAccess(store, f.now),
    inquiry: new WorkInquiry(store, f.now),
    notices: new NotificationDelivery(store, f.now),
    now: f.now,
    personRegistration: 'LOCAL_SYNTHETIC',
    u2RateKey: key,
    ...(provider
      ? {
          identityConsumer: new IdentityConsumer(
            store,
            provider,
            authorities,
            f.now,
            true,
            f.vault,
            f.verifier,
          ),
        }
      : {}),
  };
  const host = await createApi(owners, {
    audience,
    origin: transport?.origin ?? 'http://127.0.0.1:34782',
    ...(transport ? { transportHost: (transport.host ?? '127.0.0.1') + ':' + transport.port } : {}),
    cookieKey: transport?.cookieKey ?? randomBytes(32),
    ...(transport?.tls ? { tls: transport.tls } : {}),
    localSynthetic: true,
    staffAdmission: async () => (admitted ? 'synthetic-private-ingress' : null),
  });
  await host.app.listen(transport?.port ?? 34782, transport?.listenHost ?? '127.0.0.1');
  return { ...host, owners, client: new SyntheticHttpClient('http://127.0.0.1:34782') };
}
