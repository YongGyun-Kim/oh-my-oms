import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { observeHttp } from '../../../apps/api/src/observation.js';
import type { ObservationPort, ObservationCompletion } from '@oms/contracts';
async function request(
  port: ObservationPort,
  status: number,
  headers: Record<string, string> = {},
) {
  const app = express();
  observeHttp(app, port, 'CUSTOMER');
  app.get('/health/live', (_request, response) =>
    response.status(status).json({ actual: 'business-result' }),
  );
  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('합성 HTTP 주소');
  try {
    const result = await fetch('http://127.0.0.1:' + address.port + '/health/live', { headers });
    return { status: result.status, body: await result.json() };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
describe('실제 HTTP 관측은 업무 결과/접근 기준을 변경하지 않는다', () => {
  for (const stage of ['begin', 'finish'])
    for (const status of [200, 403, 503])
      it(stage + ' 실패에도 실제 ' + status + ' 업무 응답을 유지한다', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
          const port: ObservationPort = {
            begin: () => {
              if (stage === 'begin') throw new Error('합성 관측 장애');
              return {
                finish: () => {
                  throw new Error('합성 exporter 장애');
                },
              };
            },
          };
          expect(await request(port, status)).toEqual({
            status,
            body: { actual: 'business-result' },
          });
          expect(log).toHaveBeenCalled();
        } finally {
          log.mockRestore();
        }
      });
  it('클라이언트 unsampled trace header가 등록 요청의 관측을 억제하지 않는다', async () => {
    const finish = vi.fn();
    const begin = vi.fn(() => ({ finish }));
    await request({ begin }, 200, {
      traceparent: '00-' + '1'.repeat(32) + '-' + '2'.repeat(16) + '-00',
      'x-correlation-id': 'original:request.1',
    });
    expect(begin).toHaveBeenCalledWith('api', 'CUSTOMER', 'HTTP.live', 'original:request.1');
    expect(finish).toHaveBeenCalledOnce();
    expect(finish.mock.calls[0]![0]).toMatchObject({ outcome: 'SUCCESS', status: 200 });
  });
  it('실제 권한 거절과 과부하는 성공 분모에 들어가지 않는다', async () => {
    const outcomes: ObservationCompletion[] = [];
    const port: ObservationPort = { begin: () => ({ finish: (value) => outcomes.push(value) }) };
    await request(port, 403);
    await request(port, 429);
    expect(outcomes.map((value) => value.outcome)).toEqual(['ACCESS_REFUSAL', 'OVERLOADED']);
  });
});
