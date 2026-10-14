import { readFileSync } from 'node:fs';
import type { Operation, OperationRegistry } from './registry.js';

export const U4_PROFILE = 'urn:oms:contract:u4-financial:1';
export const U4_REGISTRY_VERSION = 4;
export function declareU4Operations(registry: OperationRegistry): void {
  const operations = JSON.parse(
    readFileSync(new URL('../schemas/u4-operations-v1.json', import.meta.url), 'utf8'),
  ) as Operation[];
  for (const operation of operations) registry.declare(operation);
}
