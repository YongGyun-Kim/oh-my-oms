import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  NoticeWorker,
  U2Worker,
  PrivateU2Delivery,
  EnrollmentAuthorities,
  IdentityConsumer,
  PurposeVerifier,
} from '@oms/core';
import { PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import { requireCondition, OmsError } from '@oms/contracts';
import {
  SqsBroker,
  workerConfiguration,
  u2WorkerConfiguration,
  runtimeStore,
  runWorkerLoop,
  runWorkerCycle,
  RuntimeTelemetry,
  CognitoRecoveryPort,
} from '@oms/integrations';
@Module({})
class WorkerHostModule {}
export function workerHostU2Requested(environment: NodeJS.ProcessEnv): boolean {
  if (environment.OMS_U2_RUNTIME_PROFILE !== undefined) {
    requireCondition(
      environment.OMS_U2_RUNTIME_PROFILE === 'UNREGISTERED',
      503,
      'U2_WORKER_PROFILE',
      '명시 미등록 U2 worker profile만 해석합니다.',
    );
    return true;
  }
  requireCondition(
    !Object.keys(environment).some(
      (key) =>
        key.startsWith('OMS_U2_') ||
        ['OMS_IDENTITY_QUEUE_URL', 'OMS_HANDOFF_QUEUE_URL', 'OMS_INVITATION_QUEUE_URL'].includes(
          key,
        ),
    ),
    503,
    'U2_WORKER_PARTIAL_CONFIGURATION',
    '부분 U2 구성을 legacy notice로 숨기지 않습니다.',
  );
  return false;
}
export async function startWorker(environment: NodeJS.ProcessEnv = process.env) {
  const u2Config = workerHostU2Requested(environment) ? u2WorkerConfiguration(environment) : null;
  const config = u2Config ?? workerConfiguration(environment);
  const resources = await runtimeStore(config, 'worker');
  const host = await NestFactory.createApplicationContext(WorkerHostModule, { logger: false });
  const telemetry = new RuntimeTelemetry(
    config.telemetryEndpoint,
    false,
    new Set([
      'NotificationDelivery.relay',
      'NotificationDelivery.consume',
      'NotificationDelivery.firstProcessing',
    ]),
  );
  const broker = new SqsBroker(config.queueUrls, 'ap-northeast-2');
  const worker = new NoticeWorker(resources.store, broker, () => new Date(), false, telemetry);
  let u2: U2Worker | undefined, vault: PurposeSecretVault | undefined;
  const now = () => new Date();
  if (u2Config) {
    requireCondition(
      resources.vault,
      503,
      'U2_VAULT_RUNTIME_REQUIRED',
      '분리된 목적 암호 자료 역할이 필요합니다.',
    );
    const verifier = new PurposeVerifier(
      u2Config.purposeVerifierKey,
      u2Config.purposeVerifierVersion,
    );
    vault = new PurposeSecretVault(
      resources.vault,
      u2Config.vaultKey,
      u2Config.vaultKeyVersion,
      (binding, permit, action) =>
        authorizeProtectedVault(resources.store, binding, permit, action),
    );
    const authorities = new EnrollmentAuthorities(
      resources.store,
      verifier,
      now,
      async () => false,
    );
    // No actual provider termination/receiver/domestic authority has been
    // registered. Routing is runnable; every real external effect stays HOLD.
    const identity = new IdentityConsumer(
        resources.store,
        new CognitoRecoveryPort(u2Config.cognito),
        authorities,
        now,
        false,
        vault,
        verifier,
      ),
      delivery = new PrivateU2Delivery(
        resources.store,
        vault,
        {
          profile: 'UNREGISTERED',
          send: async () => {
            throw new OmsError(
              503,
              'REAL_PRIVATE_RECEIVER_HOLD',
              '실제 수신/국내 경로/권위 등록 전에는 전달하지 않습니다.',
            );
          },
        },
        now,
        false,
      );
    u2 = new U2Worker(resources.store, broker, identity, now, false, {
      'u2-handoff-delivery': delivery,
      'u2-invitation-delivery': delivery,
    });
  }
  const stop = new AbortController();
  const cycle = async () => {
    if (u2 && vault) {
      const sourceSweep = await u2.sweepSources(),
        terminalSweep = await vault.sweepTerminal(resources.store),
        expirySweep = await vault.sweepExpired(resources.store);
      if (sourceSweep.blocked || terminalSweep.blocked || expirySweep.blocked)
        console.error(
          JSON.stringify({
            event: 'u2-purpose-control-unconfirmed',
            observedAt: now().toISOString(),
            sourceBlocked: sourceSweep.blocked,
            terminalBlocked: terminalSweep.blocked,
            expiryBlocked: expirySweep.blocked,
            action: 'ORIGINAL_SOURCE_RECONCILIATION_REQUIRED',
          }),
        );
    }
    await runWorkerCycle(
      worker,
      broker,
      stop.signal,
      () => {
        console.error(
          JSON.stringify({
            event: 'original-message-reconciliation-required',
            observedAt: new Date().toISOString(),
            action: 'ORIGINAL_WORK_RECONCILIATION_REQUIRED',
            acknowledged: false,
          }),
        );
      },
      u2,
    );
    for (const failure of u2?.takeFailures() ?? [])
      console.error(
        JSON.stringify({
          event: 'u2-original-work-unconfirmed',
          consumer: failure.consumer,
          code: failure.code,
          action: 'ORIGINAL_WORK_RECONCILIATION_REQUIRED',
        }),
      );
  };
  const running = runWorkerLoop(cycle, stop.signal, () => {
    console.error(
      JSON.stringify({
        event: 'worker-cycle-unconfirmed',
        observedAt: new Date().toISOString(),
        action: 'ORIGINAL_WORK_RECONCILIATION_REQUIRED',
      }),
    );
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    stop.abort();
    await running;
    await host.close();
    await resources.close();
    await telemetry.close().catch(() => {
      console.error('관측 종료 미확인: 업무 종료와 구분');
    });
  };
  return { worker, u2, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = await startWorker();
  const drain = () => {
    void host.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', drain);
  process.once('SIGINT', drain);
}
