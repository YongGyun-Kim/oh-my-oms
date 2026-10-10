'use client';
import { useId } from 'react';
import type { Ref, CommandMeta } from '@oms/contracts';
export function EvidenceFields() {
  const id = useId();
  return (
    <fieldset>
      <legend>확인 자료</legend>
      <label htmlFor={id + '-number'}>자료 번호</label>
      <input id={id + '-number'} name="evidenceNumber" maxLength={128} />
      <label htmlFor={id + '-revision'}>자료 개정</label>
      <input
        id={id + '-revision'}
        name="evidenceRevision"
        type="number"
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        defaultValue={1}
      />
      <p className="muted">
        자료 번호만으로 확인이 완료되지 않습니다. 담당자가 실제 자료와 필요한 관계를 대조합니다.
      </p>
    </fieldset>
  );
}
export function evidence(data: FormData): Ref[] {
  const id = String(data.get('evidenceNumber') ?? '').trim();
  return id
    ? [
        {
          owner: 'OperationalAssurance',
          entity: 'OperationalEvidence',
          id,
          revision: Number(data.get('evidenceRevision')),
        },
      ]
    : [];
}
export function commandMeta(
  data: FormData,
  expectedRevision: number | null = null,
  key = crypto.randomUUID(),
): CommandMeta {
  return {
    clientRequestId: key,
    expectedRevision,
    reason: String(data.get('reason') ?? '업무 요청'),
    evidenceRefs: evidence(data),
  };
}
export function ReasonField() {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>사유</label>
      <textarea id={id} name="reason" required maxLength={4096} rows={2} />
    </>
  );
}
export const emptyRead = {
  targetRef: null,
  scope: null,
  cursor: null,
  pageSize: 25,
  sourceRevision: null,
};
