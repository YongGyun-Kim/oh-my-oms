import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { OmsError, requireCondition } from '@oms/contracts';
import type {
  PreIdentityContext,
  U2PurposeContext,
  Invocation,
  U2Invocation,
} from '@oms/contracts';
import { HttpAttempts, HttpAuthIntents } from '@oms/persistence';
import type { HttpAuthIntent } from '@oms/persistence';
import { IdentityBrowser } from '@oms/core';
import { captureRequestBudget, requestBudget } from './request-budget.js';
import { processHttpAdmission } from './admission.js';
import { observeHttp } from './observation.js';
import { resultKnowledge } from '@oms/integrations';
import { ApiSecurity } from './security.js';
import type { ApiSecurityConfiguration } from './security.js';
import { businessOperations, isPrimaryAtomicCommand } from './operations.js';
import type { ApiOwners } from './operations.js';
import { API_ROUTES } from './routes.js';
import { routeInput, routeTarget } from './transport-input.js';
import { authenticationCall, bindAuthentication } from './authentication.js';
import {
  U2Authentication,
  U2PartyCookies,
  U2RateAdmission,
  u2CryptoWork,
  u2PrivateWork,
  u2PublicWork,
  u2HttpCall,
} from './u2-authentication.js';
import type { PartyCookieMaterial } from './u2-authentication.js';
import { bindU2Operations } from './u2-operations.js';
import { U2_API_ROUTES, u2RouteInput } from './u2-routes.js';
import type { U2ApiRoute } from './u2-routes.js';
@Module({})
class ApiHostModule {}
export async function createApi(owners: ApiOwners, configuration: ApiSecurityConfiguration) {
  const security = new ApiSecurity(configuration);
  const authIntents = new HttpAuthIntents(
    owners.store.primary,
    configuration.cookieKey,
    configuration.audience,
  );
  const registry = businessOperations(owners);
  bindAuthentication(registry, owners.identity);
  const purposeBridge = new U2Authentication(owners.store, owners.identity, security, owners.now);
  const partyCookies = new U2PartyCookies(security, owners.now);
  const u2Rate = new U2RateAdmission(owners.store, owners.u2RateKey, owners.now);
  bindU2Operations(registry, owners, purposeBridge, configuration.cookieKey);
  const server = express();
  server.disable('x-powered-by');
  server.set('trust proxy', false);
  const app = await NestFactory.create(ApiHostModule, new ExpressAdapter(server), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
    ...(configuration.tls ? { httpsOptions: configuration.tls } : {}),
  });
  server.use((request, response, next) => {
    security.headers(response);
    next();
  });
  observeHttp(server, configuration.telemetry, configuration.audience);
  server.use(processHttpAdmission.handle);
  server.use(captureRequestBudget);
  server.use(express.json({ limit: '64kb', strict: true, type: 'application/json' }));
  const guarded =
    (handler: (request: Request, response: Response) => Promise<void>) =>
    (request: Request, response: Response, next: NextFunction) => {
      void handler(request, response).catch(next);
    };
  server.get(
    '/health/live',
    guarded(async (request, response) => {
      await security.admission(request);
      response.json({ state: 'LIVE' });
    }),
  );
  server.get(
    '/health/ready/:kind',
    guarded(async (request, response) => {
      await security.admission(request);
      const budget = requestBudget(request);
      await budget.run(async () => {
        await configuration.activationAdmission?.();
        await owners.store.currentEpoch();
        await owners.store.primary.query('SELECT 1');
        const control = (await owners.store.primary.query(
          'SELECT auth_ready FROM u1_recovery_control WHERE singleton=true',
        )) as { auth_ready: boolean }[];
        requireCondition(
          control[0]?.auth_ready,
          503,
          'RECOVERY_SECURITY_UNCONFIRMED',
          '현재 보안 근거를 확인해야 합니다.',
        );
        requireCondition(
          ['read', 'write'].includes(String(request.params.kind)),
          404,
          'NOT_FOUND',
          '접점을 확인할 수 없습니다.',
        );
        if (request.params.kind === 'write') {
          await owners.store.journal.query('SELECT 1');
          await owners.store.primary.query('SELECT 1 FROM u1_protected_prefix LIMIT 1');
        }
        response.json({ state: 'READY', kind: request.params.kind });
      });
    }),
  );
  server.get(
    '/security/csrf',
    guarded(async (request, response) => {
      await security.admission(request);
      const browser = security.browser(request) ?? security.rotateBrowser(response);
      response.json({
        csrfToken: security.csrf(
          browser,
          security.cookieValue(request, purposeBridge.cookie) ?? security.session(request),
        ),
      });
    }),
  );
  server.post(
    '/identity/party-challenges',
    guarded(async (request, response) => {
      const budget = requestBudget(request),
        ingress = await budget.run(() => security.admission(request));
      void ingress;
      const browser = security.browser(request);
      requireCondition(browser, 401, 'BROWSER_BINDING_REQUIRED', '현재 당사자 접점을 확인하세요.');
      security.verifyMutation(
        request,
        browser,
        security.cookieValue(request, purposeBridge.cookie) ?? security.session(request),
      );
      requireCondition(
        request.body && Object.keys(request.body).length === 0,
        400,
        'PARTY_CHALLENGE_INPUT',
        '서버가 새 진행 challenge를 발급합니다.',
      );
      await budget.run(async () => {
        await configuration.activationAdmission?.();
        await u2Rate.admit(request.socket.remoteAddress ?? 'unknown-peer');
        const intent = await authIntents.purpose(browser),
          challengeId = randomUUID();
        await authIntents.attach(intent, 'CHALLENGE', challengeId);
        await authIntents.attachPartyContinuation(intent, challengeId);
        await authIntents.assertCurrent(intent);
        response.json({
          challengeId,
          expiresAt: new Date(owners.now().getTime() + 300000).toISOString(),
        });
      });
    }),
  );
  for (const route of [...API_ROUTES, ...U2_API_ROUTES]) {
    const u2 = 'version' in route ? (route as U2ApiRoute) : null;
    const version = u2?.version ?? 2;
    const operation = registry.lookup(route.owner, route.operation, version);
    if (!operation.audience.includes(configuration.audience)) continue;
    server[route.method](
      route.path,
      guarded(async (request, response) => {
        const correlation = request.headers['x-correlation-id'] ?? randomUUID();
        owners.store.schema.validate('Id', correlation);
        response.setHeader('X-Correlation-Id', String(correlation));
        requireCondition(
          !['x-principal-id', 'x-role', 'x-mfa-verified', 'x-staff-network'].some(
            (key) => request.headers[key] !== undefined,
          ),
          400,
          'CLIENT_AUTHORITY_FORBIDDEN',
          '서버 신원과 권한을 입력할 수 없습니다.',
        );
        const budget = requestBudget(request);
        budget.check();
        const ingress = await budget.run(() => security.admission(request));
        const session = security.session(request);
        const browser = security.browser(request);
        requireCondition(
          browser,
          401,
          'BROWSER_BINDING_REQUIRED',
          '인증 접점 정보를 새로 확인하세요.',
        );
        const purposeCookie = security.cookieValue(request, purposeBridge.cookie);
        if (route.method === 'post')
          security.verifyMutation(request, browser, purposeCookie ?? session);
        if (u2?.contextKind === 'PURPOSE')
          await authIntents.assertSession('u2-purpose:' + purposeCookie, browser);
        else if (!route.public && session) await authIntents.assertSession(session, browser);
        const call = {
          network: request.socket.remoteAddress ?? 'unknown-peer',
          ingress,
          incomingSession: session ?? undefined,
        } as {
          network: string;
          ingress: unknown;
          sessionToken?: string;
          browserBinding?: string;
          incomingSession?: string;
          ended?: boolean;
          subjectAccountId?: string;
        };
        let authIntent: HttpAuthIntent | null = null;
        let purposeContext: U2PurposeContext | null = null;
        let partyResult: PartyCookieMaterial | null = null;
        const u2Call: {
          ingress: unknown;
          network: string;
          purposeResult?: import('./u2-authentication.js').PurposeCookieMaterial;
        } = { ingress, network: call.network };
        const nextBinding = randomBytes(32).toString('base64url');
        const result = await budget.run(() =>
          IdentityBrowser.run({ current: browser, next: nextBinding }, () =>
            authenticationCall.run(call, () =>
              u2HttpCall.run(u2Call, async () => {
                await configuration.activationAdmission?.();
                const target = routeTarget(route, request);
                if (u2?.operation === 'issueInvitationPurpose' && target.kind === 'RECORD')
                  target.recordRef.owner = 'EnterpriseAccess';
                let data = u2
                  ? u2RouteInput(u2, request, target)
                  : routeInput(route, request, target);
                if (u2?.operation === 'reobserveHandoff') {
                  requireCondition(
                    request.headers.origin === configuration.origin,
                    403,
                    'ORIGIN_REJECTED',
                    '같은 원래 당사자 접점에서 결과를 확인하세요.',
                  );
                  const material = partyCookies.material(request, browser, true);
                  await authIntents.assertSession('u2-party:' + material.challengeId, browser);
                  data = {
                    partyContextRef: material.partyContextRef,
                    challengeId: material.challengeId,
                    partySecret: material.partySecret,
                  };
                }
                if (u2?.operation === 'claimHandoff') {
                  const submitted = data as Record<string, unknown>;
                  requireCondition(
                    !('partySecret' in submitted),
                    400,
                    'PARTY_SECRET_TRANSPORT',
                    '원래 서버 당사자 cookie를 사용하세요.',
                  );
                  const material = partyCookies.material(request, browser);
                  requireCondition(
                    submitted.challengeId === material.challengeId,
                    401,
                    'PARTY_COOKIE_REQUIRED',
                    '원래 당사자 진행을 확인하세요.',
                  );
                  data = { ...submitted, partySecret: material.partySecret };
                }
                const context = route.public
                  ? ({
                      attemptId:
                        u2 && (data as { challengeId?: string }).challengeId
                          ? String((data as { challengeId: string }).challengeId)
                          : randomUUID(),
                      audience: configuration.audience,
                      correlationId: String(correlation),
                      deadlineAt: budget.deadlineAt,
                    } satisfies PreIdentityContext)
                  : u2?.contextKind === 'PURPOSE'
                    ? (purposeContext = await purposeBridge.authenticate(
                        request,
                        browser,
                        u2.purpose!,
                        String(correlation),
                        ingress,
                        operation.kind === 'query',
                      ))
                    : await owners.identity.authenticate(
                        session ?? '',
                        configuration.audience,
                        String(correlation),
                        ingress,
                      );
                // Canonical input is checked before transport execution evidence is recorded.
                owners.store.schema.validateUri(operation.input, data);
                await (u2 && (route.public || u2.contextKind === 'PURPOSE')
                  ? u2Rate.admit(
                      call.network,
                      (data as { loginIdentifier?: string }).loginIdentifier,
                      u2.purpose === 'INVITATION_ACCEPTANCE' && target.kind === 'RECORD'
                        ? target.recordRef.id
                        : undefined,
                    )
                  : undefined);
                if (route.public && route.owner === 'IdentityRecovery') {
                  authIntent = ['requestRecovery', 'reobserveHandoff'].includes(u2?.operation ?? '')
                    ? await authIntents.purpose(browser)
                    : !u2 && route.operation === 'startLogin'
                      ? await authIntents.start(browser)
                      : await authIntents.challenge(
                          (data as { challengeId: string }).challengeId,
                          browser,
                        );
                }
                if (u2?.operation === 'issueInvitationPurpose')
                  authIntent = await authIntents.purpose(browser);
                if (u2?.operation === 'beginRecoveryEnrollment')
                  await authIntents.challenge(
                    (data as { passwordChallengeId: string }).passwordChallengeId,
                    browser,
                  );
                const atomic =
                  !route.public && isPrimaryAtomicCommand(route.owner, route.operation);
                const attempts = new HttpAttempts(owners.store.primary);
                const original = atomic
                  ? {
                      owner: route.owner,
                      operation: route.operation,
                      target,
                      clientRequestId: (data as { meta: { clientRequestId: string } }).meta
                        .clientRequestId,
                    }
                  : null;
                const attemptId =
                  original && 'principalId' in context
                    ? await attempts.begin(context, original, await owners.store.currentEpoch())
                    : null;
                let value: unknown;
                try {
                  const invoke = () =>
                    registry.invoke(route.owner, route.operation, version, {
                      context,
                      target,
                      data,
                    } as Invocation | U2Invocation);
                  value = u2
                    ? await (configuration.audience === 'STAFF' ? u2PrivateWork : u2PublicWork).run(
                        budget,
                        () => u2CryptoWork.run(budget, invoke),
                      )
                    : await invoke();
                } catch (error) {
                  if (attemptId && budget.remaining() >= 4000)
                    await attempts.finish(
                      attemptId,
                      error instanceof OmsError ? error.code : null,
                      true,
                    );
                  throw error;
                }
                if (u2?.operation === 'createPartyContext') {
                  partyResult = value as PartyCookieMaterial;
                  call.browserBinding = nextBinding;
                  const { partySecret: privateSecret, ...publicValue } = partyResult;
                  void privateSecret;
                  value = publicValue;
                }
                if (authIntent) {
                  await authIntents.assertCurrent(authIntent);
                  const challenge = (value as { challengeId?: string }).challengeId;
                  if (challenge) await authIntents.attach(authIntent, 'CHALLENGE', challenge);
                  if (call.sessionToken)
                    await authIntents.attach(authIntent, 'SESSION', call.sessionToken);
                  if (call.sessionToken || call.browserBinding)
                    await authIntents.attach(
                      authIntent,
                      'BROWSER',
                      call.sessionToken ? nextBinding : call.browserBinding!,
                    );
                }
                // 실제 password 결과와 현재 동일 계정의 제한 권위만 새 접점으로 옮긴다.
                // 기존 제한 기한/세대는 유지하고 일반 session은 만들지 않는다.
                if (
                  !u2 &&
                  call.browserBinding &&
                  !call.sessionToken &&
                  call.subjectAccountId &&
                  purposeCookie
                ) {
                  try {
                    const material = purposeBridge.material(request, browser),
                      source = await owners.store.currentProtected(
                        'EnrollmentAuthority',
                        material.authorityRef.id,
                      );
                    if (
                      (source?.accountRef as { id?: string } | undefined)?.id ===
                      call.subjectAccountId
                    ) {
                      const limited = await purposeBridge.authenticate(
                        request,
                        browser,
                        material.purpose,
                        String(correlation),
                        ingress,
                        true,
                      );
                      if (limited.subjectAccountRef.id === call.subjectAccountId)
                        u2Call.purposeResult = { ...material, authorityRef: limited.authorityRef };
                    }
                  } catch (error) {
                    if (!(error instanceof OmsError))
                      throw error; /* 만료/회수 목적 cookie를 새 로그인 권위로 이월하지 않는다. */
                  }
                }
                if (attemptId && budget.remaining() >= 4000)
                  await attempts.finish(attemptId, null, true);
                if (!route.public && u2?.contextKind !== 'PURPOSE')
                  await owners.identity.recordRegisteredActivity(
                    session!,
                    configuration.audience,
                    route.operation,
                    String(correlation),
                    ingress,
                  );
                return value;
              }),
            ),
          ),
        );
        budget.check();
        requireCondition(
          !request.aborted,
          503,
          'CLIENT_DISCONNECTED',
          '원래 요청 결과를 다시 확인하세요.',
        );
        const body = JSON.stringify(result);
        requireCondition(
          Buffer.byteLength(body) <= 4 * 1024 * 1024,
          503,
          'RESPONSE_LIMIT',
          '결과를 제한된 페이지로 다시 조회하세요.',
        );
        response.locals.omsKnowledge = resultKnowledge(result);
        // Logout invalidates its original server session only. A late response
        // must not expire or rotate cookies installed by a newer login/tab.
        if (authIntent) await authIntents.assertCurrent(authIntent);
        if (purposeContext) await purposeBridge.assertCurrent(purposeContext);
        if (call.sessionToken) security.establish(response, call.sessionToken, nextBinding);
        else if (call.browserBinding) security.rotateBrowser(response, call.browserBinding);
        if (partyResult)
          partyCookies.establish(response, partyResult, call.browserBinding ?? browser);
        if (u2Call.purposeResult) {
          requireCondition(
            authIntent,
            503,
            'PURPOSE_RESPONSE_FENCE',
            '원래 당사자 응답 fence가 필요합니다.',
          );
          await budget.run(() =>
            owners.identity.authenticatePurpose(
              u2Call.purposeResult!.authorityRef,
              u2Call.purposeResult!.handle,
              u2Call.purposeResult!.purpose,
              String(correlation),
              ingress,
              u2?.operation !== 'reobserveHandoff',
            ),
          );
          if (u2?.operation === 'reobserveHandoff')
            requireCondition(
              (
                await owners.store.currentProtected(
                  'EnrollmentAuthority',
                  u2Call.purposeResult.authorityRef.id,
                )
              )?.state === 'ACTIVE',
              401,
              'CLAIM_RESULT_UNAVAILABLE',
              '현재 ACTIVE 원래 결과만 재관측합니다.',
            );
          const installed = await purposeBridge.establish(
            response,
            u2Call.purposeResult,
            call.browserBinding ?? browser,
          );
          await authIntents.attach(authIntent, 'SESSION', 'u2-purpose:' + installed);
          await authIntents.assertCurrent(authIntent);
        }
        budget.check();
        response
          .status(operation.kind === 'command' && !route.public ? 202 : 200)
          .type('application/json')
          .send(body);
      }),
    );
  }
  server.use((_request, _response, next) =>
    next(new OmsError(404, 'NOT_FOUND', '접점을 확인할 수 없습니다.')),
  );
  server.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    void request;
    void _next;
    const classified =
      error instanceof OmsError
        ? error
        : new OmsError(
            (error as { type?: string })?.type === 'entity.too.large'
              ? 413
              : (error as { type?: string })?.type === 'entity.parse.failed'
                ? 400
                : 503,
            'REQUEST_UNAVAILABLE',
            '요청의 원래 결과를 확인하세요.',
          );
    const correlation = String(response.getHeader('X-Correlation-Id') ?? randomUUID());
    response.removeHeader('Set-Cookie');
    if (
      classified.status === 429 ||
      ['U2_QUEUE_FULL', 'U2_QUEUE_WAIT', 'U2_RATE_CAPACITY'].includes(classified.code)
    )
      response.setHeader('Retry-After', '1');
    response
      .status(classified.status)
      .type('application/problem+json')
      .json({
        type: 'urn:oms:problem:' + classified.code.toLowerCase(),
        title: classified.status < 500 ? '요청을 확인하세요' : '처리 결과 확인이 필요합니다',
        status: classified.status,
        detail: classified.message,
        correlationId: correlation,
      });
  });
  await app.init();
  return { app, server, registry, security };
}
