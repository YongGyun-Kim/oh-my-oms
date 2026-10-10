'use client';
import { useEffect, useState } from 'react';
import type { Ref } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { Page } from './ui-types.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
interface Notice {
  notificationRef: Ref;
  minimalText: string;
  loginPath: string;
  createdAt: string;
  readAt: string | null;
  requiredActionRefs: Ref[];
}
export function NoticePanel({
  api,
  active,
  report,
}: {
  api: BrowserApi;
  active: boolean;
  report: (error: unknown) => void;
}) {
  const [page, setPage] = useState<Page<Notice> | null>(null);
  const [busy, setBusy] = useState(false);
  const command = useBusinessCommand(api, report);
  useEffect(() => {
    if (!active) setPage(null);
  }, [active]);
  async function reload(cursor: string | null = null) {
    setBusy(true);
    try {
      setPage(
        await api.read<Page<Notice>>(
          '/notifications?' +
            new URLSearchParams({ pageSize: '25', ...(cursor ? { cursor } : {}) }),
        ),
      );
    } catch (error) {
      setPage(null);
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function markRead(notice: Notice) {
    setBusy(true);
    try {
      await command.execute(
        'NotificationDelivery',
        'recordNoticeRead',
        { kind: 'RECORD', recordRef: notice.notificationRef },
        '/notifications/' + notice.notificationRef.id + '/read-receipts',
        {
          meta: {
            clientRequestId: crypto.randomUUID(),
            expectedRevision: null,
            reason: '사용자가 최소 안내의 열람을 명시적으로 확인함',
            evidenceRefs: [],
          },
          notificationRef: notice.notificationRef,
        },
      );
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>내 최소 안내</h2>
      <p>
        안내의 수신·열람은 주문 완료나 동의를 뜻하지 않습니다. 로그인 후 현재 권한으로 실제 업무
        결과를 확인하세요.
      </p>
      <button disabled={busy} onClick={() => reload()}>
        현재 안내 조회
      </button>
      {page && (
        <>
          <ul>
            {page.items.map((item) => (
              <li key={item.data.notificationRef.id}>
                <p>{item.data.minimalText}</p>
                <p className="muted">
                  기록 시각: {item.data.createdAt} ·{' '}
                  {item.data.readAt ? '열람 확인됨' : '열람 미확인'}
                </p>
                <a href={item.data.loginPath}>현재 권한으로 업무 결과 확인</a>{' '}
                <button
                  disabled={busy || item.data.readAt !== null || !!command.pending}
                  onClick={() => markRead(item.data)}
                >
                  이 안내의 열람 확인
                </button>
              </li>
            ))}
          </ul>
          {page.items.length === 0 && <p>조회한 범위의 안내가 없습니다.</p>}
          {page.nextCursor && (
            <button disabled={busy} onClick={() => reload(page.nextCursor)}>
              다음 안내 페이지
            </button>
          )}
        </>
      )}
      <OriginalCommandResult command={command} />
    </section>
  );
}
