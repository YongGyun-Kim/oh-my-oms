'use client';
import { useState, useSyncExternalStore } from 'react';
import type { CommandMeta, InvocationTarget, Receipt } from '@oms/contracts';
import { ApiFailure } from './client.ts';
import type { BrowserApi } from './client.ts';
type Probe =
  | { disposition: 'RECEIPT'; receipt: Receipt }
  | { disposition: 'NOT_ACCEPTED' | 'UNCONFIRMED'; clientRequestId: string };
export function useBusinessCommand(api: BrowserApi, report: (error: unknown) => void) {
  const pending = useSyncExternalStore(api.originals.subscribe, api.originals.snapshot, () => null);
  const [result, setResult] = useState<Receipt | null>(null);
  const [checking, setChecking] = useState(false);
  const [notAccepted, setNotAccepted] = useState<string | null>(null);
  async function execute(
    owner: string,
    operation: string,
    target: InvocationTarget,
    path: string,
    input: { meta: CommandMeta } & Record<string, unknown>,
    revision?: number,
  ): Promise<Receipt> {
    if (api.originals.snapshot())
      throw new ApiFailure(409, '새 요청을 제출하기 전에 원래 접수 결과를 확인하세요.');
    const original = {
      owner,
      operation,
      target,
      clientRequestId: input.meta.clientRequestId,
      delivery: 'PREPARING' as const,
    };
    try {
      api.originals.record(original);
    } catch {
      throw new ApiFailure(503, '원래 요청 참조를 현재 브라우저 세션에 보관할 수 없습니다.', true);
    }
    setNotAccepted(null);
    try {
      const receipt = await api.command<Receipt>(
        path,
        input,
        {
          'Idempotency-Key': original.clientRequestId,
          ...(revision ? { 'X-Target-Revision': String(revision) } : {}),
        },
        () => api.originals.delivery(original.clientRequestId, 'SENDING'),
      );
      setResult(receipt);
      api.originals.resolve(original.clientRequestId);
      return receipt;
    } catch (error) {
      if (error instanceof ApiFailure && error.requestNotSent)
        api.originals.resolve(original.clientRequestId);
      else api.originals.delivery(original.clientRequestId, 'UNKNOWN');
      throw error;
    }
  }
  async function reconcile(): Promise<void> {
    if (!pending || pending.delivery !== 'UNKNOWN' || checking) return;
    setChecking(true);
    try {
      const query = new URLSearchParams({
        owner: pending.owner,
        operation: pending.operation,
        target: JSON.stringify(pending.target),
        clientRequestId: pending.clientRequestId,
      });
      const outcome = await api.read<Probe>('/requests/original-probe?' + query);
      if (outcome.disposition === 'RECEIPT') {
        setResult(outcome.receipt);
        api.originals.resolve(pending.clientRequestId);
      } else if (
        outcome.disposition === 'NOT_ACCEPTED' &&
        outcome.clientRequestId === pending.clientRequestId
      )
        setNotAccepted(outcome.clientRequestId);
    } catch (error) {
      report(error);
    } finally {
      setChecking(false);
    }
  }
  function reviewNewIntent(): void {
    if (pending && notAccepted === pending.clientRequestId) {
      api.originals.resolve(pending.clientRequestId);
      setNotAccepted(null);
    }
  }
  return {
    execute,
    result,
    pending,
    checking,
    reconcile,
    reviewNewIntent,
    beginNewIntent: () => {
      if (!api.originals.snapshot()) setResult(null);
    },
    notAccepted: !!pending && notAccepted === pending.clientRequestId,
  };
}
export function OriginalCommandResult({
  command,
}: {
  command: ReturnType<typeof useBusinessCommand>;
}) {
  return (
    <>
      {command.pending && (
        <section className="pending" aria-label="원래 요청 결과 확인">
          <h3>
            {command.pending.delivery === 'PREPARING'
              ? '원래 요청 전송 준비'
              : command.pending.delivery === 'SENDING'
                ? '원래 요청 응답 확인 중'
                : '원래 요청 결과를 확인해야 합니다'}
          </h3>
          <p>
            {command.notAccepted
              ? '원래 요청은 접수되지 않았음을 확인했습니다. 입력과 현재 권한을 검토한 뒤 새 요청을 직접 작성할 수 있습니다.'
              : command.pending.delivery === 'PREPARING'
                ? '아직 업무 요청을 보내기 전입니다.'
                : command.pending.delivery === 'SENDING'
                  ? '보낸 요청의 응답을 기다리는 중입니다.'
                  : '접수 또는 처리 결과를 아직 확인할 수 없습니다. 새 요청을 만들지 않고 원래 요청을 다시 대조합니다.'}
          </p>
          <p>요청 참조: {command.pending.clientRequestId}</p>
          {command.notAccepted ? (
            <button onClick={command.reviewNewIntent}>입력·현재 권한 검토 후 새 요청 작성</button>
          ) : (
            <button
              disabled={command.checking || command.pending.delivery !== 'UNKNOWN'}
              onClick={() => command.reconcile()}
            >
              원래 접수 결과 확인
            </button>
          )}
        </section>
      )}
      {command.result && (
        <p role="status">
          원래 접수번호: {command.result.requestId} ·{' '}
          {command.result.requestState === 'REVIEW_REQUIRED' ? '전체 조건 확인 대기' : '결과 기록'}
        </p>
      )}
    </>
  );
}
