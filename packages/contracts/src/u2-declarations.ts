import { readFileSync } from 'node:fs';
import type { Operation, OperationRegistry } from './registry.js';

export const U2_PROFILE = 'urn:oms:contract:u2-access-additions:1';
export function declareU2Operations(registry: OperationRegistry): void {
  const operations = JSON.parse(
    readFileSync(new URL('../schemas/u2-operations-v1.json', import.meta.url), 'utf8'),
  ) as Operation[];
  for (const operation of operations) registry.declare(operation);
}
