import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { ObservationPort } from '@oms/contracts';
import { httpOutcome } from '@oms/integrations';
import { API_ROUTES } from './routes.js';
import { U2_API_ROUTES } from './u2-routes.js';
export const apiObservationOperations = new Set([
  ...API_ROUTES.map((route) => route.owner + '.' + route.operation),
  ...U2_API_ROUTES.map((route) => route.owner + '.' + route.operation),
  'HTTP.party-challenge',
  'HTTP.live',
  'HTTP.ready',
  'HTTP.csrf',
  'HTTP.unregistered',
]);
export function observeHttp(
  server: Express,
  port: ObservationPort | undefined,
  audience: 'CUSTOMER' | 'STAFF',
): void {
  if (!port) return;
  server.use((request, response, next) => {
    const route = [...API_ROUTES, ...U2_API_ROUTES].find(
      (candidate) =>
        candidate.method === request.method.toLowerCase() &&
        new RegExp(
          '^' +
            candidate.path
              .split('/')
              .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment))
              .join('/') +
            '$',
        ).test(request.path),
    );
    const operation = route
      ? route.owner + '.' + route.operation
      : request.path === '/health/live'
        ? 'HTTP.live'
        : request.path.startsWith('/health/ready/')
          ? 'HTTP.ready'
          : request.path === '/security/csrf'
            ? 'HTTP.csrf'
            : request.path === '/identity/party-challenges'
              ? 'HTTP.party-challenge'
              : 'HTTP.unregistered';
    const incoming = request.headers['x-correlation-id'];
    const correlation =
      typeof incoming === 'string' &&
      Array.from(incoming).length >= 1 &&
      Array.from(incoming).length <= 128
        ? incoming
        : randomUUID();
    let observation;
    try {
      observation = port.begin('api', audience, operation, correlation);
    } catch {
      console.error(
        JSON.stringify({
          event: 'telemetry-start-failed',
          role: 'api',
          businessOutcomeUnchanged: true,
        }),
      );
      next();
      return;
    }
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      try {
        observation.finish({
          outcome: httpOutcome(response.writableFinished ? response.statusCode : 0),
          status: response.writableFinished ? response.statusCode : 0,
          knowledge: response.locals.omsKnowledge,
        });
      } catch {
        console.error(
          JSON.stringify({
            event: 'telemetry-finish-failed',
            role: 'api',
            businessOutcomeUnchanged: true,
          }),
        );
      }
    };
    response.once('finish', complete);
    response.once('close', complete);
    next();
  });
}
