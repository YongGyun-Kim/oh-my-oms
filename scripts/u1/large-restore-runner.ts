import { spawn } from 'node:child_process';
export async function runRestore(interrupt: boolean, faultAt: string) {
  if (!Number.isFinite(Date.parse(faultAt)) || Date.parse(faultAt) > Date.now())
    throw new Error('원래 복구 장애 t0가 필요합니다.');
  const child = spawn(
    'node',
    [
      '--import',
      'tsx',
      'tests/u1/fixtures/large-restore.ts',
      ...(interrupt ? ['--interrupt-at-50'] : []),
    ],
    { env: process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let killed = false;
  let output = '';
  let diagnosticBytes = 0;
  let streamError: unknown = null;
  let peakRss = 0;
  const remaining = Math.max(1, Date.parse(faultAt) + 30 * 60000 - Date.now());
  const deadline = setTimeout(() => child.kill('SIGKILL'), remaining);
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    if (output.length > 65536) {
      streamError = new Error('복구 관측 stream 한도');
      child.kill('SIGKILL');
      return;
    }
    for (;;) {
      const index = output.indexOf('\n');
      if (index < 0) break;
      const line = output.slice(0, index);
      output = output.slice(index + 1);
      let event: { phase: string; rss: number };
      try {
        event = JSON.parse(line);
        if (typeof event.phase !== 'string' || !Number.isFinite(event.rss) || event.rss < 1)
          throw new Error('관측 형식');
      } catch (error) {
        streamError = error;
        child.kill('SIGKILL');
        return;
      }
      peakRss = Math.max(peakRss, event.rss);
      if (event.phase === 'PARTIAL_REPLAY_READY' && interrupt) {
        killed = true;
        child.kill('SIGKILL');
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    diagnosticBytes += Buffer.byteLength(chunk);
    if (diagnosticBytes > 65536) {
      streamError = new Error('복구 진단 한도');
      child.kill('SIGKILL');
    }
  });
  let exit: { code: number | null; signal: string | null };
  try {
    exit = await new Promise<{ code: number | null; signal: string | null }>((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => done({ code, signal }));
    });
  } finally {
    clearTimeout(deadline);
  }
  if (streamError) throw new Error('실제 복구 child 관측 오류');
  if (interrupt ? !killed || exit.signal !== 'SIGKILL' : exit.code !== 0)
    throw new Error('실제 큰 복구 프로세스 종료/재시작 검증 실패: ' + JSON.stringify(exit));
  return { exit, peakRss, interrupted: killed };
}
