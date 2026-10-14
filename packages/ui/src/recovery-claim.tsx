'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Ref } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { U2LimitedOutcome } from './ui-types.ts';
import { RecoveryStatus } from './recovery-status.tsx';
export function RecoveryClaim({ api }: { api: BrowserApi }) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    section = useRef<HTMLElement>(null),
    generation = useRef(0),
    [caseRef, setCase] = useState<Ref | null>(null),
    [party, setParty] = useState<{ partyContextRef: Ref; challengeId: string } | null>(null),
    [outcome, setOutcome] = useState<U2LimitedOutcome | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const clear = () => {
      api.reset();
      section.current?.querySelectorAll('form').forEach((form) => form.reset());
      generation.current++;
      setOutcome(null);
      setCase(null);
      setParty(null);
    };
    window.addEventListener('pagehide', clear);
    return () => {
      generation.current++;
      window.removeEventListener('pagehide', clear);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [party, outcome]);
  async function run(operation: (current: () => boolean) => Promise<void>) {
    const current = generation.current;
    setError('');
    setBusy(true);
    try {
      await operation(() => current === generation.current);
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error ? failure.message : '원래 본인 확인 결과를 다시 확인하세요.',
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      target: Ref = {
        owner: 'IdentityRecovery',
        entity: 'RecoveryCase',
        id: String(data.get('case')),
        revision: Number(data.get('revision')),
      };
    await run(async (isCurrent) => {
      const challenge = await api.command<{ challengeId: string }>(
        '/identity/party-challenges',
        {},
      );
      if (!isCurrent()) return;
      const created = await api.command<{ partyContextRef: Ref; challengeId: string }>(
        `/identity/recovery-cases/${encodeURIComponent(target.id)}/party-contexts`,
        { caseRef: target, challengeId: challenge.challengeId },
        { 'X-Target-Revision': String(target.revision) },
      );
      if (!isCurrent()) return;
      setCase(target);
      setParty(created);
    });
  }
  async function claim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!party || !caseRef) return;
    const form = event.currentTarget,
      data = new FormData(form),
      code = String(data.get('code')),
      grantRef: Ref = {
        owner: 'IdentityRecovery',
        entity: 'RecoveryHandoffGrant',
        id: String(data.get('grant')),
        revision: 1,
      },
      source = { ...caseRef, revision: Number(data.get('verifiedRevision')) };
    form.reset();
    await run(async (isCurrent) => {
      const meta = {
          clientRequestId: crypto.randomUUID(),
          expectedRevision: 1,
          reason: '확인 당사자의 원래 인계 코드 단회 청구',
          evidenceRefs: [],
        },
        limited = await api.command<U2LimitedOutcome>(
          `/identity/handoffs/${encodeURIComponent(grantRef.id)}/claims`,
          { meta, grantRef, caseRef: source, challengeId: party.challengeId, code },
          { 'Idempotency-Key': meta.clientRequestId, 'X-Target-Revision': '1' },
        );
      if (!isCurrent()) return;
      setCase(limited.caseRef ?? source);
      setOutcome(limited);
    });
  }
  return (
    <section ref={section} className="access" aria-busy={busy} data-testid="recovery-claim">
      <h2 ref={heading} tabIndex={-1}>
        본인 확인과 인증 수단 복구
      </h2>
      <p>
        확인 당사자의 원래 접점에서만 인계 코드를 사용할 수 있습니다. 익명 접수·코드 보유만으로 업무
        인증이 성립하지 않습니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {!party && !outcome && (
        <form onSubmit={prepare}>
          <label htmlFor={id + '-case'}>안내받은 확인 건 번호</label>
          <input id={id + '-case'} name="case" required maxLength={128} />
          <label htmlFor={id + '-revision'}>안내받은 확인 건 차수</label>
          <input id={id + '-revision'} name="revision" type="number" min={1} required />
          <button disabled={busy}>새 본인 확인 진행 시작</button>
        </form>
      )}
      {party && !outcome && (
        <>
          <p role="status">
            확인 담당자에게 이 진행 번호를 제시하고 본인 확인을 완료하세요:{' '}
            <output>{party.challengeId}</output>
          </p>
          <p>당사자 문맥 번호: {party.partyContextRef.id}</p>
          <form onSubmit={claim}>
            <label htmlFor={id + '-grant'}>안내받은 인계 건 번호</label>
            <input id={id + '-grant'} name="grant" required maxLength={128} />
            <label htmlFor={id + '-verified'}>확인 완료 건 차수</label>
            <input id={id + '-verified'} name="verifiedRevision" type="number" min={1} required />
            <label htmlFor={id + '-code'}>16문자 인계 코드</label>
            <input
              id={id + '-code'}
              name="code"
              required
              minLength={16}
              maxLength={16}
              pattern="[A-Za-z0-9_-]{16}"
              autoComplete="off"
              spellCheck={false}
            />
            <p>
              발급 후 원래5분 안에 청구합니다. 틀린 유효 형식은 최대5회이며, 본인 확인 문맥이 먼저
              만료되면 다시 확인이 필요합니다.
            </p>
            <button disabled={busy}>원래 인계 코드 확인</button>
          </form>
        </>
      )}
      {!outcome && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async (isCurrent) => {
              const result = await api.read<U2LimitedOutcome>('/identity/handoff-result');
              if (!isCurrent()) return;
              if (result.caseRef) setCase(result.caseRef);
              setOutcome(result);
            })
          }
        >
          응답 유실 후 원래 결과 재관측
        </button>
      )}
      {outcome && caseRef && <RecoveryStatus api={api} caseRef={caseRef} outcome={outcome} />}
    </section>
  );
}
