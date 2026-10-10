import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWeb } from '@oms/ui/server';
const host = await startWeb('CUSTOMER', dirname(fileURLToPath(import.meta.url)));
process.once('SIGTERM', () => {
  void host.close().catch(() => {
    process.exitCode = 1;
  });
});
process.once('SIGINT', () => {
  void host.close().catch(() => {
    process.exitCode = 1;
  });
});
