import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from './process.js';
export function trivyArchive(platform: string, architecture: string) {
  const entries: Record<string, { file: string; sha256: string }> = {
    'linux-x64': {
      file: 'trivy_0.75.0_Linux-64bit.tar.gz',
      sha256: 'c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f',
    },
    'linux-arm64': {
      file: 'trivy_0.75.0_Linux-ARM64.tar.gz',
      sha256: 'a1ee9f6ffb7d112b64ff726a2a0717c21175c1114361391f4a132956751a13b3',
    },
    'darwin-arm64': {
      file: 'trivy_0.75.0_macOS-ARM64.tar.gz',
      sha256: '4a77108cccf8e55c8d6823e1e759939a622277e66cd0daa3c1fc621ed69e4568',
    },
    'darwin-x64': {
      file: 'trivy_0.75.0_macOS-64bit.tar.gz',
      sha256: '291edaa9778acbe4693d067b5ad60ee11570e5ac68296e85595417528ca641e4',
    },
  };
  const selected = entries[platform + '-' + architecture];
  if (!selected) throw new Error('검증되지 않은 보안 도구 platform입니다.');
  return {
    ...selected,
    url: 'https://github.com/aquasecurity/trivy/releases/download/v0.75.0/' + selected.file,
  };
}
export function verifyToolArchive(bytes: Uint8Array, expected: string): void {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    createHash('sha256').update(bytes).digest('hex') !== expected
  )
    throw new Error('공식 고정 보안 도구 checksum이 다릅니다.');
}
export function projectToolDirectory(workspace: string): string {
  const root = realpathSync(workspace),
    directory = resolve(root, '.runtime/u1/tools');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory)
    throw new Error('프로젝트 도구 경로의 symlink를 허용하지 않습니다.');
  return directory;
}
async function download(url: string, expected: string, path: string): Promise<void> {
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink())
      throw new Error('도구 archive symlink를 허용하지 않습니다.');
    verifyToolArchive(readFileSync(path), expected);
    return;
  }
  const signal = AbortSignal.timeout(60000),
    response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('공식 보안 도구 download가 미확인입니다.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024 * 1024) throw new Error('보안 도구 archive 유한 범위를 초과했습니다.');
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    verifyToolArchive(bytes, expected);
    writeFileSync(path, bytes, { mode: 0o600 });
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function bootstrapTools(): Promise<void> {
  if (process.version !== 'v22.23.3') throw new Error('프로젝트 전용 Node22.23.3이 필요합니다.');
  mkdirSync('.reports/u1', { recursive: true, mode: 0o700 });
  const directory = projectToolDirectory(process.cwd()),
    selected = trivyArchive(process.platform, process.arch),
    archive = resolve(directory, selected.file);
  await download(selected.url, selected.sha256, archive);
  const binary = resolve(directory, 'trivy');
  if (existsSync(binary) && lstatSync(binary).isSymbolicLink())
    throw new Error('도구 binary symlink를 허용하지 않습니다.');
  await runCommand(
    'tar',
    ['-xzf', archive, '-C', directory, 'trivy'],
    '.reports/u1/tool-extract.log',
  );
  chmodSync(binary, 0o700);
  await runCommand(binary, ['--version'], '.reports/u1/tool-trivy-version.log');
  if (!readFileSync('.reports/u1/tool-trivy-version.log', 'utf8').includes('Version: 0.75.0'))
    throw new Error('검증된 Trivy 버전이 아닙니다.');
  const venv = resolve('.runtime/u1/semgrep-venv');
  if (!existsSync(resolve(venv, 'bin/python')))
    await runCommand('python3', ['-m', 'venv', venv], '.reports/u1/tool-venv.log');
  await runCommand(
    resolve(venv, 'bin/python'),
    ['-m', 'pip', 'install', 'semgrep==1.180.0'],
    '.reports/u1/tool-semgrep-install.log',
  );
  await runCommand(
    resolve(venv, 'bin/semgrep'),
    ['--version'],
    '.reports/u1/tool-semgrep-version.log',
  );
  if (readFileSync('.reports/u1/tool-semgrep-version.log', 'utf8').trim() !== '1.180.0')
    throw new Error('검증된 Semgrep 버전이 아닙니다.');
  await runCommand(
    resolve(venv, 'bin/python'),
    ['-m', 'pip', 'freeze'],
    '.reports/u1/tool-python-dependencies.txt',
  );
  writeFileSync(
    '.reports/u1/tool-support.json',
    JSON.stringify(
      {
        node: process.version,
        trivy: '0.75.0',
        archive: { url: selected.url, sha256: selected.sha256 },
        semgrep: '1.180.0',
        globalInstall: false,
        observedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await bootstrapTools();
