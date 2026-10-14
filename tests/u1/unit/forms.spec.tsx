// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EvidenceFields,
  ReasonField,
  commandMeta,
  evidence,
} from '../../../packages/ui/src/forms.tsx';
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});
afterEach(() => {
  document.body.replaceChildren();
});
async function render(children: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(children));
  return { container, close: async () => act(async () => root.unmount()) };
}
describe('동시에있는업무양식의라벨·확인자료·원래메타', () => {
  it('두양식의확인자료id는고유하고각label은자기양식입력에연결된다', async () => {
    const view = await render(
      <>
        <form>
          <EvidenceFields />
        </form>
        <form>
          <EvidenceFields />
        </form>
      </>,
    );
    const inputs = [...view.container.querySelectorAll('input')];
    expect(new Set(inputs.map((input) => input.id)).size).toBe(4);
    for (const label of view.container.querySelectorAll('label')) {
      const input = label.control;
      expect(input).not.toBeNull();
      expect(input!.closest('form')).toBe(label.closest('form'));
    }
    await view.close();
  });
  it('사유양식도고유한label/control관계를유지한다', async () => {
    const view = await render(
      <>
        <form>
          <ReasonField />
        </form>
        <form>
          <ReasonField />
        </form>
      </>,
    );
    const fields = [...view.container.querySelectorAll('textarea')];
    expect(new Set(fields.map((field) => field.id)).size).toBe(2);
    expect(fields.every((field) => field.required && field.name === 'reason')).toBe(true);
    await view.close();
  });
  it('확인자료번호없음을확인됨으로만들지않고빈참조로보낸다', () => {
    expect(evidence(new FormData())).toEqual([]);
  });
  it('자료번호와개정을보내도신원/기업확인은serverowner가한다', () => {
    const data = new FormData();
    data.set('evidenceNumber', 'document-reference');
    data.set('evidenceRevision', '3');
    expect(evidence(data)).toEqual([
      {
        owner: 'OperationalAssurance',
        entity: 'OperationalEvidence',
        id: 'document-reference',
        revision: 3,
      },
    ]);
  });
  it('원래요청키를전달하면메타작성으로다른키를만들지않는다', () => {
    const data = new FormData();
    data.set('reason', '원래 요청');
    expect(commandMeta(data, 7, 'original-key')).toMatchObject({
      clientRequestId: 'original-key',
      expectedRevision: 7,
      reason: '원래 요청',
      evidenceRefs: [],
    });
  });
  it('신규요청의기대개정은NULL이고생성한UUID는각요청마다다르다', () => {
    const first = commandMeta(new FormData());
    const second = commandMeta(new FormData());
    expect(first.expectedRevision).toBeNull();
    expect(first.clientRequestId).not.toBe(second.clientRequestId);
  });
});
