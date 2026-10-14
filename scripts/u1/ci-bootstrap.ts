import { mkdirSync } from 'node:fs';
import { initializeDatabases } from '../../tests/u1/fixtures/migrate.js';
import { runCommand } from './process.js';
mkdirSync('.reports/u1', { recursive: true, mode: 0o700 });
await runCommand(
  'node',
  ['--import', 'tsx', 'scripts/u1/local-databases.ts'],
  '.reports/u1/ci-databases.log',
);
// A fresh CI PG must first register the original minimal non-public SQL roles.
// No data reset occurs here; ordinary suites use separately owned empty DBs.
await initializeDatabases();
await runCommand(
  'node',
  ['--import', 'tsx', 'scripts/u1/prepare-test-databases.ts'],
  '.reports/u1/ci-test-databases.log',
);
