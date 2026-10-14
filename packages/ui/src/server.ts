import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tlsConfiguration } from '@oms/integrations';
import { requireCondition } from '@oms/contracts';
// Next's official custom-server API is needed for task-local TLS behind TCP NLB.
// It is not combined with standalone output tracing.
const next = createRequire(import.meta.url)('next') as typeof import('next').default;
export async function startWeb(
  audience: 'CUSTOMER' | 'STAFF',
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  requireCondition(
    env.NODE_ENV === 'production' && !env.OMS_LOCAL_SYNTHETIC,
    503,
    'WEB_PRODUCTION_PROFILE',
    '실제 TLS 업무 접점 구성이 필요합니다.',
  );
  const origin = new URL(env.OMS_WEB_ORIGIN ?? '');
  requireCondition(
    origin.protocol === 'https:' && origin.origin === env.OMS_WEB_ORIGIN,
    503,
    'WEB_ORIGIN_CONFIGURATION',
    '검증된 업무 origin이 필요합니다.',
  );
  const port = Number(env.PORT);
  requireCondition(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    503,
    'WEB_LISTENER_CONFIGURATION',
    '유한 TLS listener가 필요합니다.',
  );
  const app = next({
    dev: false,
    dir,
    hostname: origin.hostname,
    port: Number(origin.port || 443),
  });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer(tlsConfiguration(env, origin.hostname), (request, response) => {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.url === '/health/live') {
      response.end(JSON.stringify({ state: 'LIVE', audience }));
      return;
    }
    if (request.headers.host !== origin.host) {
      response.writeHead(403);
      response.end('허용된 업무 접점이 아닙니다.');
      return;
    }
    // Derive proxy metadata only from this verified TLS listener and fixed host.
    delete request.headers['x-forwarded-for'];
    delete request.headers['x-real-ip'];
    request.headers['x-forwarded-proto'] = 'https';
    request.headers['x-forwarded-host'] = origin.host;
    request.headers['x-forwarded-port'] = origin.port || '443';
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503);
      response.end('원래 요청 결과를 확인하세요.');
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  await new Promise<void>((done) => server.listen(port, '0.0.0.0', done));
  const close = async () => {
    const timer = setTimeout(() => server.closeAllConnections(), 15000);
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    clearTimeout(timer);
    await app.close();
  };
  return { server, close };
}
