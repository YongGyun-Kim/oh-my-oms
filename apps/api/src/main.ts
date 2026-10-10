import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:https';
import {
  Assessments,
  EnterpriseAccess,
  IdentityRecovery,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
  PurposeVerifier,
  PartyClaimContexts,
  RecoveryHandoffs,
  EnrollmentAuthorities,
  RecoveryCases,
  RecoveryHolds,
  RecoveryVerificationPolicies,
  SavedCodeRecoveries,
  RecoveryCompletions,
  EmergencyRecoveries,
  IdentityConsumer,
} from '@oms/core';
import {
  CognitoProvider,
  runtimeApiConfiguration,
  runtimeStore,
  UnregisteredEnterpriseVerification,
  RuntimeTelemetry,
  CognitoRecoveryPort,
} from '@oms/integrations';
import { PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import type { IdentityU2Runtime } from '@oms/core';
import { OmsError } from '@oms/contracts';
import { apiObservationOperations } from './observation.js';
import { createApi } from './application.js';
// One API execution role serves two strictly separate audience compositions.
// Origin selects a registered transport; it NEVER establishes staff identity/ingress/grant.
export async function startApi(environment: NodeJS.ProcessEnv = process.env) {
  const config = runtimeApiConfiguration(environment);
  const resources = await runtimeStore(
    { ...config.customer, vaultUrl: config.u2?.vaultUrl },
    'api',
  );
  const now = () => new Date();
  const store = resources.store;
  const telemetry = new RuntimeTelemetry(
    config.customer.telemetryEndpoint,
    false,
    apiObservationOperations,
  );
  let customer: Awaited<ReturnType<typeof createApi>> | undefined;
  let staff: Awaited<ReturnType<typeof createApi>> | undefined;
  try {
    let u2: IdentityU2Runtime | undefined, consumer: IdentityConsumer | undefined;
    if (config.u2) {
      if (!resources.vault)
        throw new OmsError(503, 'U2_VAULT_RUNTIME_REQUIRED', '별도 목적 자료 역할이 필요합니다.');
      const c = config.u2,
        ingress = async () => false,
        verifier = new PurposeVerifier(c.purposeVerifierKey, c.purposeVerifierVersion),
        vault = new PurposeSecretVault(resources.vault, c.vaultKey, c.vaultKeyVersion, (b, p, a) =>
          authorizeProtectedVault(store, b, p, a),
        ),
        authorities = new EnrollmentAuthorities(store, verifier, now, ingress),
        parties = new PartyClaimContexts(store, verifier, now, ingress),
        emergencies = new EmergencyRecoveries(store, verifier, now, 'UNREGISTERED', ingress),
        provider = new CognitoRecoveryPort(config.customer.cognito);
      u2 = {
        parties,
        authorities,
        emergencies,
        handoffs: new RecoveryHandoffs(
          store,
          verifier,
          vault,
          now,
          'UNREGISTERED',
          parties,
          ingress,
          emergencies,
        ),
        cases: new RecoveryCases(store, c.purposeVerifierKey, now, ingress, async () => {
          throw new OmsError(
            503,
            'REAL_ACTIVATION_UNVERIFIED',
            '실제 인정된 접수·신원 정책 확인 전에는 보류합니다.',
          );
        }),
        holds: new RecoveryHolds(
          store,
          new RecoveryVerificationPolicies(store, now, 'UNREGISTERED'),
          now,
          vault,
        ),
        savedCodes: new SavedCodeRecoveries(store, verifier, vault, now, 'UNREGISTERED'),
        completions: new RecoveryCompletions(store, authorities, now, 'UNREGISTERED'),
      };
      consumer = new IdentityConsumer(store, provider, authorities, now, false, vault, verifier);
      // Real factor/invitation capability is not registered. Their public
      // facades stay closed; local fixtures assemble the full tested modules.
    }
    const identity = new IdentityRecovery(
      store,
      new CognitoProvider(config.customer.cognito),
      {
        synthetic: false,
        verifierKey: config.customer.verifierKey,
        now,
        staffIngress: async () => false,
      },
      u2,
    );
    const owners = {
      store,
      identity,
      enterprise: new EnterpriseAccess(store, new UnregisteredEnterpriseVerification(), now, false),
      catalog: new ProductCatalog(store, now),
      orders: new OrderAcceptance(store, new Assessments(now), now),
      staff: new StaffAccess(store, now),
      inquiry: new WorkInquiry(store, now),
      notices: new NotificationDelivery(store, now),
      now,
      u2RateKey: config.u2?.purposeVerifierKey,
      identityConsumer: consumer,
      personRegistration: 'UNREGISTERED' as const,
    };
    const composition = async (audience: 'CUSTOMER' | 'STAFF') => {
      const options = audience === 'CUSTOMER' ? config.customer : config.staff;
      return createApi(owners, {
        audience,
        origin: options.origin,
        transportHost: options.transportHost,
        tls: options.tls,
        cookieKey: options.cookieKey,
        localSynthetic: false,
        telemetry,
        activationAdmission: async () => {
          throw new OmsError(
            503,
            'REAL_ACTIVATION_UNVERIFIED',
            '실제 신원/자료/운영 profile을 확인해야 합니다.',
          );
        },
        staffAdmission: async () => null,
      });
    };
    customer = await composition('CUSTOMER');
    staff = await composition('STAFF');
    const server = createServer(config.customer.tls, (request, response) => {
      const destination =
        request.url === '/health/live' || request.headers.origin === config.customer.origin
          ? customer
          : request.headers.origin === config.staff.origin
            ? staff
            : null;
      if (!destination) {
        response.writeHead(403, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/problem+json',
        });
        response.end(
          JSON.stringify({
            status: 403,
            detail: '등록된 업무 접점과 현재 접근 근거가 필요합니다.',
          }),
        );
        return;
      }
      destination.server(request, response);
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 100;
    await new Promise<void>((done) => server.listen(config.customer.port, '0.0.0.0', done));
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      const timer = setTimeout(() => server.closeAllConnections(), 15000);
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      clearTimeout(timer);
      await customer!.app.close();
      await staff!.app.close();
      await resources.close();
      await telemetry.close().catch(() => {
        console.error('관측 종료 미확인: 업무 종료와 구분');
      });
    };
    return { server, close };
  } catch (error) {
    await customer?.app.close();
    await staff?.app.close();
    await resources.close();
    await telemetry.close().catch(() => undefined);
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = await startApi();
  const drain = () => {
    void host.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', drain);
  process.once('SIGINT', drain);
}
