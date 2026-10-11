import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator, U3_PROFILE } from '@oms/contracts';
import {
  LEGACY_RECOVERY_OBSERVATION_PROFILE,
  RECOVERY_SECURITY_MODELS,
  registeredRecoveryObservationProfile,
  validateRecoverySecurityObservation,
  U3_SOURCE_CONTRACT,
} from '@oms/persistence';
import { SyntheticCurrentSecurityOracle } from '../../u1/fixtures/recovery-security-oracle.js';

const schema = new SchemaValidator();
const role = {
  staffRoleId: 'role',
  label: '원래 역할',
  actions: ['product.register'],
  revision: 1,
};
const modern = { ...role, modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT };
const oldFrame = {
  checkId: 'check',
  model: 'StaffRole',
  id: 'role',
  sourceOwner: 'EnterpriseAccess',
  sourceRevision: 1,
  currentData: role,
  evidenceId: 'proof',
  observedAt: '2026-10-12T00:00:00.000Z',
  knowledge: 'KNOWN',
};
const newFrame = {
  ...oldFrame,
  observationVersion: 2,
  sourceContract: U3_SOURCE_CONTRACT,
  modelVersion: 2,
  currentData: modern,
};
const decode = (profile: string, frame: unknown) =>
  validateRecoverySecurityObservation(schema, profile, frame);
const canonicalDigest = (frame: unknown) =>
  createHash('sha256')
    .update(canonicalJson(frame) + '\n')
    .digest('hex');

describe('서버 등록 관측 계약과 실제 원본 버전 분리', () => {
  it('기본 관측은 foundation1이며 legacy bytes/14개 모델 의미를 유지한다', () => {
    const profile = registeredRecoveryObservationProfile({ kind: 'SYNTHETIC' });
    expect(profile).toBe(LEGACY_RECOVERY_OBSERVATION_PROFILE);
    expect(canonicalJson(decode(profile, oldFrame))).toBe(canonicalJson(oldFrame));
    expect(() => decode(profile, { ...oldFrame, model: 'RoleRevisionState' })).toThrow();
    expect(() => decode(profile, { ...oldFrame, currentData: modern })).toThrow();
  });
  it('등록된 profile2에서만 frame2와 실제 row2를 읽는다', () => {
    const profile = registeredRecoveryObservationProfile({
      kind: 'REGISTERED_CURRENT_OWNER',
      observationProfile: U3_PROFILE,
    });
    expect(decode(profile, newFrame)).toEqual(newFrame);
    expect(() => decode(LEGACY_RECOVERY_OBSERVATION_PROFILE, newFrame)).toThrow();
    expect(() => decode(profile, oldFrame)).toThrow();
  });
  it('관측 frame2 안의 실제 legacy row1에는 SourceContract를 추정 추가하지 않는다', () => {
    const frame = { ...newFrame, modelVersion: 1, currentData: role };
    expect(decode(U3_PROFILE, frame).currentData).toEqual(role);
    expect(decode(U3_PROFILE, frame).currentData).not.toHaveProperty('sourceContract');
    expect(canonicalJson(decode(U3_PROFILE, frame).currentData)).toBe(canonicalJson(role));
  });
  it('새 37개 enum은 실제 복구 allowlist와 정확히 같고 unknown 모델은 닫혀 있다', () => {
    expect(new Set(RECOVERY_SECURITY_MODELS).size).toBe(37);
    for (const model of RECOVERY_SECURITY_MODELS)
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/RecoverySecurityObservation', {
          ...newFrame,
          model,
          currentData: null,
          modelVersion: null,
          sourceRevision: null,
          knowledge: 'UNKNOWN',
        }),
      ).not.toThrow();
    expect(() => decode(U3_PROFILE, { ...newFrame, model: 'Product' })).toThrow();
  });
  it('미등록 authority는 output이 frame2여도 계약을 선택하지 못한다', () => {
    expect(() =>
      registeredRecoveryObservationProfile({
        kind: 'UNREGISTERED',
        observationProfile: U3_PROFILE,
      }),
    ).toThrow();
  });
  it.each([null, 'urn:oms:contract:common:2', 'unknown-profile'])(
    '알 수 없는 서버 등록 %j은 거절한다',
    (observationProfile) => {
      expect(() =>
        registeredRecoveryObservationProfile({ kind: 'SYNTHETIC', observationProfile }),
      ).toThrow();
      if (observationProfile !== null) expect(() => decode(observationProfile, newFrame)).toThrow();
    },
  );
  it('잘못된 marker/owner/대상/개정 및 frame/body version 차이를 거절한다', () => {
    for (const frame of [
      { ...newFrame, observationVersion: 1 },
      { ...newFrame, modelVersion: 1 },
      { ...newFrame, modelVersion: null },
      { ...newFrame, currentData: role },
      { ...newFrame, sourceOwner: 'IdentityRecovery' },
      { ...newFrame, id: 'different-role' },
      { ...newFrame, sourceRevision: 2 },
      { ...newFrame, extra: true },
    ])
      expect(() => decode(U3_PROFILE, frame)).toThrow();
  });
  it('frame와 row의 누락/null/잘못된 SourceContract는 모두 거절한다', () => {
    for (const sourceContract of [
      undefined,
      null,
      { ...U3_SOURCE_CONTRACT, registryVersion: 2 },
      { ...U3_SOURCE_CONTRACT, profile: LEGACY_RECOVERY_OBSERVATION_PROFILE },
    ]) {
      expect(() => decode(U3_PROFILE, { ...newFrame, sourceContract })).toThrow();
      expect(() =>
        decode(U3_PROFILE, { ...newFrame, currentData: { ...modern, sourceContract } }),
      ).toThrow();
    }
  });
  it('default oracle 출력에 새 metadata가 없고 explicit profile2만 새 frame을 낸다', async () => {
    const snapshot = { capturedAt: oldFrame.observedAt, rows: { 'StaffRole/role': role } };
    const signal = new AbortController().signal;
    for (const profile of [undefined, U3_PROFILE]) {
      const oracle = new SyntheticCurrentSecurityOracle(snapshot, profile);
      const check = await oracle.begin('epoch', oldFrame.observedAt, signal);
      const frame = await oracle.observe(check.checkId, 'StaffRole', 'role', signal);
      expect(decode(registeredRecoveryObservationProfile(oracle), frame)).toEqual(frame);
      if (profile === undefined) {
        expect(frame).not.toHaveProperty('observationVersion');
        expect(frame).not.toHaveProperty('modelVersion');
        expect(frame).not.toHaveProperty('sourceContract');
      } else
        expect(frame).toMatchObject({
          observationVersion: 2,
          modelVersion: 1,
          sourceContract: U3_SOURCE_CONTRACT,
        });
      expect((await oracle.seal(check.checkId, canonicalDigest(frame), 1, signal)).complete).toBe(
        true,
      );
    }
  });
});
import { createHash } from 'node:crypto';
