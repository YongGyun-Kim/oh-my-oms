import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { context, trace, ROOT_CONTEXT, TraceFlags } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  RuntimeTelemetry,
  correlationHash,
  httpOutcome,
  resultKnowledge,
  collectorEndpoint,
} from '@oms/integrations';
const received: { path: string; body: string }[] = [];
let hang = false;
let telemetry: RuntimeTelemetry;
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', () => {
    received.push({ path: request.url!, body: Buffer.concat(chunks).toString('utf8') });
    if (!hang) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    }
  });
});
beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('합성 collector 주소');
  telemetry = new RuntimeTelemetry(
    'http://127.0.0.1:' + address.port,
    true,
    new Set(['IdentityRecovery.readIdentity', 'NotificationDelivery.materialiseInApp']),
  );
});
afterAll(async () => {
  hang = false;
  try {
    await telemetry.close();
  } finally {
    trace.disable();
    context.disable();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
describe('실제 OTel SDK/OTLP·100%대상·최소metadata·유한손실', () => {
  it('실제 등록 요청의 span/metric을 collector에 전송하고 중복finish는 세지 않는다', async () => {
    const span = telemetry.begin(
      'api',
      'CUSTOMER',
      'IdentityRecovery.readIdentity',
      'one-correlation',
    );
    span.finish({ outcome: 'SUCCESS', status: 200 });
    span.finish({ outcome: 'SUCCESS' });
    await telemetry.flush();
    expect(telemetry.snapshot().completed).toBe(1);
    expect(
      received.some(
        (row) => row.path === '/v1/traces' && row.body.includes('IdentityRecovery.readIdentity'),
      ),
    ).toBe(true);
    expect(received.some((row) => row.path === '/v1/metrics')).toBe(true);
  });
  it('credential/body/메일·오류stack·상관ID 원문을 수집하지 않는다', async () => {
    const span = telemetry.begin(
      'api',
      'STAFF',
      'IdentityRecovery.readIdentity',
      'credential-canary',
    );
    span.finish({ outcome: 'TECHNICAL_FAILURE', status: 503 });
    await telemetry.flush();
    const text = received.map((row) => row.body).join('');
    expect(text).not.toContain('credential-canary');
    expect(text).not.toContain('password');
    expect(text).not.toContain('Cookie');
    expect(text).toContain(correlationHash('credential-canary'));
  });
  it('클라이언트 unsampled 부모문맥도 AlwaysOn 대상 span을 억제하지 않는다', async () => {
    const parent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      traceFlags: TraceFlags.NONE,
      isRemote: true,
    });
    context.with(parent, () =>
      telemetry
        .begin('api', 'CUSTOMER', 'IdentityRecovery.readIdentity', 'unsampled-correlation')
        .finish({ outcome: 'SUCCESS' }),
    );
    await telemetry.flush();
    expect(
      received
        .filter((row) => row.path === '/v1/traces')
        .some((row) => row.body.includes('1'.repeat(32))),
    ).toBe(true);
  });
  it('202/권한거절/업무거절/과부하/기술실패를 다른 분모로 분류한다', () =>
    expect([202, 403, 409, 429, 503].map(httpOutcome)).toEqual([
      'ACCEPTED_NOT_COMPLETED',
      'ACCESS_REFUSAL',
      'BUSINESS_REFUSAL',
      'OVERLOADED',
      'TECHNICAL_FAILURE',
    ]));
  it('등록된 provider knowledge만 읽고 업무 본문/근거를 전송하지 않는다', () =>
    expect(
      resultKnowledge({
        data: {
          lines: [
            {
              assessments: [
                { knowledge: 'UNKNOWN', secret: 'do-not-export' },
                { knowledge: 'UNAVAILABLE' },
              ],
            },
          ],
        },
        password: 'do-not-export',
      }),
    ).toEqual(['UNKNOWN', 'UNAVAILABLE']));
  it('상품 존재 KNOWN과 실제가격 UNKNOWN·판단 CONFLICT/UNAVAILABLE을 별도로 보존한다', () => {
    expect(
      new Set(
        resultKnowledge({
          items: [
            {
              knowledge: 'KNOWN',
              data: {
                priceKnowledge: 'UNKNOWN',
                resolvedPrice: null,
                commonPrice: { amount: '10000', currency: 'KRW' },
              },
            },
          ],
          data: {
            lines: [{ assessments: [{ knowledge: 'CONFLICT' }, { knowledge: 'UNAVAILABLE' }] }],
          },
          observedAt: 'not-a-state',
        }),
      ),
    ).toEqual(new Set(['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE']));
  });
  it('미등록 operation/actor label과 가짜collector/범위 밖 상관ID는fail closed다', () => {
    expect(() =>
      telemetry.begin('api', 'UNKNOWN', 'IdentityRecovery.readIdentity', 'one'),
    ).toThrow();
    expect(() => telemetry.begin('api', 'CUSTOMER', 'Unregistered.do', 'one')).toThrow();
    expect(() => correlationHash('')).toThrow();
    expect(() => correlationHash('x'.repeat(129))).toThrow();
    expect(() => collectorEndpoint('http://example.com', true)).toThrow();
    expect(correlationHash('원래:요청.번호')).toHaveLength(64);
    expect(correlationHash('💻'.repeat(128))).toHaveLength(64);
  });
  it('512queue/64batch/1초 설정·초과drop을 실제SDK 지표에 남긴다', async () => {
    expect(telemetry.limits).toMatchObject({ queue: 512, batch: 64, flushMilliseconds: 1000 });
    for (let i = 0; i < 2000; i++)
      telemetry
        .begin('api', 'CUSTOMER', 'IdentityRecovery.readIdentity', 'burst-' + i)
        .finish({ outcome: 'SUCCESS' });
    await telemetry.flush();
    expect(telemetry.snapshot().pendingOrDroppedOrFailed).toBeGreaterThan(0);
    const text = received
      .filter((row) => row.path === '/v1/metrics')
      .map((row) => row.body)
      .join('');
    expect(text).toContain('dropped');
  });
  it('느린/미응답 collector는 업무 종료를 막지 않고 유한export실패가 된다', async () => {
    hang = true;
    const start = performance.now();
    telemetry
      .begin('worker', 'SYSTEM', 'NotificationDelivery.materialiseInApp', 'slow-collector')
      .finish({ outcome: 'SUCCESS', eligibleDelayMilliseconds: 100 });
    expect(performance.now() - start).toBeLessThan(500);
    await telemetry.flush().catch(() => undefined);
    await expect
      .poll(() => telemetry.snapshot().exportFailures, { timeout: 1500 })
      .toBeGreaterThan(0);
    hang = false;
    server.closeAllConnections();
  });
});
