import { describe, it, expect } from 'vitest';
import {
  evaluationProvenance,
  validateEvaluationProvenance,
} from '../../../scripts/u1/measurement-provenance.js';
const a = 'a'.repeat(64),
  b = 'b'.repeat(64);
const serving = { 'apps/api/src/main.ts': a, 'scripts/u1/worker-recovery-evidence.ts': a };
describe('불변 측정 source와 재평가 code의 별도 provenance', () => {
  it('변경0도원래digest와현digest를따로보존한다', () => {
    const proof = evaluationProvenance(serving, serving);
    expect(proof.delta).toEqual([]);
    expect(proof.measuredFullSourceDigest).toBe(proof.evaluationFullSourceDigest);
  });
  it('evaluator만변경하면정확한전후digest를남긴다', () => {
    const evaluated = { ...serving, 'scripts/u1/worker-recovery-evidence.ts': b };
    const proof = evaluationProvenance(serving, evaluated);
    expect(proof.delta).toEqual([
      { path: 'scripts/u1/worker-recovery-evidence.ts', measuredSha256: a, evaluatedSha256: b },
    ]);
    expect(() => validateEvaluationProvenance(serving, evaluated, proof)).not.toThrow();
  });
  it('새재평가도구만명시생성으로등록한다', () => {
    expect(
      evaluationProvenance(serving, { ...serving, 'scripts/u1/requalify-performance.ts': b })
        .delta[0]!.measuredSha256,
    ).toBe(null);
  });
  it('API·DB·queuefixture·부하schedule변경은거절한다', () => {
    for (const path of [
      'apps/api/src/main.ts',
      'packages/persistence/src/recovery.ts',
      'tests/u1/fixtures/queue.ts',
      'scripts/u1/performance.ts',
    ])
      expect(() => evaluationProvenance(serving, { ...serving, [path]: b })).toThrow('재평가');
  });
  it('evaluator삭제로실제기준을없앨수없다', () => {
    expect(() => evaluationProvenance(serving, { 'apps/api/src/main.ts': a })).toThrow('재평가');
  });
  it('변조한delta·문자열boolean은대조에서거절한다', () => {
    const proof = evaluationProvenance(serving, serving);
    expect(() =>
      validateEvaluationProvenance(serving, serving, {
        ...proof,
        delta: [{ path: 'apps/api/src/main.ts', measuredSha256: a, evaluatedSha256: b }],
      }),
    ).toThrow('대조');
    expect(() =>
      validateEvaluationProvenance(serving, serving, {
        ...proof,
        runtimeConfigLoadSchedulingServingFixturesUnchanged: 'true',
      } as never),
    ).toThrow('대조');
  });
  it('형식이틀린digest와무한source입력을거절한다', () => {
    expect(() => evaluationProvenance({ 'apps/api/src/main.ts': 'x' }, {})).toThrow('형식');
    expect(() =>
      evaluationProvenance(
        {},
        Object.fromEntries(Array.from({ length: 20001 }, (_, i) => [String(i), a])),
      ),
    ).toThrow('범위');
  });
});
