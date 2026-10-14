import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fingerprint } from '@oms/contracts';
export function runtimeSourceIdentity(
  ports = { readFileSync, readdirSync, lstatSync },
): Record<string, string> {
  const identity: Record<string, string> = {};
  function collect(path: string) {
    for (const name of ports.readdirSync(path).sort()) {
      if (['node_modules', '.next', 'dist'].includes(name)) continue;
      const file = path + '/' + name;
      const status = ports.lstatSync(file);
      if (status.isSymbolicLink())
        throw new Error('측정 source의 symbolic link는 확인해야 합니다.');
      if (status.isDirectory()) collect(file);
      else {
        if (
          !status.isFile() ||
          Object.keys(identity).length >= 20000 ||
          status.size > 4 * 1024 * 1024
        )
          throw new Error('측정 source의 유한 파일 범위를 확인해야 합니다.');
        identity[file] = createHash('sha256').update(ports.readFileSync(file)).digest('hex');
      }
    }
  }
  for (const path of ['apps', 'packages', 'infra/cdk', 'scripts/u1', 'tests/u1']) collect(path);
  return identity;
}
export function runtimeSourceDigest(identity: Record<string, string>): string {
  return fingerprint(identity);
}
