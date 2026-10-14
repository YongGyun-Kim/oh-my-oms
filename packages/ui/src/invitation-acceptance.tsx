'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Ref, Receipt } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { U2StatusView } from './ui-types.ts';
export function InvitationAcceptance({
  api,
  initialToken,
  onTokenConsumed,
}: {
  api: BrowserApi;
  initialToken?: string;
  onTokenConsumed?: () => void;
}) {
  const id = useId(),
    generation = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    section = useRef<HTMLElement>(null),
    [view, setView] = useState<U2StatusView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(initialToken ?? ''),
    [selected, setSelected] = useState<{ invitationRef: Ref; contactVerificationRef: Ref } | null>(
      null,
    );
  useEffect(() => {
    const query = new URLSearchParams(window.location.search),
      raw = query.get('invitationToken');
    if (raw) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (/^[A-Za-z0-9_-]{43}$/.test(raw)) setToken(raw);
      else setError('원래 초대 값을 다시 확인하세요.');
    }
    const clear = () => {
      api.reset();
      section.current?.querySelectorAll('form').forEach((form) => form.reset());
      generation.current++;
      setToken('');
      onTokenConsumed?.();
      setView(null);
      setSelected(null);
    };
    window.addEventListener('pagehide', clear);
    return () => {
      generation.current++;
      window.removeEventListener('pagehide', clear);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [view]);
  async function run(operation: (current: () => boolean) => Promise<void>) {
    const captured = generation.current;
    setBusy(true);
    setError('');
    try {
      await operation(() => captured === generation.current);
    } catch (failure) {
      if (captured === generation.current)
        setError(failure instanceof Error ? failure.message : '원래 초대를 확인하세요.');
    } finally {
      if (captured === generation.current) setBusy(false);
    }
  }
  async function exchange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      invitationRef: Ref = {
        owner: 'EnterpriseAccess',
        entity: 'MembershipInvitation',
        id: String(data.get('invitation')),
        revision: Number(data.get('revision')),
      },
      contactVerificationRef: Ref = {
        owner: 'IdentityRecovery',
        entity: 'VerificationEvidence',
        id: String(data.get('evidence')),
        revision: Number(data.get('evidenceRevision')),
      },
      response = token || String(data.get('token'));
    form.reset();
    await run(async (isCurrent) => {
      await api.command(
        `/membership-invitations/${encodeURIComponent(invitationRef.id)}/purpose-authorities`,
        { invitationRef, response, contactVerificationRef },
        { 'X-Target-Revision': String(invitationRef.revision) },
      );
      if (!isCurrent()) return;
      setToken(response);
      setSelected({ invitationRef, contactVerificationRef });
      const observed = await api.read<U2StatusView>(
        `/membership-invitations/${encodeURIComponent(invitationRef.id)}`,
      );
      if (isCurrent()) setView(observed);
    });
  }
  async function accept() {
    if (!selected || !view) return;
    await run(async (isCurrent) => {
      const meta = {
        clientRequestId: crypto.randomUUID(),
        expectedRevision: view.sourceRef.revision,
        reason: '본인의 원래 기업 초대 명시 수락',
        evidenceRefs: [],
      };
      await api.command<Receipt>(
        `/membership-invitations/${encodeURIComponent(view.sourceRef.id)}/acceptances`,
        {
          meta,
          invitationRef: view.sourceRef,
          response: token,
          contactVerificationRef: selected.contactVerificationRef,
        },
        {
          'Idempotency-Key': meta.clientRequestId,
          'X-Target-Revision': String(view.sourceRef.revision),
        },
      );
      if (!isCurrent()) return;
      setToken('');
      onTokenConsumed?.();
      const observed = await api.read<U2StatusView>(
        `/membership-invitations/${encodeURIComponent(view.sourceRef.id)}`,
      );
      if (isCurrent()) setView(observed);
    });
  }
  const expired = !!view?.expiresAt && Date.now() >= Date.parse(view.expiresAt);
  return (
    <section ref={section} aria-busy={busy} data-testid="invitation-acceptance">
      <h2 ref={heading} tabIndex={-1}>
        내 기업 초대 확인
      </h2>
      <p>
        비밀번호·추가 인증과 본인 연락 확인 후 초대를 직접 수락합니다. 초대는 원래7일 기한이며
        재발송으로 연장되지 않습니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {!view && (
        <form onSubmit={exchange}>
          <label htmlFor={id + '-invitation'}>원래 초대 번호</label>
          <input id={id + '-invitation'} name="invitation" required maxLength={128} />
          <label htmlFor={id + '-revision'}>원래 초대 차수</label>
          <input id={id + '-revision'} name="revision" type="number" min={1} required />
          <label htmlFor={id + '-token'}>받은 초대 확인 값</label>
          <input
            id={id + '-token'}
            name="token"
            type="password"
            required={!token}
            maxLength={43}
            minLength={43}
            autoComplete="off"
          />
          <label htmlFor={id + '-evidence'}>본인 연락 확인 자료 번호</label>
          <input id={id + '-evidence'} name="evidence" required maxLength={128} />
          <label htmlFor={id + '-evidence-revision'}>연락 확인 자료 차수</label>
          <input
            id={id + '-evidence-revision'}
            name="evidenceRevision"
            type="number"
            min={1}
            required
          />
          <button disabled={busy}>본인 목적의 원래 초대 조회</button>
        </form>
      )}
      {view && (
        <>
          <p role="status">
            {view.state} · {view.remainingAction}
          </p>
          <p>
            원래 기한: {view.expiresAt ?? '현재 확인 필요'} · 통지:{' '}
            {view.noticeDelivery === 'DELIVERED'
              ? '전달 확인'
              : '전달 요청과 실제 수신은 별도입니다.'}
          </p>
          <button
            type="button"
            disabled={busy || expired || view.state !== 'PENDING'}
            onClick={accept}
          >
            원래 기업 초대 수락
          </button>
          {view.state === 'RECONFIRMATION_REQUIRED' && (
            <p>초대자·조직·역할이 변경됐습니다. 현재 담당자의 재확인 전에는 수락할 수 없습니다.</p>
          )}
          {expired && <p role="alert">원래 초대 기한이 지났습니다.</p>}
        </>
      )}
    </section>
  );
}
