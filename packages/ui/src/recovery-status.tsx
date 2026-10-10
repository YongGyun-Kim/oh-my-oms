'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Ref, Receipt } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { U2LimitedOutcome, U2StatusView } from './ui-types.ts';
function base32(base64: string): string {
  const bytes = atob(base64),
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0,
    value = 0,
    out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte.charCodeAt(0);
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
export function RecoveryStatus({
  api,
  caseRef,
  outcome,
}: {
  api: BrowserApi;
  caseRef: Ref;
  outcome: U2LimitedOutcome;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    section = useRef<HTMLElement>(null),
    generation = useRef(0),
    [view, setView] = useState<U2StatusView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remaining, setRemaining] = useState(0),
    [secret, setSecret] = useState(''),
    [enrollment, setEnrollment] = useState<Ref | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [codeSet, setCodeSet] = useState<Ref | null>(null),
    [results, setResults] = useState<Ref[]>([]),
    [verified, setVerified] = useState(false),
    [stored, setStored] = useState(false);
  const current = view?.sourceRef ?? caseRef,
    expired = remaining <= 0,
    blocked =
      !view ||
      expired ||
      view?.state === 'HOLD' ||
      view?.knowledge === 'UNKNOWN' ||
      view?.state === 'COMPLETED';
  async function refresh() {
    const captured = generation.current,
      result = await api.read<U2StatusView>(
        `/identity/recovery-cases/${encodeURIComponent(caseRef.id)}`,
      );
    if (captured === generation.current) setView(result);
  }
  useEffect(() => {
    const captured = generation.current;
    void refresh().catch((failure) => {
      if (captured === generation.current)
        setError(failure instanceof Error ? failure.message : '원래 상태를 확인하세요.');
    });
    const tick = () => {
      const left = Math.max(0, Math.ceil((Date.parse(outcome.expiresAt) - Date.now()) / 1000));
      setRemaining(left);
      if (!left) {
        setSecret('');
        setCodes([]);
      }
    };
    tick();
    const timer = setInterval(tick, 1000),
      clear = () => {
        api.reset();
        section.current?.querySelectorAll('form').forEach((form) => form.reset());
        section.current?.querySelectorAll('output.secret').forEach((output) => {
          output.textContent = '';
        });
        generation.current++;
        setSecret('');
        setCodes([]);
        setView(null);
      };
    window.addEventListener('pagehide', clear);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener('pagehide', clear);
    };
  }, [caseRef.id, outcome.authorityRef.id]);
  useEffect(() => {
    heading.current?.focus();
    if (view?.state === 'HOLD' || view?.state === 'COMPLETED') {
      setSecret('');
      setCodes([]);
    }
  }, [view?.state]);
  async function run(operation: (current: () => boolean) => Promise<void>) {
    const captured = generation.current;
    setBusy(true);
    setError('');
    try {
      await operation(
        () => captured === generation.current && Date.now() < Date.parse(outcome.expiresAt),
      );
    } catch (failure) {
      if (captured === generation.current) {
        setSecret('');
        setCodes([]);
        setError(failure instanceof Error ? failure.message : '원래 처리 결과를 다시 확인하세요.');
      }
    } finally {
      if (captured === generation.current) setBusy(false);
    }
  }
  async function prepare() {
    await run(async (isCurrent) => {
      const meta = {
          clientRequestId: crypto.randomUUID(),
          expectedRevision: current.revision,
          reason: '원래 복구의 제공자 처리 준비',
          evidenceRefs: [],
        },
        receipt = await api.command<Receipt>(
          `/identity/recovery-cases/${encodeURIComponent(current.id)}/provider-work`,
          { meta, caseRef: current },
          {
            'Idempotency-Key': meta.clientRequestId,
            'X-Target-Revision': String(current.revision),
          },
        );
      if (!isCurrent()) return;
      if (receipt.requestState === 'REVIEW_REQUIRED')
        setError('제공자·원래 효과 확인이 필요한 보류입니다.');
      await refresh();
    });
  }
  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      login = String(data.get('login')),
      password = String(data.get('password'));
    form.reset();
    await run(async (isCurrent) => {
      const start = await api.command<{ challengeId: string }>('/identity/challenges', {
        loginIdentifier: login,
      });
      if (!isCurrent()) return;
      const proof = await api.command<{ challengeId: string }>(
        `/identity/challenges/${encodeURIComponent(start.challengeId)}/responses`,
        { challengeId: start.challengeId, response: password },
      );
      if (!isCurrent()) return;
      const prepared = await api.command<{ enrollmentRef: Ref; secret: string }>(
        `/identity/recovery-cases/${encodeURIComponent(current.id)}/enrollments`,
        { caseRef: current, passwordChallengeId: proof.challengeId },
        { 'X-Target-Revision': String(current.revision) },
      );
      if (!isCurrent()) return;
      setEnrollment(prepared.enrollmentRef);
      setSecret(base32(prepared.secret));
    });
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const form = event.currentTarget,
      response = String(new FormData(form).get('factor'));
    form.reset();
    await run(async (isCurrent) => {
      const result = await api.command<{ enrollmentRef: Ref; providerResultRef: Ref }>(
        `/identity/recovery-cases/${encodeURIComponent(current.id)}/enrollment-verifications`,
        { caseRef: current, enrollmentRef: enrollment, response },
        { 'X-Target-Revision': String(current.revision) },
      );
      if (!isCurrent()) return;
      setSecret('');
      setEnrollment(result.enrollmentRef);
      setResults([result.providerResultRef]);
      setVerified(true);
      const issued = await api.command<{ codeSetRef: Ref; codes: string[] }>(
        `/identity/recovery-cases/${encodeURIComponent(current.id)}/recovery-code-issues`,
        { caseRef: current, enrollmentRef: result.enrollmentRef },
        { 'X-Target-Revision': String(current.revision) },
      );
      if (!isCurrent()) return;
      setCodeSet(issued.codeSetRef);
      setCodes(issued.codes);
    });
  }
  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment || !codeSet || !stored || view?.originalEffectKnowledge !== 'KNOWN') return;
    await run(async (isCurrent) => {
      const acknowledged = await api.command<Ref>(
        `/identity/recovery-cases/${encodeURIComponent(current.id)}/recovery-code-acknowledgements`,
        { caseRef: current, enrollmentRef: enrollment, codeSetRef: codeSet, stored: true },
        { 'X-Target-Revision': String(current.revision) },
      );
      if (!isCurrent()) return;
      setCodes([]);
      const meta = {
        clientRequestId: crypto.randomUUID(),
        expectedRevision: current.revision,
        reason: '새 MFA 확인·필수 코드 보관·원래 효과의 보호 완료',
        evidenceRefs: [],
      };
      await api.command<Receipt>(
        `/identity/recovery-cases/${encodeURIComponent(current.id)}/completions`,
        {
          meta,
          caseRef: current,
          enrollmentRef: enrollment,
          codeSetRef: acknowledged,
          providerResultRefs: [...(view.providerResultRefs ?? []), ...results],
        },
        { 'Idempotency-Key': meta.clientRequestId, 'X-Target-Revision': String(current.revision) },
      );
      if (isCurrent()) await refresh();
    });
  }
  return (
    <section ref={section} aria-busy={busy} data-testid="recovery-status">
      <h3 ref={heading} tabIndex={-1}>
        원래 복구 상태
      </h3>
      <p role="status">
        {view?.state ?? '현재 상태 확인 중'} · 제한 단계 남은 시간 {remaining}초
      </p>
      <p>새 등록 단계는 유효 청구 후 별도5분입니다. 조회·재시도로 기한이 늘어나지 않습니다.</p>
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <p>{view.remainingAction}</p>
          <p>
            실제 효과: {view.actualEffect === 'CONFIRMED' ? '확인됨' : '미확인'} · 통지:{' '}
            {view.noticeDelivery === 'DELIVERED'
              ? '전달 확인'
              : view.noticeDelivery === 'REQUESTED'
                ? '전달 요청됨'
                : '전달 미확인'}
          </p>
        </>
      )}
      <button type="button" disabled={busy} onClick={() => run(refresh)}>
        원래 상태 새로 확인
      </button>
      {view?.state === 'COMPLETED' ? (
        <p>
          이 제한 단계로 업무에 로그인되지 않습니다. 현재 비밀번호와 새 인증 앱으로 일반 로그인을
          다시 완료하세요.
        </p>
      ) : (
        <>
          <button type="button" disabled={busy || blocked || !!enrollment} onClick={prepare}>
            원래 제공자 처리 준비
          </button>
          <form onSubmit={begin}>
            <label htmlFor={id + '-login'}>복구 당사자의 로그인 이메일</label>
            <input
              id={id + '-login'}
              name="login"
              type="email"
              required
              maxLength={4096}
              autoComplete="username"
            />
            <label htmlFor={id + '-password'}>현재 확인할 비밀번호</label>
            <input
              id={id + '-password'}
              name="password"
              type="password"
              required
              maxLength={256}
              autoComplete="current-password"
            />
            <button disabled={busy || blocked || !!enrollment}>
              비밀번호 확인 후 새 인증 앱 등록
            </button>
          </form>
          {secret && (
            <>
              <p>이 등록 키를 인증 앱에 입력하세요. 이 화면 밖에 저장하거나 공유하지 마세요.</p>
              <output className="secret" data-testid="recovery-setup-key">
                {secret}
              </output>
            </>
          )}
          {enrollment && !verified && (
            <form onSubmit={verify}>
              <label htmlFor={id + '-factor'}>새 인증 앱의6자리 코드</label>
              <input
                id={id + '-factor'}
                name="factor"
                required
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <button disabled={busy || blocked}>새 인증 앱 확인</button>
            </form>
          )}
          {codes.length > 0 && (
            <>
              <h4>새 사전 복구 코드</h4>
              <p>정기 만료는 없습니다. 별도로 안전하게 보관하고 보관 확인을 완료하세요.</p>
              <output className="secret" data-testid="recovery-codes">
                {codes.join('\n')}
              </output>
              <label>
                <input
                  type="checkbox"
                  checked={stored}
                  onChange={(event) => setStored(event.target.checked)}
                />
                본인이 새 복구 코드10개를 별도로 보관했습니다
              </label>
            </>
          )}
          {verified && (
            <form onSubmit={finish}>
              <p>
                원래 제공자 효과:{' '}
                {view?.originalEffectKnowledge === 'KNOWN'
                  ? '현재 보호 결과 확인됨'
                  : '원래 효과 확인 필요'}
              </p>
              <button
                disabled={busy || blocked || !stored || view?.originalEffectKnowledge !== 'KNOWN'}
              >
                모든 원래 효과 확인·코드 보관 후 완료 요청
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
