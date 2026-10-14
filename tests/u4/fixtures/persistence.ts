import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import {
  ProtectedStore,
  U4Repository,
  U4_SOURCE_CONTRACT,
  type WriteRequest,
} from '@oms/persistence';
import { initializeU4Databases, resetU4Databases, u4Sources } from './databases.js';

export function financialRequest(key = randomUUID()): WriteRequest {
  return {
    principalId: 'synthetic-staff',
    audience: 'STAFF',
    owner: 'FinancialSettlement',
    operation: 'synthetic-persistence',
    target: null,
    idempotencyKey: key,
    input: { synthetic: true },
    correlationId: randomUUID(),
    epoch: 'initial',
    sourceContract: U4_SOURCE_CONTRACT,
  };
}
export function persistenceFixture() {
  const sources = u4Sources();
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  const repository = new U4Repository(store);
  beforeAll(async () => {
    await initializeU4Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU4Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  return { sources, store, repository };
}
export function barrier(participants: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    if (++arrived === participants) release();
    await ready;
  };
}
