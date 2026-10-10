// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BrowserApi } from '@oms/ui';
import { RecoveryClaim } from '../../../packages/ui/src/recovery-claim.tsx';
import { RecoveryStatus } from '../../../packages/ui/src/recovery-status.tsx';
import { InvitationAcceptance } from '../../../packages/ui/src/invitation-acceptance.tsx';
import { Login } from '../../../packages/ui/src/login.tsx';
import { StaffRolePanel } from '../../../packages/ui/src/staff-role-panel.tsx';
import { Portal } from '../../../packages/ui/src/portal.tsx';
import { ApiFailure } from '../../../packages/ui/src/client.ts';
import type { CustomerContextView, ProductView, U2LimitedOutcome, U2StatusView } from '@oms/ui';
import type { Ref } from '@oms/contracts';
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
const reference = (entity: string, id = 'synthetic-' + entity, revision = 1): Ref => ({
  owner: entity === 'MembershipInvitation' ? 'EnterpriseAccess' : 'IdentityRecovery',
  entity,
  id,
  revision,
});
const outcome = (): U2LimitedOutcome => ({
  claimReceiptRef: reference('ClaimReceipt'),
  authorityRef: reference('EnrollmentAuthority'),
  caseRef: reference('RecoveryCase', 'synthetic-case', 4),
  purpose: 'MFA_REENROLMENT',
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  phase: 'ENROLMENT_ONLY',
});
const status = (state = 'ENROLMENT_ONLY'): U2StatusView => ({
  sourceRef: reference('RecoveryCase', 'synthetic-case', 4),
  state,
  knowledge: state === 'HOLD' ? 'UNKNOWN' : 'KNOWN',
  remainingAction: '원래 효과 확인과 새 수단 등록을 완료하세요.',
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  actualEffect: state === 'COMPLETED' ? 'CONFIRMED' : 'UNCONFIRMED',
  noticeDelivery: 'REQUESTED',
  providerResultRefs: [],
  originalEffectKnowledge: 'UNKNOWN',
});
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(element: React.ReactNode) {
  await act(async () => {
    root!.render(element);
  });
}
function input(name: string, value: string) {
  (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
}
async function submit(index = 0) {
  await act(async () => {
    container
      .querySelectorAll('form')
      [index]!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
async function click(text: string) {
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === text)!
      .click();
  });
}
describe('현재 목적 UI 계층; mock 응답은 실제 신원/MFA 증거가 아니다', () => {
  it('고객 기업·활성 조직 전환은 원래 범위를 조회하고 초안을 소거하며 UNSET은 주문 문맥을 만들지 않는다', async () => {
    const enterpriseRef: Ref = {
        owner: 'EnterpriseAccess',
        entity: 'Enterprise',
        id: 'own-enterprise',
        revision: 4,
      },
      departmentRef: Ref = {
        owner: 'EnterpriseAccess',
        entity: 'Department',
        id: 'active-department',
        revision: 2,
      },
      siteRef: Ref = { owner: 'EnterpriseAccess', entity: 'Site', id: 'active-site', revision: 3 },
      contexts: CustomerContextView[] = [
        {
          legalName: '현재 본인 기업',
          enterpriseRef,
          orderingContextPolicy: { departmentUsage: 'USED', siteUsage: 'USED' },
          departments: [
            { recordRef: departmentRef, label: '활성 부서', active: true },
            {
              recordRef: { ...departmentRef, id: 'retired-department' },
              label: '폐기 부서',
              active: false,
            },
          ],
          sites: [{ recordRef: siteRef, label: '활성 사업장', active: true }],
          availableActions: ['product.read', 'order.submit'],
          actionScopes: [],
          managementAvailable: false,
          sectionCursors: { departments: null, sites: null, scopes: null },
        },
        {
          legalName: '조직 미사용 기업',
          enterpriseRef: { ...enterpriseRef, id: 'not-used-enterprise', revision: 5 },
          orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
          departments: [],
          sites: [],
          availableActions: ['product.read'],
          actionScopes: [],
          managementAvailable: false,
          sectionCursors: { departments: null, sites: null, scopes: null },
        },
        {
          legalName: '아직 미설정 기업',
          enterpriseRef: { ...enterpriseRef, id: 'unset-enterprise' },
          orderingContextPolicy: { departmentUsage: 'UNSET', siteUsage: 'UNSET' },
          departments: [],
          sites: [],
          availableActions: [],
          actionScopes: [],
          managementAvailable: false,
          sectionCursors: { departments: null, sites: null, scopes: null },
        },
      ],
      product: ProductView = {
        productRef: {
          owner: 'ProductCatalog',
          entity: 'Product',
          id: 'scoped-product',
          revision: 1,
        },
        commonOfferRevisionRef: {
          owner: 'ProductCatalog',
          entity: 'CommonOfferRevision',
          id: 'original-offer',
          revision: 1,
        },
        productType: 'HARDWARE',
        softwareTermKind: null,
        label: '현재 범위 상품',
        salesDescription: '합성 상품',
        commonPrice: { currency: 'KRW', value: '1000' },
        resolvedPrice: null,
        priceKnowledge: 'UNKNOWN',
      };
    let contextUnavailable = false;
    const read = vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(async (path) => {
      if (path === '/identity')
        return {
          knowledge: 'KNOWN',
          data: { phase: 'MFA_VERIFIED', accountRef: reference('Account') },
        };
      if (path.startsWith('/customer-enterprise-contexts?') && contextUnavailable)
        throw new ApiFailure(403, '현재 소속 권한 재확인 실패');
      if (path.startsWith('/customer-enterprise-contexts?'))
        return { items: contexts.map((data) => ({ knowledge: 'KNOWN', data })), nextCursor: null };
      if (path.startsWith('/applications?')) return { items: [], nextCursor: null };
      if (path.startsWith('/products?'))
        return { items: [{ knowledge: 'KNOWN', data: product }], nextCursor: null };
      throw Error('현재 고객 문맥 fixture 외 조회');
    });
    const reset = vi.spyOn(BrowserApi.prototype, 'reset'),
      command = vi
        .spyOn(BrowserApi.prototype, 'command')
        .mockRejectedValue(Error('문맥 선택 자체는 권위/업무 변경이 아님'));
    await render(<Portal audience="CUSTOMER" />);
    async function select(id: string, value: string) {
      await act(async () => {
        const element = container.querySelector<HTMLSelectElement>('#' + id)!;
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await select('current-enterprise', enterpriseRef.id);
    await click('판매 상품');
    const catalogButton = () =>
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === '현재 판매 상품 조회',
      )!;
    expect(catalogButton().disabled).toBe(true);
    expect(
      container.querySelector('#orderDepartment option[value="retired-department"]'),
    ).toBeNull();
    await select('orderDepartment', departmentRef.id);
    expect(catalogButton().disabled).toBe(true);
    await select('orderSite', siteRef.id);
    expect(catalogButton().disabled).toBe(false);
    await click('현재 판매 상품 조회');
    const query = new URLSearchParams(read.mock.calls.at(-1)![0].split('?')[1]);
    expect(JSON.parse(query.get('scope')!)).toEqual({
      enterpriseRef,
      contextPolicyRef: enterpriseRef,
      organisationRevision: 4,
      departmentRef,
      siteRef,
    });
    await click('주문에 추가');
    const hasDraft = () =>
      Array.from(container.querySelectorAll('legend')).some(
        (element) => element.textContent === '주문 초안',
      );
    expect(hasDraft()).toBe(true);
    const resetsBefore = reset.mock.calls.length;
    await select('current-enterprise', 'not-used-enterprise');
    expect(reset).toHaveBeenCalledTimes(resetsBefore + 1);
    expect(hasDraft()).toBe(false);
    await click('판매 상품');
    await click('현재 판매 상품 조회');
    const nextScope = JSON.parse(
      new URLSearchParams(read.mock.calls.at(-1)![0].split('?')[1]).get('scope')!,
    );
    expect(nextScope).toEqual({
      enterpriseRef: contexts[1]!.enterpriseRef,
      contextPolicyRef: contexts[1]!.enterpriseRef,
      organisationRevision: 5,
      departmentRef: null,
      siteRef: null,
    });
    await select('current-enterprise', 'unset-enterprise');
    expect(catalogButton().disabled).toBe(true);
    expect(container.textContent).toContain('아직 미설정');
    await select('current-enterprise', 'not-used-enterprise');
    await click('현재 판매 상품 조회');
    await click('주문에 추가');
    expect(hasDraft()).toBe(true);
    contextUnavailable = true;
    await click('현재 소속·행위 재확인');
    expect(hasDraft()).toBe(false);
    expect(catalogButton().disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('#current-enterprise')!.value).toBe('');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '현재 소속 권한 재확인 실패',
    );
    expect(command).not.toHaveBeenCalled();
  });
  it('Portal 초대 URL은 다른 query를 보존하며 원문을 제거하고 명시 수락 뒤에도 일반 업무를 열지 않는다', async () => {
    window.history.replaceState(null, '', '/?invitationToken=' + 'A'.repeat(43) + '&keep=1');
    const storage = vi.spyOn(Storage.prototype, 'setItem'),
      invitation = reference('MembershipInvitation', 'portal-invitation', 3);
    let accepted = false;
    vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(async (path) => {
      if (path === '/identity') throw new ApiFailure(401, '현재 일반 인증 미완료');
      if (path === '/membership-invitations/portal-invitation')
        return { ...status(), sourceRef: invitation, state: accepted ? 'ACCEPTED' : 'PENDING' };
      throw Error('등록되지 않은 Portal 초대 조회');
    });
    const command = vi.spyOn(BrowserApi.prototype, 'command').mockImplementation(async (path) => {
      if (path === '/membership-invitations/portal-invitation/purpose-authorities') return {};
      if (path === '/membership-invitations/portal-invitation/acceptances') {
        accepted = true;
        return { requestState: 'RESULT_RECORDED' };
      }
      throw Error('등록되지 않은 Portal 초대 변경');
    });
    await render(<Portal audience="CUSTOMER" />);
    expect(window.location.search).toBe('?keep=1');
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.required).toBe(false);
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.value === '').toBe(true);
    expect(container.querySelector('nav')).toBeNull();
    input('invitation', invitation.id);
    input('revision', '3');
    input('evidence', 'current-contact');
    input('evidenceRevision', '2');
    await act(async () => {
      container
        .querySelector('[data-testid="invitation-acceptance"] form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(accepted).toBe(false);
    expect(command).toHaveBeenCalledTimes(1);
    await click('원래 기업 초대 수락');
    expect(accepted).toBe(true);
    expect((command.mock.calls[1]![1] as { invitationRef: Ref }).invitationRef).toEqual(invitation);
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('[name="password"]')).toBeTruthy();
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.required).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.value === '').toBe(true);
    expect(window.location.search).toBe('?keep=1');
    expect(storage).not.toHaveBeenCalled();
  });
  it('Portal 초대 목적 응답이 pagehide 뒤 도착해도 소거한 token과 수락 가능 상태를 복원하지 않는다', async () => {
    window.history.replaceState(null, '', '/?invitationToken=' + 'A'.repeat(43) + '&keep=2');
    let resolvePurpose!: (value: unknown) => void;
    const read = vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(async (path) => {
      if (path === '/identity') throw new ApiFailure(401, '현재 일반 인증 미완료');
      throw Error('종료 후 초대 조회는 허용하지 않는 fixture');
    });
    const command = vi.spyOn(BrowserApi.prototype, 'command').mockImplementation(async (path) => {
      if (path.endsWith('/purpose-authorities'))
        return new Promise((done) => {
          resolvePurpose = done;
        });
      throw Error('명시 수락 전 변경은 허용하지 않는 fixture');
    });
    await render(<Portal audience="CUSTOMER" />);
    input('invitation', 'portal-invitation');
    input('revision', '3');
    input('evidence', 'current-contact');
    input('evidenceRevision', '2');
    await act(async () => {
      container
        .querySelector('[data-testid="invitation-acceptance"] form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      resolvePurpose({});
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(read.mock.calls.map(([path]) => path)).toEqual(['/identity']);
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.required).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.value === '').toBe(true);
    expect(
      container.querySelector('[data-testid="invitation-acceptance"] [role="status"]'),
    ).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(window.location.search).toBe('?keep=2');
  });
  it('Portal은 제한 phase를 일반 업무로 올리지 않고 pagehide 이후 늦은 이전 identity 응답을 폐기한다', async () => {
    let resolveOld!: (value: unknown) => void,
      identityReads = 0;
    const current = {
      owner: 'IdentityRecovery',
      entity: 'Account',
      id: 'current-staff',
      revision: 1,
    };
    vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(async (path) => {
      if (path === '/identity') {
        identityReads++;
        if (identityReads === 1)
          return new Promise((done) => {
            resolveOld = done;
          });
        return { knowledge: 'KNOWN', data: { phase: 'MFA_VERIFIED', accountRef: current } };
      }
      if (path === '/staff-role-directory') return { items: [], nextCursor: null };
      throw Error('등록되지 않은 현재 UI 조회');
    });
    await render(<Portal audience="STAFF" />);
    expect(container.textContent).toContain('현재 인증을 확인');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      const show = new Event('pageshow');
      Object.defineProperty(show, 'persisted', { value: true });
      window.dispatchEvent(show);
    });
    expect(container.textContent).toContain('직원 업무');
    await act(async () =>
      resolveOld({
        knowledge: 'KNOWN',
        data: { phase: 'ENROLMENT_ONLY', accountRef: { ...current, id: 'old-account' } },
      }),
    );
    expect(container.textContent).toContain('직원 업무');
    expect(container.querySelector('[name="password"]')).toBeNull();
  });
  it('Portal의 실제401 재확인은 현재 업무를 닫고 로그아웃 성공은 모든 보호 문맥을 지운다', async () => {
    vi.spyOn(BrowserApi.prototype, 'read').mockImplementation(async (path) => {
      if (path === '/identity')
        return {
          knowledge: 'KNOWN',
          data: { phase: 'MFA_VERIFIED', accountRef: reference('Account') },
        };
      if (path === '/staff-role-directory') return { items: [], nextCursor: null };
      throw Error('등록되지 않은 현재 UI 조회');
    });
    const command = vi
      .spyOn(BrowserApi.prototype, 'command')
      .mockRejectedValue(new ApiFailure(401, '현재 세션 종료'));
    await render(<Portal audience="STAFF" />);
    await click('로그아웃');
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('[name="password"]')).toBeTruthy();
    expect(command).toHaveBeenCalledWith('/identity/session-endings', expect.any(Object));
    command.mockResolvedValue({});
    await render(<Portal audience="STAFF" key="new-current-session" />);
    await click('로그아웃');
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('[name="password"]')).toBeTruthy();
  });
  it('제한 복구 기한 정각에서 이미 표시한 등록 키와 코드를 지우고 새 effect 호출을 닫는다', async () => {
    vi.useFakeTimers();
    const api = new BrowserApi(),
      limited = outcome();
    limited.expiresAt = new Date(Date.now() + 1000).toISOString();
    vi.spyOn(api, 'read').mockResolvedValue(status());
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path === '/identity/challenges' || path.endsWith('/responses'))
        return { challengeId: 'current-password' };
      if (path.endsWith('/enrollments'))
        return {
          enrollmentRef: reference('MfaEnrollment'),
          secret: Buffer.alloc(20, 7).toString('base64url'),
        };
      throw Error('등록되지 않은 기한 fixture 호출');
    });
    await render(<RecoveryStatus api={api} caseRef={limited.caseRef!} outcome={limited} />);
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    expect(Boolean(container.querySelector('output.secret')?.textContent)).toBe(true);
    const before = command.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelector('output.secret')).toBeNull();
    expect(container.querySelectorAll('form button')[1]!.hasAttribute('disabled')).toBe(true);
    expect(command).toHaveBeenCalledTimes(before);
  });
  it('복구 UI는 새 TOTP·10코드·보관 ACK·KNOWN 원래 효과를 순서대로 요구하며 완료 뒤 비밀을 지운다', async () => {
    const api = new BrowserApi(),
      limited = outcome(),
      current = status();
    current.originalEffectKnowledge = 'KNOWN';
    const enrollment = reference('MfaEnrollment'),
      codeSet = reference('RecoveryCodeSet');
    let completed = false;
    const read = vi
      .spyOn(api, 'read')
      .mockImplementation(async () => (completed ? status('COMPLETED') : current));
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path === '/identity/challenges') return { challengeId: 'original-password' };
      if (path.endsWith('/responses')) return { challengeId: 'original-password' };
      if (path.endsWith('/enrollments'))
        return { enrollmentRef: enrollment, secret: Buffer.alloc(20, 7).toString('base64url') };
      if (path.endsWith('/enrollment-verifications'))
        return { enrollmentRef: enrollment, providerResultRef: reference('ProviderCommandResult') };
      if (path.endsWith('/recovery-code-issues'))
        return {
          codeSetRef: codeSet,
          codes: Array.from({ length: 10 }, (_, i) => String(i).padStart(32, '0')),
        };
      if (path.endsWith('/recovery-code-acknowledgements')) return codeSet;
      if (path.endsWith('/completions')) {
        completed = true;
        return { requestState: 'RESULT_RECORDED' };
      }
      throw Error('등록되지 않은 fixture 호출');
    });
    await render(<RecoveryStatus api={api} caseRef={limited.caseRef!} outcome={limited} />);
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    expect(
      Boolean(container.querySelector('[data-testid="recovery-setup-key"]')?.textContent),
    ).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[name="password"]')!.value === '').toBe(true);
    input('factor', '123456');
    await submit(1);
    expect(container.querySelector('[data-testid="recovery-setup-key"]')).toBeNull();
    expect(Boolean(container.querySelector('[data-testid="recovery-codes"]')?.textContent)).toBe(
      true,
    );
    expect(container.querySelectorAll('form button')[1]!.hasAttribute('disabled')).toBe(true);
    await act(async () =>
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(),
    );
    await submit(1);
    const paths = command.mock.calls.map(([path]) => path);
    expect(
      paths.indexOf(paths.find((p) => p.endsWith('/recovery-code-acknowledgements'))!),
    ).toBeLessThan(paths.indexOf(paths.find((p) => p.endsWith('/completions'))!));
    expect((command.mock.calls.at(-1)![1] as { codeSetRef: Ref }).codeSetRef).toEqual(codeSet);
    expect(completed).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    expect(container.querySelector('output.secret')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('일반 로그인을 다시 완료');
  });
  it('복구 준비 REVIEW_REQUIRED와 실제 거절을 완료로 바꾸지 않고 pagehide 이후 늦은 키 응답을 폐기한다', async () => {
    const api = new BrowserApi(),
      limited = outcome();
    vi.spyOn(api, 'read').mockResolvedValue(status());
    let resolveKey!: (value: unknown) => void;
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path.endsWith('/provider-work')) return { requestState: 'REVIEW_REQUIRED' };
      if (path === '/identity/challenges' || path.endsWith('/responses'))
        return { challengeId: 'original-password' };
      if (path.endsWith('/enrollments'))
        return new Promise((done) => {
          resolveKey = done;
        });
      throw Error('등록되지 않은 fixture 호출');
    });
    await render(<RecoveryStatus api={api} caseRef={limited.caseRef!} outcome={limited} />);
    await click('원래 제공자 처리 준비');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('보류');
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      resolveKey({
        enrollmentRef: reference('MfaEnrollment'),
        secret: Buffer.alloc(20, 7).toString('base64url'),
      });
    });
    expect(container.querySelector('output.secret')).toBeNull();
    expect(command.mock.calls.some(([path]) => path.endsWith('/completions'))).toBe(false);
  });
  it('일반 로그인은 password 이후 MFA와10코드 보관 ACK가 끝나야 인증 콜백을 호출하고 거절은 보류한다', async () => {
    const api = new BrowserApi(),
      authenticated = vi.fn(async () => {});
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path === '/identity/challenges' || path.endsWith('/responses'))
        return { challengeId: 'same-browser', phase: 'MFA_REQUIRED' };
      if (path.endsWith('/mfa-preparations')) return { secret: 'synthetic-local-registration' };
      if (path.endsWith('/mfa-enrolment-responses')) return { phase: 'CODES_REQUIRED' };
      if (path.endsWith('/recovery-code-issues'))
        return {
          setId: 'original-set',
          codes: Array.from({ length: 10 }, (_, i) => String(i).padStart(32, '0')),
        };
      if (path.endsWith('/recovery-code-acknowledgements')) return {};
      throw Error('등록되지 않은 fixture 호출');
    });
    await render(<Login api={api} audience="STAFF" onAuthenticated={authenticated} />);
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    await click('새 인증 수단 등록');
    input('factor', '123456');
    await submit();
    expect(authenticated).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    await act(async () =>
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(),
    );
    await click('보관 확인 후 업무 시작');
    expect(authenticated).toHaveBeenCalledTimes(1);
    expect(command.mock.calls.at(-1)![1]).toEqual({
      challengeId: 'same-browser',
      setId: 'original-set',
      stored: true,
    });
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value === '').toBe(true);
  });
  it('사전 코드 복구는 현재 유효 set이 있을 때만 단회 요청하며 제한 결과가 일반 인증 콜백을 호출하지 않는다', async () => {
    const api = new BrowserApi(),
      authenticated = vi.fn(async () => {}),
      limited = outcome();
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path === '/identity/challenges' || path.endsWith('/responses'))
        return { challengeId: 'original-password', phase: 'MFA_REQUIRED' };
      if (path.endsWith('/saved-code-preparations'))
        return { caseRef: limited.caseRef, codeSetRef: reference('RecoveryCodeSet') };
      if (path.endsWith('/saved-code-consumptions')) return limited;
      throw Error('등록되지 않은 fixture 호출');
    });
    vi.spyOn(api, 'read').mockResolvedValue(status('HOLD'));
    await render(<Login api={api} audience="CUSTOMER" onAuthenticated={authenticated} />);
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    await click('비밀번호와 사전 복구 코드로 직접 복구');
    input('savedCode', '0'.repeat(32));
    await submit(1);
    const data = command.mock.calls.at(-1)![1] as {
      challengeId: string;
      setId: string;
      caseRef: Ref;
    };
    expect(data.challengeId).toBe('original-password');
    expect(data.caseRef).toEqual(limited.caseRef);
    expect(data.setId).toBe(reference('RecoveryCodeSet').id);
    expect(authenticated).not.toHaveBeenCalled();
    expect(container.querySelector('[name="savedCode"]')).toBeNull();
    await click('새 일반 로그인으로 돌아가기');
    expect(container.querySelector('[name="password"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="recovery-status"]')).toBeNull();
  });
  it('password 거절·사전 set 누락은 인증 성공이 아니며 화면 종료는 MFA 등록 자료를 소거한다', async () => {
    const api = new BrowserApi(),
      authenticated = vi.fn(async () => {});
    let deny = true;
    vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (deny) throw Error('현재 인증 거절');
      if (path.endsWith('/saved-code-preparations'))
        return { caseRef: outcome().caseRef, codeSetRef: null };
      if (path.endsWith('/mfa-preparations')) return { secret: 'synthetic-registration' };
      if (path === '/identity/challenges' || path.endsWith('/responses'))
        return { challengeId: 'current', phase: 'MFA_REQUIRED' };
      throw Error('등록되지 않은 fixture 호출');
    });
    await render(<Login api={api} audience="CUSTOMER" onAuthenticated={authenticated} />);
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('거절');
    expect(container.querySelector<HTMLInputElement>('[name="password"]')!.value === '').toBe(true);
    deny = false;
    input('login', 'synthetic@example.invalid');
    input('password', 'synthetic-password');
    await submit();
    await click('비밀번호와 사전 복구 코드로 직접 복구');
    expect(
      Array.from(container.querySelectorAll('button')).find(
        (x) => x.textContent === '현재 사전 코드 단회 확인',
      )!.disabled,
    ).toBe(true);
    await click('새 인증 수단 등록');
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(container.querySelector('output.secret')).toBeNull();
    expect(authenticated).not.toHaveBeenCalled();
  });
  it('초대는 목적 조회 뒤 별도 명시 수락만 요청하고 원래 Ref/개정·키를 전송하며 수락 후 token을 소거한다', async () => {
    const api = new BrowserApi(),
      consumed = vi.fn(),
      invitation = reference('MembershipInvitation', 'original-invitation', 3);
    let accepted = false;
    vi.spyOn(api, 'read').mockImplementation(async () => ({
      ...status(),
      sourceRef: invitation,
      state: accepted ? 'ACCEPTED' : 'PENDING',
    }));
    const command = vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path.endsWith('/purpose-authorities')) return {};
      if (path.endsWith('/acceptances')) {
        accepted = true;
        return { requestState: 'RESULT_RECORDED' };
      }
      throw Error('등록되지 않은 fixture 호출');
    });
    await render(<InvitationAcceptance api={api} onTokenConsumed={consumed} />);
    input('invitation', invitation.id);
    input('revision', '3');
    input('token', 'A'.repeat(43));
    input('evidence', 'current-contact');
    input('evidenceRevision', '2');
    await submit();
    expect(command).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(false);
    await click('원래 기업 초대 수락');
    const [, data, headers] = command.mock.calls[1]!;
    expect((data as { invitationRef: Ref }).invitationRef).toEqual(invitation);
    expect(headers!['X-Target-Revision']).toBe('3');
    expect(headers!['Idempotency-Key']).toBe(
      (data as { meta: { clientRequestId: string } }).meta.clientRequestId,
    );
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.value === '').toBe(true);
  });
  it.each(['RECONFIRMATION_REQUIRED', 'EXPIRED'])(
    '초대 %s는 현재 담당자 재확인 또는 원래 기한 전 수락을 요구하고 거절을 성공으로 바꾸지 않는다',
    async (state) => {
      const api = new BrowserApi();
      const observed = {
        ...status(),
        sourceRef: reference('MembershipInvitation'),
        state: state === 'EXPIRED' ? 'PENDING' : state,
        expiresAt: new Date(Date.now() + (state === 'EXPIRED' ? -1000 : 300000)).toISOString(),
      };
      vi.spyOn(api, 'read').mockResolvedValue(observed);
      const command = vi.spyOn(api, 'command').mockResolvedValue({});
      await render(<InvitationAcceptance api={api} initialToken={'A'.repeat(43)} />);
      input('invitation', observed.sourceRef.id);
      input('revision', '1');
      input('evidence', 'current-contact');
      input('evidenceRevision', '1');
      await submit();
      expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
      expect(command).toHaveBeenCalledTimes(1);
    },
  );
  it('직원 역할 개정은 행위 전체 검토 후 원래 역할 개정·키로 제출하고 별도 부여만 계정에 연결한다', async () => {
    const api = new BrowserApi(),
      report = vi.fn(),
      role = {
        owner: 'EnterpriseAccess',
        entity: 'StaffRole',
        id: 'original-staff-role',
        revision: 4,
      };
    const account = {
      owner: 'IdentityRecovery',
      entity: 'Account',
      id: 'staff-account',
      revision: 1,
    };
    api.originals.activate('STAFF', account.id);
    const read = vi.spyOn(api, 'read').mockResolvedValue({
      items: [{ roleRef: role, label: '현재 내부 역할', actions: ['product.read'], active: true }],
      nextCursor: 'next-page',
    });
    const command = vi
      .spyOn(api, 'command')
      .mockResolvedValue({ requestId: 'original-staff-request', requestState: 'RESULT_RECORDED' });
    await render(<StaffRolePanel api={api} accountRef={account} active report={report} />);
    const revisionForm = container.querySelectorAll('form')[1]!;
    (revisionForm.querySelector('select') as HTMLSelectElement).value = role.id;
    (revisionForm.querySelector('[value="identity.recovery.verify"]') as HTMLInputElement).checked =
      true;
    await submit(1);
    expect(command).not.toHaveBeenCalled();
    await submit(1);
    const [path, data, headers] = command.mock.calls[0]!;
    expect(path).toBe('/staff-roles/original-staff-role/revisions');
    expect(data).toMatchObject({
      roleRef: role,
      actions: ['identity.recovery.verify'],
      meta: { expectedRevision: 4 },
    });
    expect(headers!['X-Target-Revision']).toBe('4');
    expect(data as object).not.toHaveProperty('accountRef');
    const grantForm = container.querySelectorAll('form')[2]!;
    (grantForm.querySelector('select') as HTMLSelectElement).value = role.id;
    await submit(2);
    expect(command.mock.calls[1]![1]).toMatchObject({
      accountRef: account,
      roleRef: role,
      decision: 'GRANT',
    });
    await click('다음 직원 역할 페이지');
    expect(read).toHaveBeenLastCalledWith('/staff-role-directory?cursor=next-page');
    expect(report).not.toHaveBeenCalled();
  });
  it('직원 역할 정의는 검토 전에 부여하지 않고 현재 권한 거절·목록 실패는 원래 실패로 전달한다', async () => {
    const api = new BrowserApi(),
      report = vi.fn();
    api.originals.activate('STAFF', reference('Account').id);
    let failRead = false;
    vi.spyOn(api, 'read').mockImplementation(async () => {
      if (failRead) throw new ApiFailure(403, '현재 목록 권한 없음');
      return { items: [], nextCursor: null };
    });
    const command = vi
      .spyOn(api, 'command')
      .mockRejectedValue(new ApiFailure(403, '현재 역할 관리 권한 없음', true));
    await render(
      <StaffRolePanel api={api} accountRef={reference('Account')} active report={report} />,
    );
    input('label', '별도 내부 역할');
    (container.querySelector('[name="action"][value="product.read"]') as HTMLInputElement).checked =
      true;
    await submit();
    expect(command).not.toHaveBeenCalled();
    await submit();
    expect(command).toHaveBeenCalledWith(
      '/staff-roles',
      expect.objectContaining({ actions: ['product.read'] }),
      expect.any(Object),
      expect.any(Function),
    );
    expect(
      report.mock.calls.some(
        ([failure]) => failure instanceof ApiFailure && failure.status === 403,
      ),
    ).toBe(true);
    expect(container.textContent).not.toContain('원래 접수번호:');
    failRead = true;
    await click('내부 역할 재확인');
    expect(report).toHaveBeenCalledTimes(2);
  });
  it('인계 UI는 label/16문자/paste 필드를 제공하고 비밀이나 업무 권위를 만들지 않는다', async () => {
    const api = new BrowserApi();
    await render(<RecoveryClaim api={api} />);
    expect(container.textContent).toContain('원래 접점');
    expect(container.textContent).not.toContain('MFA_VERIFIED');
    for (const label of container.querySelectorAll('label'))
      expect(document.getElementById(label.htmlFor)).toBeTruthy();
  });
  it('서버 challenge와 새 당사자 결과만 진행 번호로 표시하며 party secret를 요청하지 않는다', async () => {
    const api = new BrowserApi(),
      command = vi
        .spyOn(api, 'command')
        .mockImplementation(async (path) =>
          path === '/identity/party-challenges'
            ? { challengeId: 'server-challenge' }
            : { partyContextRef: reference('PartyClaimContext'), challengeId: 'server-challenge' },
        );
    await render(<RecoveryClaim api={api} />);
    input('case', 'synthetic-case');
    input('revision', '1');
    await submit();
    expect(command.mock.calls[1]![1]).toEqual({
      caseRef: reference('RecoveryCase', 'synthetic-case'),
      challengeId: 'server-challenge',
    });
    expect(container.textContent).toContain('server-challenge');
    expect(container.querySelector('[name="partySecret"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('[name="code"]')!.maxLength).toBe(16);
  });
  it('단회 claim은 원래 challenge/case/code만 보내고 일반 업무 인증으로 렌더링하지 않는다', async () => {
    const api = new BrowserApi(),
      limited = outcome(),
      command = vi
        .spyOn(api, 'command')
        .mockImplementation(async (path) =>
          path === '/identity/party-challenges'
            ? { challengeId: 'server-challenge' }
            : path.endsWith('/party-contexts')
              ? { partyContextRef: reference('PartyClaimContext'), challengeId: 'server-challenge' }
              : limited,
        );
    vi.spyOn(api, 'read').mockResolvedValue(status());
    await render(<RecoveryClaim api={api} />);
    input('case', 'synthetic-case');
    input('revision', '1');
    await submit();
    input('grant', 'synthetic-grant');
    input('verifiedRevision', '2');
    input('code', 'AbCdEfGhIjKlMnOp');
    await submit();
    const data = command.mock.calls[2]![1] as Record<string, unknown>;
    expect(data.challengeId).toBe('server-challenge');
    expect(data.caseRef).toEqual(reference('RecoveryCase', 'synthetic-case', 2));
    expect(data).not.toHaveProperty('partySecret');
    expect(data).not.toHaveProperty('handle');
    expect(container.querySelector('[data-testid="recovery-status"]')).toBeTruthy();
    expect(container.textContent).not.toContain('고객 업무');
  });
  it('서버 거절은 alert이며 완료나 성공으로 바꾸지 않고 raw 코드 입력도 즉시 비운다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'command').mockImplementation(async (path) => {
      if (path === '/identity/party-challenges') return { challengeId: 'server-challenge' };
      if (path.endsWith('/party-contexts'))
        return { partyContextRef: reference('PartyClaimContext'), challengeId: 'server-challenge' };
      throw new Error('원래 인계가 만료됐습니다.');
    });
    await render(<RecoveryClaim api={api} />);
    input('case', 'synthetic-case');
    input('revision', '1');
    await submit();
    input('grant', 'synthetic-grant');
    input('verifiedRevision', '2');
    input('code', 'AbCdEfGhIjKlMnOp');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('만료');
    expect(container.querySelector<HTMLInputElement>('[name="code"]')!.value).toBe('');
    expect(container.querySelector('[data-testid="recovery-status"]')).toBeNull();
  });
  it('원래 재관측 응답의 case만 제한 상태로 연결하고 클라이언트가 다른 계정을 선택하지 않는다', async () => {
    const api = new BrowserApi(),
      read = vi
        .spyOn(api, 'read')
        .mockImplementation(async (path) =>
          path === '/identity/handoff-result' ? outcome() : status(),
        );
    await render(<RecoveryClaim api={api} />);
    await click('응답 유실 후 원래 결과 재관측');
    expect(read).toHaveBeenCalledWith('/identity/handoff-result');
    expect(container.querySelector('[data-testid="recovery-status"]')).toBeTruthy();
    expect(container.querySelector('[name="account"]')).toBeNull();
  });
  it('초대 URL의 원문은 초기 effect에서 제거하고 앱 storage에 쓰지 않는다', async () => {
    const secret = 'A'.repeat(43);
    window.history.replaceState(null, '', '/?invitationToken=' + secret);
    const local = vi.spyOn(Storage.prototype, 'setItem'),
      api = new BrowserApi();
    await render(<InvitationAcceptance api={api} />);
    expect(window.location.search).toBe('');
    expect(container.textContent?.includes(secret)).toBe(false);
    expect(local).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('[name="token"]')!.required).toBe(false);
  });
  it('HOLD/UNKNOWN은 원래 상태와 전달 요청만 표시하고 새 등록/완료를 비활성화한다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValue(status('HOLD'));
    await render(
      <RecoveryStatus
        api={api}
        caseRef={reference('RecoveryCase', 'synthetic-case')}
        outcome={outcome()}
      />,
    );
    expect(container.textContent).toContain('미확인');
    expect(container.textContent).toContain('전달 요청됨');
    expect(container.querySelector<HTMLButtonElement>('form button')!.disabled).toBe(true);
    expect(container.querySelector('[name="results"]')).toBeNull();
  });
  it('완료 결과는 새 일반 MFA 재로그인이 필요하며 기존 제한 단계로 업무 로그인 성공을 표시하지 않는다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValue(status('COMPLETED'));
    await render(
      <RecoveryStatus
        api={api}
        caseRef={reference('RecoveryCase', 'synthetic-case')}
        outcome={outcome()}
      />,
    );
    expect(container.textContent).toContain('일반 로그인을 다시 완료');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('MFA_VERIFIED');
  });
  it('pagehide는 DOM 코드/비밀번호와 진행 자료를 비우고 현재 api generation을 취소한다', async () => {
    const api = new BrowserApi(),
      reset = vi.spyOn(api, 'reset');
    vi.spyOn(api, 'command').mockImplementation(async (path) =>
      path === '/identity/party-challenges'
        ? { challengeId: 'server-challenge' }
        : { partyContextRef: reference('PartyClaimContext'), challengeId: 'server-challenge' },
    );
    await render(<RecoveryClaim api={api} />);
    input('case', 'synthetic-case');
    input('revision', '1');
    await submit();
    input('code', 'AbCdEfGhIjKlMnOp');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(reset).toHaveBeenCalled();
    expect(container.querySelector('[name="code"]')).toBeNull();
    expect(container.textContent).not.toContain('server-challenge');
  });
});
