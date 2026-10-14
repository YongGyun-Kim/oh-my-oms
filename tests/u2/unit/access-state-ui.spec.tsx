// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { BrowserApi } from '@oms/ui';
import { Portal } from '../../../packages/ui/src/portal.tsx';
import { StaffRolePanel } from '../../../packages/ui/src/staff-role-panel.tsx';
import { RecoveryClaim } from '../../../packages/ui/src/recovery-claim.tsx';
import { RecoveryStatus } from '../../../packages/ui/src/recovery-status.tsx';
import { MemberPanel } from '../../../packages/ui/src/member-panel.tsx';
import type { EnterpriseView, U2LimitedOutcome } from '../../../packages/ui/src/ui-types.ts';
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(element: React.ReactNode) {
  await act(async () => root.render(element));
}
async function submit(index = 0) {
  await act(async () =>
    container
      .querySelectorAll('form')
      [index]!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
function value(name: string, text: string, index = 0) {
  (container.querySelectorAll(`[name="${name}"]`)[index] as HTMLInputElement).value = text;
}
const accountRef = {
    owner: 'IdentityRecovery',
    entity: 'Account',
    id: 'synthetic-staff',
    revision: 1,
  },
  roleRef = { owner: 'EnterpriseAccess', entity: 'StaffRole', id: 'synthetic-role', revision: 3 };
it('주소의 초대 원문은 인증 응답을 기다리기 전에 제거하고 로그인 뒤 화면에도 메모리로만 유지한다', async () => {
  const secret = 'A'.repeat(43);
  window.history.replaceState(null, '', '/?invitationToken=' + secret);
  let release!: (value: unknown) => void;
  const read = vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  await render(<Portal audience="CUSTOMER" />);
  expect(window.location.search).toBe('');
  expect(container.textContent).toContain('인증');
  await act(async () => release({ data: { accountRef: null, phase: 'MFA_REQUIRED' } }));
  expect(container.querySelector<HTMLInputElement>('[name="token"]')!.required).toBe(false);
  expect(container.textContent).not.toContain(secret);
  expect(storage).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledWith('/identity');
});
it('직원 화면은 기업 초대 목적을 노출하지 않으며 회사망과 PC 안내를 제공한다', async () => {
  const api = new BrowserApi();
  vi.spyOn(api, 'read').mockResolvedValue({ items: [], nextCursor: null });
  await render(<StaffRolePanel api={api} accountRef={accountRef} report={vi.fn()} active />);
  expect(container.textContent).toContain('회사망');
  expect(container.textContent).toContain('PC1280');
  expect(
    container.querySelectorAll('form')[0]!.querySelector('[value="identity.recovery.verify"]'),
  ).toBeNull();
  expect(
    container.querySelectorAll('form')[1]!.querySelector('[value="identity.recovery.verify"]'),
  ).toBeTruthy();
  expect(
    container.querySelectorAll('form')[1]!.querySelector('[value="identity.person.verify"]'),
  ).toBeTruthy();
});
it('새 직원 확인 권한은 현재 역할 개정으로만 보내며 개정과 self grant를 혼동하지 않는다', async () => {
  const api = new BrowserApi();
  api.originals.activate('STAFF', accountRef.id);
  vi.spyOn(api, 'read').mockResolvedValue({
    items: [{ roleRef, label: '합성 역할', actions: ['staff.role.manage'], active: true }],
    nextCursor: null,
  });
  const command = vi
    .spyOn(api, 'command')
    .mockResolvedValue({ requestId: 'synthetic-receipt', requestState: 'RESULT_RECORDED' });
  await render(<StaffRolePanel api={api} accountRef={accountRef} report={vi.fn()} active />);
  value('role', roleRef.id);
  const chosen = container
    .querySelectorAll('form')[1]!
    .querySelector<HTMLInputElement>('[value="identity.recovery.verify"]')!;
  chosen.checked = true;
  value('reason', '합성 명시 개정', 1);
  await submit(1);
  await submit(1);
  expect(command).toHaveBeenCalledTimes(1);
  expect(command.mock.calls[0]![0]).toBe('/staff-roles/' + roleRef.id + '/revisions');
  expect(command.mock.calls[0]![1]).toMatchObject({
    roleRef,
    actions: ['identity.recovery.verify'],
    meta: { expectedRevision: 3 },
  });
  expect(container.textContent).toContain('자동 부여하지');
});
it('늦은 당사자 준비 응답은 pagehide 이후 새 화면에 claim 입력을 부활시키지 않는다', async () => {
  const api = new BrowserApi();
  let release!: (value: unknown) => void;
  const command = vi.spyOn(api, 'command').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await render(<RecoveryClaim api={api} />);
  value('case', 'synthetic-case');
  value('revision', '1');
  await submit();
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  await act(async () => release({ challengeId: 'stale-challenge' }));
  expect(command).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain('stale-challenge');
  expect(container.querySelector('[name="code"]')).toBeNull();
});
it('원래 목적 정각 만료는 비밀번호 입력과 완료 조작을 닫으며 기한을 연장하지 않는다', async () => {
  vi.useFakeTimers();
  const api = new BrowserApi(),
    expiresAt = new Date(Date.now() + 1000).toISOString(),
    caseRef = {
      owner: 'IdentityRecovery',
      entity: 'RecoveryCase',
      id: 'synthetic-case',
      revision: 4,
    },
    outcome: U2LimitedOutcome = {
      caseRef,
      claimReceiptRef: { ...caseRef, entity: 'ClaimReceipt' },
      authorityRef: { ...caseRef, entity: 'EnrollmentAuthority' },
      purpose: 'MFA_REENROLMENT',
      expiresAt,
      phase: 'ENROLMENT_ONLY',
    };
  vi.spyOn(api, 'read').mockResolvedValue({
    sourceRef: caseRef,
    state: 'ENROLMENT_ONLY',
    knowledge: 'KNOWN',
    expiresAt,
    remainingAction: '확인 필요',
    actualEffect: 'UNCONFIRMED',
    noticeDelivery: 'REQUESTED',
    providerResultRefs: [],
    originalEffectKnowledge: 'UNKNOWN',
  });
  await render(<RecoveryStatus api={api} caseRef={caseRef} outcome={outcome} />);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(container.querySelector<HTMLButtonElement>('form button')!.disabled).toBe(true);
  expect(container.textContent).toContain('0초');
});
it('마지막 관리자0은 기업·다른 역할 유지 경고이며 자동 재지정이나 자동 권한 부여가 아니다', async () => {
  const view = {
      administratorCount: 0,
      memberships: [],
      departments: [],
      sites: [],
    } as unknown as EnterpriseView,
    api = new BrowserApi();
  const command = vi.spyOn(api, 'command');
  await render(<MemberPanel api={api} view={view} reload={vi.fn()} report={vi.fn()} />);
  expect(
    container.querySelector('[data-testid="administrator-zero-warning"]')?.textContent,
  ).toContain('다른 역할은 유지');
  expect(command).not.toHaveBeenCalled();
});
