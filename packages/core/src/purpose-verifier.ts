import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, requireCondition, SchemaValidator } from '@oms/contracts';
import type { Ref } from '@oms/contracts';

export type SecretPurpose =
  | 'HANDOFF'
  | 'PARTY_CONTEXT'
  | 'PARTY_BROWSER'
  | 'INVITATION_TOKEN'
  | 'ENROLLMENT_HANDLE'
  | 'EMERGENCY_OPERATOR';
export interface SecretBinding {
  purpose: Exclude<SecretPurpose, 'INVITATION_TOKEN'>;
  targetRef: Ref;
  accountRef: Ref | null;
  bindingRef: Ref | null;
  bindingGeneration: number;
  securityGeneration: number;
  sourceRevision: number;
  epoch: string;
  challengeId: string;
  keyVersion: string;
}
export interface InvitationSecretBinding {
  purpose: 'INVITATION_TOKEN';
  targetRef: Ref;
  contactRef: Ref;
  tokenGeneration: number;
  epoch: string;
  keyVersion: string;
}
const PURPOSES = [
  'HANDOFF',
  'PARTY_CONTEXT',
  'PARTY_BROWSER',
  'INVITATION_TOKEN',
  'ENROLLMENT_HANDLE',
  'EMERGENCY_OPERATOR',
];
const schema = new SchemaValidator();
export function canonicalSecretBytes(secret: string, purpose: SecretPurpose): Buffer {
  requireCondition(
    PURPOSES.includes(purpose),
    503,
    'SECRET_PURPOSE',
    '등록된 비밀 목적이 필요합니다.',
  );
  const size = purpose === 'HANDOFF' ? 12 : 32;
  requireCondition(
    typeof secret === 'string' && /^[A-Za-z0-9_-]+$/.test(secret),
    400,
    'SECRET_FORMAT',
    '비밀 입력 형식이 다릅니다.',
  );
  const bytes = Buffer.from(secret, 'base64url');
  requireCondition(
    bytes.length === size && bytes.toString('base64url') === secret,
    400,
    'SECRET_FORMAT',
    '비밀 입력 형식이 다릅니다.',
  );
  return bytes;
}
export function generatePurposeSecret(purpose: SecretPurpose): string {
  requireCondition(
    PURPOSES.includes(purpose),
    503,
    'SECRET_PURPOSE',
    '등록된 비밀 목적이 필요합니다.',
  );
  return randomBytes(purpose === 'HANDOFF' ? 12 : 32).toString('base64url');
}
function bindingBytes(binding: SecretBinding | InvitationSecretBinding): Buffer {
  if (binding.purpose === 'INVITATION_TOKEN') {
    requireCondition(
      Object.keys(binding).sort().join(',') ===
        'contactRef,epoch,keyVersion,purpose,targetRef,tokenGeneration',
      503,
      'SECRET_BINDING',
      '초대 검증 자료 결합이 다릅니다.',
    );
    schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/MembershipInvitation',
      binding.targetRef,
    );
    schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RegisteredContact',
      binding.contactRef,
    );
    schema.validate('Revision', binding.tokenGeneration);
    schema.validate('Id', binding.epoch);
    schema.validate('Id', binding.keyVersion);
    return Buffer.from(canonicalJson(binding), 'utf8');
  }
  requireCondition(
    Object.keys(binding).sort().join(',') ===
      'accountRef,bindingGeneration,bindingRef,challengeId,epoch,keyVersion,purpose,securityGeneration,sourceRevision,targetRef' &&
      PURPOSES.includes(binding.purpose),
    503,
    'SECRET_BINDING',
    '검증 자료 결합이 다릅니다.',
  );
  for (const value of [
    binding.bindingGeneration,
    binding.securityGeneration,
    binding.sourceRevision,
  ])
    schema.validate('Revision', value);
  for (const value of [binding.epoch, binding.challengeId, binding.keyVersion])
    schema.validate('Id', value);
  schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', binding.targetRef);
  if (binding.accountRef !== null)
    schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Account', binding.accountRef);
  if (binding.bindingRef !== null)
    schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/ProviderBinding',
      binding.bindingRef,
    );
  return Buffer.from(canonicalJson(binding), 'utf8');
}
export class PurposeVerifier {
  private readonly key: Buffer;
  constructor(
    key: Buffer,
    readonly keyVersion: string,
  ) {
    requireCondition(key.length === 32, 503, 'VERIFIER_KEY', '목적 검증 키가 필요합니다.');
    schema.validate('Id', keyVersion);
    this.key = Buffer.from(key);
  }
  digest(secret: string, binding: SecretBinding | InvitationSecretBinding): string {
    requireCondition(
      binding.keyVersion === this.keyVersion,
      503,
      'VERIFIER_KEY_VERSION',
      '검증 키 버전이 다릅니다.',
    );
    const metadata = bindingBytes(binding),
      candidate = canonicalSecretBytes(secret, binding.purpose);
    const lengths = Buffer.alloc(8);
    lengths.writeUInt32BE(metadata.length, 0);
    lengths.writeUInt32BE(candidate.length, 4);
    // Length framing binds BOTH the canonical metadata and the candidate bytes.
    return createHmac('sha256', this.key)
      .update('oms-u2-purpose-secret:1\0', 'utf8')
      .update(lengths)
      .update(metadata)
      .update(candidate)
      .digest('hex');
  }
  matches(
    secret: string,
    binding: SecretBinding | InvitationSecretBinding,
    expected: string,
  ): boolean {
    if (!/^[a-f0-9]{64}$/.test(expected)) return false;
    const actual = this.digest(secret, binding);
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }
  inputDigest(
    purpose: 'C21_VERIFY_FACTOR' | 'C21_REPLACE_FIRST_FACTOR',
    metadata: unknown,
    candidate: Buffer,
  ): string {
    requireCondition(
      ['C21_VERIFY_FACTOR', 'C21_REPLACE_FIRST_FACTOR'].includes(purpose) &&
        candidate.length > 0 &&
        candidate.length <= 4096,
      400,
      'C21_INPUT_FORMAT',
      '등록된 원래 변경 입력이 필요합니다.',
    );
    const binding = Buffer.from(canonicalJson({ purpose, keyVersion: this.keyVersion, metadata })),
      lengths = Buffer.alloc(8);
    requireCondition(
      binding.length <= 65536,
      400,
      'C21_INPUT_FORMAT',
      '원래 변경 metadata 상한입니다.',
    );
    lengths.writeUInt32BE(binding.length, 0);
    lengths.writeUInt32BE(candidate.length, 4);
    return createHmac('sha256', this.key)
      .update('oms-u2-c21-input:1\0')
      .update(lengths)
      .update(binding)
      .update(candidate)
      .digest('hex');
  }
}
