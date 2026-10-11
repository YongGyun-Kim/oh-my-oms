import { readFileSync } from 'node:fs';
import type { Operation, OperationRegistry } from './registry.js';

// Profile revision and operation-registry version are separate axes.
export const U3_PROFILE = 'urn:oms:contract:u3-commercial:2';
export const U3_REGISTRY_VERSION = 3;
export function declareU3Operations(registry: OperationRegistry): void {
  const operations = JSON.parse(
    readFileSync(new URL('../schemas/u3-operations-v2.json', import.meta.url), 'utf8'),
  ) as Operation[];
  for (const operation of operations) registry.declare(operation);
}
