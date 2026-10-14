import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function runCommand(
  command: string,
  args: readonly string[],
  logPath: string,
  timeoutMilliseconds = 600000,
): Promise<void> {
  if (
    !Number.isInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1 ||
    timeoutMilliseconds > 3600000
  )
    throw new Error('검사 도구의 유한 실행 기한이 필요합니다.');
  mkdirSync(dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { mode: 0o600 });
  return new Promise((resolve, reject) => {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      SEMGREP_SEND_METRICS: 'off',
      SEMGREP_ENABLE_VERSION_CHECK: '0',
    };
    delete environment.SEMGREP_APP_TOKEN;
    const child = spawn(command, [...args], {
      shell: false,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let expired = false;
    const deadline = setTimeout(() => {
      expired = true;
      child.kill('SIGTERM');
    }, timeoutMilliseconds);
    const force = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMilliseconds + 5000);
    child.once('error', (error) => {
      clearTimeout(deadline);
      clearTimeout(force);
      log.end();
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(deadline);
      clearTimeout(force);
      log.end(() => {
        if (code === 0 && !expired) resolve();
        else
          reject(
            new Error('검사 도구 실패/기한 초과: ' + command + ' exit=' + code + '; ' + logPath),
          );
      });
    });
  });
}
