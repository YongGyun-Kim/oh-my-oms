import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { repairCdkBundle, verifyCdkBundle } from '../../../scripts/u1/cdk-bundle.js';
const roots: string[] = [];
const key = 'node_modules/aws-cdk-lib/node_modules/brace-expansion';
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oms-u1-bundle-test-'));
  roots.push(root);
  mkdirSync(join(root, 'node_modules/aws-cdk-lib/node_modules/minimatch'), { recursive: true });
  mkdirSync(join(root, key));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'oh-my-oms', private: true }));
  writeFileSync(
    join(root, 'node_modules/aws-cdk-lib/package.json'),
    JSON.stringify({ version: '2.272.0' }),
  );
  writeFileSync(join(root, 'node_modules/aws-cdk-lib/node_modules/minimatch/package.json'), '{}');
  writeFileSync(
    join(root, key, 'package.json'),
    JSON.stringify({ name: 'brace-expansion', version: '5.0.9' }),
  );
  writeFileSync(join(root, key, 'vulnerable.js'), 'vulnerable bytes');
  cpSync('node_modules/brace-expansion', join(root, 'node_modules/brace-expansion'), {
    recursive: true,
  });
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  lock.packages[key] = { version: '5.0.9', inBundle: true };
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  return root;
}
describe('CDK 실제 bundle 교체·공식 코드·fail closed 설치 guard', () => {
  it('실제 제품 minimatch는 공식 patched 코드를 로드하며 정상/악성 pattern을 처리한다', () => {
    const result = verifyCdkBundle(process.cwd());
    expect(result.patched).toBe('5.0.12');
    const req = createRequire(
      join(process.cwd(), 'node_modules/aws-cdk-lib/node_modules/minimatch/package.json'),
    );
    const expand = req('brace-expansion').expand as (input: string) => string[];
    const mm = req('minimatch');
    expect(mm.minimatch('src/a.ts', 'src/{a,b}.ts')).toBe(true);
    expect(mm.minimatch('src/c.ts', 'src/{a,b}.ts')).toBe(false);
    expect(expand('src/{a,b}.ts')).toEqual(['src/a.ts', 'src/b.ts']);
    for (const attack of [
      '{a,'.repeat(4000) + 'z' + '}'.repeat(4000),
      '{'.repeat(3200) + 'a,b' + '}'.repeat(3200),
      '{a}' + ',b}'.repeat(15000),
    ])
      expect(() => expand(attack)).not.toThrow();
  });
  it('기대 bundled 취약 파일을 실제 제거하고 같은 root patched source로 해석한다', () => {
    const root = fixture();
    expect(repairCdkBundle(root)?.patched).toBe('5.0.12');
    expect(existsSync(join(root, key))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages[key],
    ).toBeUndefined();
    expect(repairCdkBundle(root)?.patched).toBe('5.0.12');
  });
  it('lock만 깨끗해도 fresh ignore-scripts가 재생성한 실제 취약 bundle은 거절한다', () => {
    const root = fixture();
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    delete lock.packages[key];
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
    expect(() => verifyCdkBundle(root)).toThrow();
    expect(existsSync(join(root, key, 'vulnerable.js'))).toBe(true);
    repairCdkBundle(root);
    expect(() => verifyCdkBundle(root)).not.toThrow();
  });
  it('symlink 삭제 대상이면 외부 경로를 건드리지 않고 실패한다', () => {
    const root = fixture();
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'sentinel'), 'keep');
    rmSync(join(root, key), { recursive: true });
    symlinkSync(outside, join(root, key));
    expect(() => repairCdkBundle(root)).toThrow();
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('keep');
  });
  it('다른 CDK/bundle 버전은 임의 파일 정리로 고치지 않는다', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'node_modules/aws-cdk-lib/package.json'),
      JSON.stringify({ version: 'unknown' }),
    );
    expect(() => repairCdkBundle(root)).toThrow();
    expect(existsSync(join(root, key, 'vulnerable.js'))).toBe(true);
    writeFileSync(
      join(root, 'node_modules/aws-cdk-lib/package.json'),
      JSON.stringify({ version: '2.272.0' }),
    );
    writeFileSync(
      join(root, key, 'package.json'),
      JSON.stringify({ name: 'brace-expansion', version: 'unknown' }),
    );
    expect(() => repairCdkBundle(root)).toThrow();
  });
  it('공식 source byte나 tar integrity와 다르면 version 문자열만으로 통과하지 않는다', () => {
    const root = fixture();
    repairCdkBundle(root);
    writeFileSync(
      join(root, 'node_modules/brace-expansion/dist/commonjs/index.js'),
      'tampered bytes',
    );
    expect(() => verifyCdkBundle(root)).toThrow();
  });
  it('CDK가 없는 runtime은 명시적 dev 생략만 허용하며 synth guard는 실패한다', () => {
    const root = fixture();
    rmSync(join(root, 'node_modules/aws-cdk-lib'), { recursive: true });
    expect(() => repairCdkBundle(root)).toThrow();
    expect(repairCdkBundle(root, true)).toBeNull();
    expect(() => verifyCdkBundle(root)).toThrow();
  });
  it('root patched package 부재·잘못된 workspace는 무관한 bundle을 삭제하지 않는다', () => {
    const root = fixture();
    rmSync(join(root, 'node_modules/brace-expansion'), { recursive: true });
    expect(() => repairCdkBundle(root)).toThrow();
    expect(existsSync(join(root, key, 'vulnerable.js'))).toBe(true);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'other' }));
    expect(() => repairCdkBundle(root)).toThrow();
  });
});
