import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { U3Repository, U3Transaction, U3_SOURCE_CONTRACT, validateModel } from '@oms/persistence';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';

const schema = new SchemaValidator();
const evidenceRef = fixtureRef('IdentityRecovery', 'VerificationEvidence', 'evidence');
const evidence = (): ModelData => ({
  evidenceId: evidenceRef.id,
  revision: 1,
  accountRef: fixtureRef('IdentityRecovery', 'Account'),
  bindingRef: fixtureRef('IdentityRecovery', 'ProviderBinding'),
  policyRef: fixtureRef('IdentityRecovery', 'VerificationPolicy'),
  purpose: 'CONTRACT_AGREEMENT',
  sourceKind: 'SYNTHETIC_A',
  authorityRef: fixtureRef('IdentityRecovery', 'Account', 'confirmer'),
  observedAt: '2026-10-12T00:00:00.000Z',
  expiresAt: '2026-10-12T00:05:00.000Z',
  synthetic: true,
  state: 'CONFIRMED',
  contactRef: null,
  contactVersion: null,
  enterpriseRef: null,
  caseRef: null,
  partyContextRef: null,
  challengeId: null,
});

// 저장 포트의 경계 시험이며 실제 사람/합의 원본 또는 운영 권위를 증명하지 않는다.
function scopeFor(protectedImage: ModelData, primaryImage: ModelData) {
  const currentProtected = vi.fn().mockResolvedValue(protectedImage);
  const get = vi.fn().mockResolvedValue(primaryImage);
  const rows = vi.fn<ProtectedTransaction['rows']>().mockReturnValue([]);
  const repository = new U3Repository({
    schema,
    currentProtected,
  } as unknown as ProtectedStore);
  const scope = new U3Transaction(repository, {
    get,
    rows,
  } as unknown as ProtectedTransaction);
  return { scope, currentProtected, get, rows };
}

describe('U3 현재 원상의 등록 모델 기반 비교', () => {
  it.each([true, false])(
    '선택 nullable NULL/생략을 동등 비교하고 양쪽 원본과 반환값을 보존한다 (primary NULL=%s)',
    async (primaryNull) => {
      const omitted = evidence(),
        explicitNull = { ...evidence(), operatorAuthorityRef: null },
        protectedImage = primaryNull ? omitted : explicitNull,
        primaryImage = primaryNull ? explicitNull : omitted,
        protectedBytes = canonicalJson(protectedImage),
        primaryBytes = canonicalJson(primaryImage);
      const { scope } = scopeFor(protectedImage, primaryImage);
      expect(await scope.current(evidenceRef)).toBe(primaryImage);
      await scope.assertPremises();
      expect(canonicalJson(protectedImage)).toBe(protectedBytes);
      expect(canonicalJson(primaryImage)).toBe(primaryBytes);
      expect(Object.hasOwn(primaryImage, 'operatorAuthorityRef')).toBe(primaryNull);
    },
  );

  it('같은 판단의 재조회도 NULL/생략만 동등하게 처리한다', async () => {
    const { scope, currentProtected, get } = scopeFor(evidence(), evidence());
    await scope.current(evidenceRef);
    const explicitNull = { ...evidence(), operatorAuthorityRef: null };
    currentProtected.mockResolvedValue(explicitNull);
    get.mockResolvedValue(explicitNull);
    expect(await scope.current(evidenceRef)).toBe(explicitNull);
    await scope.assertPremises();
  });

  it('검증한 전제의 실제 필드 변경은 재조회와 최종 재대조에서 거절한다', async () => {
    const { scope, currentProtected, get } = scopeFor(evidence(), evidence());
    await scope.current(evidenceRef);
    const changed = { ...evidence(), sourceKind: 'SYNTHETIC_B', operatorAuthorityRef: null };
    currentProtected.mockResolvedValue(changed);
    get.mockResolvedValue(changed);
    await expect(scope.current(evidenceRef)).rejects.toMatchObject({ code: 'U3_PREMISE_CHANGED' });
    await expect(scope.assertPremises()).rejects.toMatchObject({ code: 'U3_PREMISE_CHANGED' });
  });

  it('최종 primary 대조에서도 등록된 선택 NULL만 동등하고 실제 참조 변조는 거절한다', async () => {
    const { scope, get } = scopeFor(evidence(), evidence());
    await scope.current(evidenceRef);
    get.mockResolvedValue({ ...evidence(), operatorAuthorityRef: null });
    await scope.assertPremises();
    get.mockResolvedValue({
      ...evidence(),
      authorityRef: fixtureRef('IdentityRecovery', 'Account', 'other-confirmer'),
    });
    await expect(scope.assertPremises()).rejects.toMatchObject({
      code: 'CURRENT_U3_NOT_PROTECTED',
    });
  });

  it('필수 nullable 필드의 생략은 NULL로 추정하지 않는다', async () => {
    const primary = evidence();
    delete primary.contactRef;
    const { scope } = scopeFor(evidence(), primary);
    await expect(scope.current(evidenceRef)).rejects.toMatchObject({
      code: 'MODEL_FIELD_REQUIRED',
    });
  });

  it('필수 nullable 필드의 실제 참조 값을 NULL과 동등하게 만들지 않는다', async () => {
    const primary = {
      ...evidence(),
      enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise'),
    };
    validateModel('VerificationEvidence', primary, schema);
    const { scope } = scopeFor(evidence(), primary);
    await expect(scope.current(evidenceRef)).rejects.toMatchObject({
      code: 'CURRENT_U3_NOT_PROTECTED',
    });
  });

  it('선택 필드도 유효한 non-null 권위 참조끼리 다르면 거절한다', async () => {
    const protectedImage = {
      ...evidence(),
      purpose: 'EMERGENCY_PRIVATE',
      operatorAuthorityRef: fixtureRef('IdentityRecovery', 'EmergencyOperatorAuthority', 'first'),
    };
    const primaryImage = {
      ...protectedImage,
      operatorAuthorityRef: fixtureRef('IdentityRecovery', 'EmergencyOperatorAuthority', 'second'),
    };
    validateModel('VerificationEvidence', protectedImage, schema);
    validateModel('VerificationEvidence', primaryImage, schema);
    const { scope } = scopeFor(protectedImage, primaryImage);
    await expect(scope.current(evidenceRef)).rejects.toMatchObject({
      code: 'CURRENT_U3_NOT_PROTECTED',
    });
  });

  it.each([
    { unregisteredNullable: null },
    { modelVersion: 2 },
    { sourceContract: U3_SOURCE_CONTRACT },
  ])('미등록 필드/버전/출처 %j를 정규화 전에 거절한다', async (changed) => {
    const { scope } = scopeFor(evidence(), { ...evidence(), ...changed });
    await expect(scope.current(evidenceRef)).rejects.toMatchObject({ code: 'UNKNOWN_MODEL_FIELD' });
  });

  it('잘못된 참조 종류와 오래된 원본 개정은 동등 처리하지 않는다', async () => {
    const wrong = scopeFor(evidence(), {
      ...evidence(),
      authorityRef: fixtureRef('EnterpriseAccess', 'Enterprise'),
    });
    await expect(wrong.scope.current(evidenceRef)).rejects.toMatchObject({
      code: 'REFERENCE_OWNER',
    });
    const stale = scopeFor({ ...evidence(), revision: 2 }, evidence());
    await expect(stale.scope.current(evidenceRef)).rejects.toMatchObject({
      code: 'STALE_U3_REFERENCE',
    });
  });

  it('등록된 새 지원 모델의 버전과 sourceContract를 그대로 검증한다', async () => {
    const role: ModelData = {
      staffRoleId: 'role',
      label: '합성 역할',
      actions: ['product.register'],
      revision: 1,
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
    };
    const reference = fixtureRef('EnterpriseAccess', 'StaffRole', 'role');
    const normal = scopeFor(role, structuredClone(role));
    expect(await normal.scope.current(reference)).toEqual(role);
    for (const changed of [
      { modelVersion: 1 },
      { sourceContract: null },
      { sourceContract: { ...U3_SOURCE_CONTRACT, registryVersion: 2 } },
    ]) {
      const { scope } = scopeFor(role, { ...role, ...changed });
      await expect(scope.current(reference)).rejects.toThrow();
    }
    const legacy = {
      staffRoleId: 'role',
      label: '합성 역할',
      actions: ['product.register'],
      revision: 1,
    };
    validateModel('StaffRole', legacy, schema);
    const mixed = scopeFor(role, legacy);
    await expect(mixed.scope.current(reference)).rejects.toMatchObject({
      code: 'CURRENT_U3_NOT_PROTECTED',
    });
  });
});
