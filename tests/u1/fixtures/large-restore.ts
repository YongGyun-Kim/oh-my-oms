import { writeFileSync } from 'node:fs';
import { restoreFromJournal } from '@oms/persistence';
import { localSources } from './databases.js';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('합성 큰 복구 fixture만 허용합니다.');
const sources = localSources();
await sources.primaryAdmin.initialize();
await sources.journalAdmin.initialize();
let replayed = 0;
try {
  const report = await restoreFromJournal(
    sources.primaryAdmin,
    sources.journalAdmin,
    async (observation) => {
      if (
        observation.phase === 'REPLAYED' &&
        ++replayed === 50 &&
        process.argv.includes('--interrupt-at-50')
      ) {
        console.log(
          JSON.stringify({
            phase: 'PARTIAL_REPLAY_READY',
            replayed,
            rss: process.memoryUsage().rss,
          }),
        );
        await new Promise<void>(() => {
          /* Parent deliberately sends real SIGKILL here. */
        });
      }
      if (replayed % 1000 === 0 && observation.phase === 'REPLAYED')
        console.log(
          JSON.stringify({ phase: 'REPLAY_PROGRESS', replayed, rss: process.memoryUsage().rss }),
        );
    },
  );
  writeFileSync('.reports/u1/large-restore-result.json', JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      phase: 'RESTORED',
      entries: report.entries,
      rows: report.rows,
      rss: process.memoryUsage().rss,
    }),
  );
} finally {
  await sources.primaryAdmin.destroy();
  await sources.journalAdmin.destroy();
}
