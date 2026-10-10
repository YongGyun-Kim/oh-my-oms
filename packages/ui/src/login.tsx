'use client';
import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import type { BrowserApi } from './client.ts';
import type { IdentityView, U2LimitedOutcome } from './ui-types.ts';
import type { Ref } from '@oms/contracts';
import { RecoveryStatus } from './recovery-status.tsx';
export function Login({
  api,
  audience,
  onAuthenticated,
}: {
  api: BrowserApi;
  audience: 'CUSTOMER' | 'STAFF';
  onAuthenticated: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<'LOGIN' | 'MFA' | 'CODES'>('LOGIN');
  const [challenge, setChallenge] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [setId, setSetId] = useState('');
  const [stored, setStored] = useState(false);
  const section = useRef<HTMLElement>(null),
    [saved, setSaved] = useState<{ caseRef: Ref; codeSetRef: Ref | null } | null>(null),
    [limited, setLimited] = useState<U2LimitedOutcome | null>(null);
  useEffect(() => {
    const clear = () => {
      api.reset();
      section.current?.querySelectorAll('form').forEach((form) => form.reset());
      setSecret('');
      setCodes([]);
      setLimited(null);
      setSaved(null);
      setChallenge('');
      setPhase('LOGIN');
    };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, []);
  async function run(operation: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '인증을 확인하세요.');
    } finally {
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    event.currentTarget.reset();
    await run(async () => {
      const start = await api.command<IdentityView>('/identity/challenges', {
        loginIdentifier: data.get('login'),
      });
      const password = await api.command<IdentityView>(
        '/identity/challenges/' + start.challengeId + '/responses',
        { challengeId: start.challengeId, response: data.get('password') },
      );
      setChallenge(password.challengeId!);
      setPhase('MFA');
    });
  }
  async function factor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = new FormData(event.currentTarget).get('factor');
    await run(async () => {
      const verified = await api.command<IdentityView>(
        '/identity/challenges/' + challenge + (secret ? '/mfa-enrolment-responses' : '/responses'),
        { challengeId: challenge, response },
      );
      if (verified.phase === 'MFA_VERIFIED') {
        await onAuthenticated();
        return;
      }
      const issued = await api.command<{ setId: string; codes: string[] }>(
        '/identity/challenges/' + challenge + '/recovery-code-issues',
        { challengeId: challenge },
      );
      setSecret('');
      setSetId(issued.setId);
      setCodes(issued.codes);
      setPhase('CODES');
    });
  }
  if (limited?.caseRef)
    return (
      <section ref={section} className="access">
        <RecoveryStatus api={api} caseRef={limited.caseRef} outcome={limited} />
        <button
          type="button"
          onClick={() => {
            api.reset();
            setLimited(null);
            setSaved(null);
            setPhase('LOGIN');
          }}
        >
          새 일반 로그인으로 돌아가기
        </button>
      </section>
    );
  return (
    <section ref={section} className="access" aria-busy={busy}>
      <h1 tabIndex={-1}>{audience === 'STAFF' ? '직원 로그인' : '고객 로그인'}</h1>
      <p>비밀번호와 추가 인증을 모두 확인해야 업무에 접근할 수 있습니다.</p>
      {audience === 'STAFF' && <p>승인된 회사 접속 환경에서 이용해 주세요.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {phase === 'LOGIN' && (
        <form onSubmit={login}>
          <label htmlFor="login">로그인 이메일</label>
          <input
            id="login"
            name="login"
            type="email"
            autoComplete="username"
            required
            maxLength={4096}
          />
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={4096}
          />
          <button disabled={busy}>로그인 확인</button>
        </form>
      )}
      {phase === 'MFA' && (
        <>
          <h2>추가 인증</h2>
          {secret && (
            <>
              <p>인증 앱에 다음 등록 키를 입력해 주세요. 다른 사람에게 공유하지 마세요.</p>
              <output className="secret">{secret}</output>
            </>
          )}
          <form onSubmit={factor}>
            <label htmlFor="factor">인증 앱 코드</label>
            <input
              id="factor"
              name="factor"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={4096}
            />
            <button disabled={busy}>추가 인증 확인</button>
          </form>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const prepared = await api.command<{ secret: string }>(
                  '/identity/challenges/' + challenge + '/mfa-preparations',
                  { challengeId: challenge },
                );
                setSecret(prepared.secret);
              })
            }
          >
            새 인증 수단 등록
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setSaved(
                  await api.command<{ caseRef: Ref; codeSetRef: Ref | null }>(
                    '/identity/saved-code-preparations',
                    { challengeId: challenge },
                  ),
                );
              })
            }
          >
            비밀번호와 사전 복구 코드로 직접 복구
          </button>
          {saved && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget,
                  code = String(new FormData(form).get('savedCode'));
                form.reset();
                void run(async () => {
                  if (!saved.codeSetRef)
                    throw new Error('현재 유효 사전 코드가 없어 별도 본인 확인이 필요합니다.');
                  const outcome = await api.command<U2LimitedOutcome>(
                    `/identity/recovery-cases/${encodeURIComponent(saved.caseRef.id)}/saved-code-consumptions`,
                    {
                      caseRef: saved.caseRef,
                      challengeId: challenge,
                      setId: saved.codeSetRef.id,
                      code,
                    },
                    { 'X-Target-Revision': String(saved.caseRef.revision) },
                  );
                  setSecret('');
                  setCodes([]);
                  setLimited(outcome);
                });
              }}
            >
              <p>사전 코드는 정기 만료가 없으며 사용·회수된 코드는 사용할 수 없습니다.</p>
              <label htmlFor="savedCode">보관한32자리 사전 복구 코드</label>
              <input
                id="savedCode"
                name="savedCode"
                type="password"
                autoComplete="off"
                required
                minLength={32}
                maxLength={32}
                pattern="[a-f0-9]{32}"
              />
              <button disabled={busy || !saved.codeSetRef}>현재 사전 코드 단회 확인</button>
            </form>
          )}
        </>
      )}
      {phase === 'CODES' && (
        <>
          <h2>사전 복구 코드 보관</h2>
          <p>인증 수단을 잃었을 때 사용하는 단회 코드입니다. 안전한 장소에 보관해 주세요.</p>
          <label htmlFor="codes">복구 코드 10개</label>
          <textarea id="codes" value={codes.join('\n')} readOnly rows={10} autoComplete="off" />
          <label className="check">
            <input
              type="checkbox"
              checked={stored}
              onChange={(event) => setStored(event.target.checked)}
            />
            복구 코드를 안전한 장소에 보관했습니다.
          </label>
          <button
            disabled={!stored || busy}
            onClick={() =>
              run(async () => {
                await api.command(
                  '/identity/challenges/' + challenge + '/recovery-code-acknowledgements',
                  { challengeId: challenge, setId, stored: true },
                );
                setCodes([]);
                setSetId('');
                await onAuthenticated();
              })
            }
          >
            보관 확인 후 업무 시작
          </button>
        </>
      )}
    </section>
  );
}
