import { readFileSync } from 'node:fs';
import type { Operation } from './registry.js';
import { OperationRegistry } from './registry.js';
export function declareFoundationOperations(registry: OperationRegistry): void {
  const operations = JSON.parse(
    readFileSync(new URL('../schemas/operations-v2.json', import.meta.url), 'utf8'),
  ) as Operation[];
  for (const operation of operations) registry.declare(operation);
}
