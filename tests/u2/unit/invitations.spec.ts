import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  invitationBinding,
  requireInvitationPending,
  PurposeVerifier,
  generatePurposeSecret,
} from '@oms/core';
const at = new Date('2026-10-09T00:00:00Z'),
  row = {
    invitationId: 'invitation',
    revision: 1,
    contactRef: {
      owner: 'IdentityRecovery',
      entity: 'RegisteredContact',
      id: 'contact',
      revision: 1,
    },
    tokenGeneration: 1,
    epoch: 'initial',
    keyVersion: 'fixture-key',
    state: 'PENDING',
    issuedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + 7 * 86400000).toISOString(),
  };
describe('초대 원래 수명/목적과 세대', () => {
  it('정확 7일 경계 직전에는 pending이다', () =>
    expect(() =>
      requireInvitationPending(row, new Date(Date.parse(row.expiresAt) - 1)),
    ).not.toThrow());
  it('정각 만료를 거절한다', () =>
    expect(() => requireInvitationPending(row, new Date(row.expiresAt))).toThrow());
  it('경계 이후를 거절한다', () =>
    expect(() => requireInvitationPending(row, new Date(Date.parse(row.expiresAt) + 1))).toThrow());
  it('모든 처리/재확인 상태는 새 수락을 거절한다', () => {
    for (const state of ['ACCEPTED', 'REVOKED', 'EXPIRED', 'RECONFIRMATION_REQUIRED'])
      expect(() => requireInvitationPending({ ...row, state }, at)).toThrow();
  });
  it('재발송의 다른 세대는 이전 token을 검증하지 못한다', () => {
    const v = new PurposeVerifier(randomBytes(32), 'fixture-key'),
      token = generatePurposeSecret('INVITATION_TOKEN'),
      digest = v.digest(token, invitationBinding(row));
    expect(
      v.matches(token, invitationBinding({ ...row, revision: 2, tokenGeneration: 2 }), digest),
    ).toBe(false);
  });
  it('소비/조회용 revision 증가는 원래 token binding을 바꾸지 않는다', () =>
    expect(invitationBinding({ ...row, revision: 2, state: 'ACCEPTED' })).toEqual(
      invitationBinding(row),
    ));
  it('연락 경로/초대/epoch 변경은 동일 비밀을 거절한다', () => {
    const v = new PurposeVerifier(randomBytes(32), 'fixture-key'),
      token = generatePurposeSecret('INVITATION_TOKEN'),
      digest = v.digest(token, invitationBinding(row));
    for (const change of [
      { invitationId: 'other' },
      { epoch: 'next' },
      { contactRef: { ...row.contactRef, revision: 2 } },
    ])
      expect(v.matches(token, invitationBinding({ ...row, ...change }), digest)).toBe(false);
  });
  it('초대 비밀은 256bit canonical 입력만 허용한다', () => {
    const v = new PurposeVerifier(randomBytes(32), 'fixture-key');
    expect(generatePurposeSecret('INVITATION_TOKEN')).toHaveLength(43);
    expect(() => v.digest(generatePurposeSecret('HANDOFF'), invitationBinding(row))).toThrow();
  });
});
