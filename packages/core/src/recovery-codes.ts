import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
export interface CodeVerifier {
  digest: string;
  used: boolean;
}
export class RecoveryCodes {
  constructor(private readonly key: Buffer) {
    requireCondition(
      key.length >= 32,
      503,
      'VERIFIER_KEY_REQUIRED',
      '보호된 코드 검증 키가 필요합니다.',
    );
  }
  digest(accountId: string, bindingGeneration: number, setId: string, code: string): string {
    return createHmac('sha256', this.key)
      .update(JSON.stringify([accountId, bindingGeneration, setId, code]))
      .digest('hex');
  }
  compatibleWith(other: RecoveryCodes): boolean {
    return this.key.length === other.key.length && timingSafeEqual(this.key, other.key);
  }
  issue(
    accountId: string,
    generation: number,
    setId: string,
  ): { codes: string[]; verifiers: CodeVerifier[] } {
    const codes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
    return {
      codes,
      verifiers: codes.map((code) => ({
        digest: this.digest(accountId, generation, setId, code),
        used: false,
      })),
    };
  }
  consume(verifiers: CodeVerifier[], digest: string): CodeVerifier[] {
    requireCondition(
      /^[a-f0-9]{64}$/.test(digest),
      401,
      'RECOVERY_DENIED',
      '복구 정보를 확인하세요.',
    );
    let match = -1;
    for (const [index, verifier] of verifiers.entries()) {
      requireCondition(
        /^[a-f0-9]{64}$/.test(verifier.digest) && typeof verifier.used === 'boolean',
        503,
        'CODE_VERIFIER_SCHEMA',
        '코드 검증 자료를 확인해야 합니다.',
      );
      if (
        timingSafeEqual(Buffer.from(verifier.digest, 'hex'), Buffer.from(digest, 'hex')) &&
        !verifier.used
      )
        match = index;
    }
    requireCondition(match >= 0, 401, 'RECOVERY_DENIED', '복구 정보를 확인하세요.');
    return verifiers.map((verifier, index) => ({
      ...verifier,
      used: index === match || verifier.used,
    }));
  }
}
