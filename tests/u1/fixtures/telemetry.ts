import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
import { RuntimeTelemetry, correlationHash } from '@oms/integrations';
import { apiObservationOperations } from '../../../apps/api/src/observation.js';
import type { ObservationPort } from '@oms/contracts';
// Explicitly local, bounded OTLP collector. It proves SDK delivery to this
// synthetic endpoint, never Seoul CloudWatch/backend retention or real alerts.
export async function fixtureTelemetry(queueSnapshot?: () => Record<string, unknown>) {
  let traceBatches = 0;
  let metricBatches = 0;
  let bytes = 0;
  let rejected = 0;
  const server = createServer((request, response) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        rejected++;
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      bytes += size;
      if (request.url === '/v1/traces') traceBatches++;
      else if (request.url === '/v1/metrics') metricBatches++;
      else {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 25;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('합성 collector 주소');
  const sdk = new RuntimeTelemetry(
    'http://127.0.0.1:' + address.port,
    true,
    new Set([
      ...apiObservationOperations,
      'NotificationDelivery.relay',
      'NotificationDelivery.consume',
      'NotificationDelivery.firstProcessing',
    ]),
  );
  const port: ObservationPort = {
    begin: (role, audience, operation, correlation) => {
      const observation = sdk.begin(role, audience, operation, correlation);
      let complete = false;
      return {
        finish: (metadata) => {
          if (complete) return;
          complete = true;
          observation.finish(metadata);
          if (operation === 'NotificationDelivery.consume')
            appendFileSync(
              '.reports/u1/worker-consume.jsonl',
              JSON.stringify({
                observedAt: new Date().toISOString(),
                correlationHash: correlationHash(correlation),
                operation,
                outcome: metadata.outcome,
              }) + '\n',
              { mode: 0o600 },
            );
          if (metadata.eligibleDelayMilliseconds !== undefined)
            appendFileSync(
              '.reports/u1/worker-first-start.jsonl',
              JSON.stringify({
                observedAt: new Date().toISOString(),
                correlationHash: correlationHash(correlation),
                operation,
                outcome: metadata.outcome,
                delayMilliseconds: metadata.eligibleDelayMilliseconds,
              }) + '\n',
              { mode: 0o600 },
            );
        },
      };
    },
  };
  const save = () =>
    writeFileSync(
      '.reports/u1/telemetry-live.json',
      JSON.stringify(
        {
          synthetic: true,
          realDeliveryVerified: false,
          observedAt: new Date().toISOString(),
          collector: { traceBatches, metricBatches, bytes, rejected },
          sdk: sdk.snapshot(),
          process: { rss: process.memoryUsage().rss, cpuMicroseconds: process.cpuUsage() },
          queue: queueSnapshot?.() ?? null,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  const timer = setInterval(save, 5000);
  timer.unref();
  return {
    port,
    close: async () => {
      clearInterval(timer);
      await sdk.close();
      save();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
