import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const CDK = '2.272.0';
const PATCH = '5.0.12';
const INTEGRITY =
  'sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==';
const NESTED = 'node_modules/aws-cdk-lib/node_modules/brace-expansion';
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
export interface BundleResult {
  cdk: string;
  patched: string;
  resolved: string;
  sourceSha256: string;
}
export function verifyCdkBundle(workspace: string): BundleResult {
  const root = realpathSync(workspace);
  const lib = join(root, 'node_modules/aws-cdk-lib');
  assert.equal(realpathSync(lib), lib, 'CDK 설치 경로가 symlink/다른 위치입니다.');
  assert.equal(json(join(lib, 'package.json')).version, CDK);
  assert(!existsSync(join(root, NESTED)), '취약한 bundled 실제 파일이 남아 있습니다.');
  const req = createRequire(join(lib, 'node_modules/minimatch/package.json'));
  const loaded = realpathSync(req.resolve('brace-expansion'));
  const direct = createRequire(join(root, 'package.json'));
  const expected = realpathSync(direct.resolve('brace-expansion'));
  assert.equal(loaded, expected);
  assert.equal(req('brace-expansion/package.json').version, PATCH);
  const lock = json(join(root, 'package-lock.json'));
  assert.equal(lock.packages['node_modules/brace-expansion'].version, PATCH);
  assert.equal(lock.packages['node_modules/brace-expansion'].integrity, INTEGRITY);
  assert(!lock.packages[NESTED]);
  const sourceSha256 = createHash('sha256').update(readFileSync(loaded)).digest('hex');
  assert.equal(sourceSha256, 'e0ede97c712339a70bae2c96c675b1ffd30052bdf57f37f5a97b5945c40a9ae6');
  return { cdk: CDK, patched: PATCH, resolved: loaded, sourceSha256 };
}
export function repairCdkBundle(workspace: string, allowDevOmission = false): BundleResult | null {
  const root = realpathSync(workspace);
  assert.equal(json(join(root, 'package.json')).name, 'oh-my-oms');
  const lib = join(root, 'node_modules/aws-cdk-lib');
  if (!existsSync(lib)) {
    assert(allowDevOmission, 'CDK 전체 설치가 준비되지 않았습니다.');
    return null;
  }
  assert.equal(realpathSync(lib), lib);
  assert.equal(json(join(lib, 'package.json')).version, CDK);
  const patched = join(root, 'node_modules/brace-expansion');
  assert.equal(realpathSync(patched), patched);
  assert.equal(json(join(patched, 'package.json')).version, PATCH);
  const lockPath = join(root, 'package-lock.json');
  const lock = json(lockPath);
  assert.equal(lock.packages['node_modules/brace-expansion'].integrity, INTEGRITY);
  assert.equal(lock.packages['node_modules/brace-expansion'].version, PATCH);
  const nested = join(root, NESTED);
  if (existsSync(nested)) {
    assert(!lstatSync(nested).isSymbolicLink());
    assert.equal(realpathSync(nested), nested);
    assert.equal(json(join(nested, 'package.json')).name, 'brace-expansion');
    assert.equal(json(join(nested, 'package.json')).version, '5.0.9');
    rmSync(nested, { recursive: true });
  }
  if (lock.packages[NESTED]) {
    assert.equal(lock.packages[NESTED].version, '5.0.9');
    delete lock.packages[NESTED];
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
  return verifyCdkBundle(root);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const result = process.argv.includes('--install')
    ? repairCdkBundle(root, (process.env.npm_config_omit ?? '').split(/[, ]+/).includes('dev'))
    : verifyCdkBundle(root);
  console.log(
    result
      ? 'CDK 실제 수정 dependency·공식 코드·해석 경로 검증 완료'
      : 'dev 생략 runtime: CDK 없음 확인. synth/security 증거는 별도 전체 설치가 필요합니다.',
  );
}
