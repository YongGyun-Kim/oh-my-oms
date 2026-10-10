import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  projectToolDirectory,
  trivyArchive,
  verifyToolArchive,
} from '../../../scripts/u1/bootstrap-tools.js';
describe('프로젝트 전용 도구platform/checksum/경로의실제경계', () => {
  for (const pair of [
    ['linux', 'x64'],
    ['linux', 'arm64'],
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
  ])
    it(pair.join('/') + '는공식고정archive/checksum만선택한다', () => {
      const result = trivyArchive(pair[0]!, pair[1]!);
      expect(result.url).toBe(
        'https://github.com/aquasecurity/trivy/releases/download/v0.75.0/' + result.file,
      );
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  it('미지원architecture를검증된host로추정하지않는다', () =>
    expect(() => trivyArchive('linux', 'ia32')).toThrow());
  it('실제archive변조와거짓checksum형식은설치전에거절한다', () => {
    const bytes = Buffer.from('synthetic archive only'),
      sha = createHash('sha256').update(bytes).digest('hex');
    expect(() => verifyToolArchive(bytes, sha)).not.toThrow();
    expect(() => verifyToolArchive(Buffer.from('different'), sha)).toThrow();
    expect(() => verifyToolArchive(bytes, 'latest')).toThrow();
  });
  it('프로젝트내부유한도구폴더만생성하고전역경로를바꾸지않는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'oms-u1-tool-test-'));
    try {
      expect(projectToolDirectory(root)).toBe(join(realpathSync(root), '.runtime/u1/tools'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('상위symlink로다른프로젝트도구를바꾸는경로는거절한다', () => {
    const root = mkdtempSync(join(tmpdir(), 'oms-u1-tool-test-')),
      outside = mkdtempSync(join(tmpdir(), 'oms-u1-tool-outside-'));
    try {
      mkdirSync(join(root, '.runtime'));
      symlinkSync(outside, join(root, '.runtime/u1'));
      expect(() => projectToolDirectory(root)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
