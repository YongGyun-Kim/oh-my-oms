'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Ref, Receipt, ActionScope } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { ApplicationView, Page } from './ui-types.ts';
import { stateText } from './ui-types.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
import { commandMeta, EvidenceFields, evidence, ReasonField } from './forms.tsx';
export function ApplicationPanel({
  api,
  audience,
  onEnterprise,
  report,
  active,
}: {
  active: boolean;
  api: BrowserApi;
  audience: 'CUSTOMER' | 'STAFF';
  onEnterprise: (ref: Ref) => void;
  report: (error: unknown) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [page, setPage] = useState<Page<ApplicationView> | null>(null);
  const [selected, setSelected] = useState<Page<ApplicationView>['items'][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [status, setStatus] = useState('');
  async function reload(cursor: string | null = null) {
    try {
      const next = await api.read<Page<ApplicationView>>(
        '/enterprise-applications?' +
          new URLSearchParams({ pageSize: '25', ...(cursor ? { cursor } : {}) }),
      );
      setPage(next);
      setSelected(null);
    } catch (error) {
      setPage(null);
      report(error);
    }
  }
  useEffect(() => {
    if (active) void reload();
    else {
      setPage(null);
      setSelected(null);
    }
  }, [active]);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const meta = commandMeta(data);
    await run(async () => {
      const result = await command.execute(
        'EnterpriseAccess',
        'applyEnterprise',
        { kind: 'NONE' },
        '/enterprise-applications',
        {
          meta,
          legalName: data.get('legalName'),
          designatedContact: data.get('contact'),
          registrationEvidenceRefs: evidence(data),
        },
      );
      setReceipt(result);
      setStatus('신청을 접수했습니다. 직원의 기업 확인을 기다려 주세요.');
      await reload();
    });
  }
  async function decision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!selected) return;
    const application = selected.data.applicationRef;
    const meta = commandMeta(data, application.revision);
    await run(async () => {
      const result = await command.execute(
        'EnterpriseAccess',
        'approveEnterprise',
        { kind: 'RECORD', recordRef: application },
        '/enterprise-applications/' + application.id + '/decisions',
        { meta, targetRef: application, decision: data.get('decision'), basisRefs: evidence(data) },
        application.revision,
      );
      setReceipt(result);
      setStatus(stateText[result.requestState] ?? '원래 결과를 확인해 주세요.');
      await reload();
    });
  }
  async function designate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const enterprise = selected?.sourceRefs.find((value) => value.entity === 'Enterprise');
    if (!enterprise || !selected) return;
    const meta = commandMeta(data, enterprise.revision);
    const actionScopes: ActionScope[] = data.getAll('managementAction').map((action) => ({
      action: String(action),
      kind: 'ENTERPRISE_ALL',
      enterpriseRef: enterprise,
      departmentRefs: [],
      siteRefs: [],
    }));
    await run(async () => {
      const result = await command.execute(
        'EnterpriseAccess',
        'designateInitialAdministrator',
        { kind: 'ENTERPRISE', enterpriseRef: enterprise },
        '/enterprises/' + enterprise.id + '/initial-administrator-designations',
        {
          meta,
          accountRef: {
            owner: 'IdentityRecovery',
            entity: 'Account',
            id: String(data.get('candidateId')),
            revision: Number(data.get('candidateRevision')),
          },
          basisRefs: evidence(data),
          label: data.get('roleLabel'),
          actionScopes,
        },
        enterprise.revision,
      );
      setReceipt(result);
      setStatus('별도 최초 관리자 지정을 기록했습니다. 거래 권한은 별도로 부여해야 합니다.');
      await reload();
    });
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>{audience === 'STAFF' ? '기업 이용 확인' : '기업 이용 신청·결과'}</h2>
      {status && <p role="status">{status}</p>}
      {audience === 'CUSTOMER' && (
        <form onSubmit={apply}>
          <label htmlFor="legalName">기업명</label>
          <input id="legalName" name="legalName" required maxLength={4096} />
          <label htmlFor="contact">기업 연락 담당자</label>
          <input id="contact" name="contact" required maxLength={4096} />
          <EvidenceFields />
          <ReasonField />
          <p>신청은 기업 이용 승인과 별도 최초 관리자 지정을 모두 완료한 상태가 아닙니다.</p>
          <button disabled={busy || !!command.pending}>기업 이용 신청 제출</button>
        </form>
      )}
      <button className="secondary" disabled={busy} onClick={() => reload()}>
        신청 결과 재확인
      </button>
      {page && (
        <div className="table-scroll" tabIndex={0} aria-label="기업 신청 목록">
          <table>
            <caption>
              {audience === 'STAFF' ? '현재 조회 권한의 기업 신청' : '내가 제출한 기업 신청'}
            </caption>
            <thead>
              <tr>
                <th>기업</th>
                <th>확인 상태</th>
                <th>최초 관리자</th>
                <th>행동</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.data.applicationRef.id}>
                  <td>{item.data.legalName}</td>
                  <td>{stateText[item.data.state] ?? '상태 확인 필요'}</td>
                  <td>
                    {item.data.initialAdministratorRef ? '별도 지정 기록 있음' : '별도 지정 필요'}
                  </td>
                  <td>
                    <button className="secondary" disabled={busy} onClick={() => setSelected(item)}>
                      신청 상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {page.items.length === 0 && <p>조회한 범위의 신청이 없습니다.</p>}
          {page.nextCursor && (
            <button onClick={() => reload(page.nextCursor)}>다음 신청 페이지</button>
          )}
        </div>
      )}
      {selected && (
        <section>
          <h3>{selected.data.legalName} 신청</h3>
          <p>
            {stateText[selected.data.state]} · 기업 확인:{' '}
            {stateText[selected.data.confirmation] ?? '미확인'}
          </p>
          <p>담당자: {selected.data.designatedContact}</p>
          {selected.sourceRefs.find((value) => value.entity === 'Enterprise') &&
            audience === 'CUSTOMER' && (
              <button
                onClick={() =>
                  onEnterprise(selected.sourceRefs.find((value) => value.entity === 'Enterprise')!)
                }
              >
                기업 조직·권한 설정 열기
              </button>
            )}
          {audience === 'STAFF' && selected.data.state !== 'APPROVED' && (
            <form onSubmit={decision}>
              <EvidenceFields />
              <ReasonField />
              <label htmlFor="decision">기업 이용 판단</label>
              <select id="decision" name="decision">
                <option value="APPROVE">승인 요청</option>
                <option value="DECLINE">거절 요청</option>
              </select>
              <p>필수 근거가 확인되지 않으면 승인으로 확정하지 않고 확인 대상으로 남습니다.</p>
              <button disabled={busy || !!command.pending}>기업 이용 판단 기록</button>
            </form>
          )}
          {audience === 'STAFF' &&
            selected.data.state === 'APPROVED' &&
            !selected.data.initialAdministratorRef && (
              <form onSubmit={designate}>
                <p>
                  기업 승인과 관리자 지정은 별도입니다. 신청 담당자와 다른 확인된 후보도 실제
                  인물·기업 관계·위임 근거를 대조해 지정합니다. 이 입력은 계정/권한을 새로 생성하지
                  않습니다.
                </p>
                <label htmlFor="candidateId">확인된 관리자 후보 계정 번호</label>
                <input
                  id="candidateId"
                  name="candidateId"
                  required
                  maxLength={128}
                  defaultValue={selected.data.applicantAccountRef.id}
                />
                <label htmlFor="candidateRevision">확인된 후보 계정 개정</label>
                <input
                  id="candidateRevision"
                  name="candidateRevision"
                  type="number"
                  min={1}
                  required
                  defaultValue={selected.data.applicantAccountRef.revision}
                />
                <EvidenceFields />
                <ReasonField />
                <label htmlFor="roleLabel">최초 관리 역할 이름</label>
                <input id="roleLabel" name="roleLabel" required maxLength={4096} />
                <fieldset>
                  <legend>명시적으로 부여할 기업 관리 행위</legend>
                  {[
                    ['organisation.manage', '조직 관리'],
                    ['user.manage', '담당자 관리'],
                    ['role.manage', '역할 관리'],
                  ].map(([action, text]) => (
                    <label className="check" key={action}>
                      <input type="checkbox" name="managementAction" value={action} />
                      {text}
                    </label>
                  ))}
                </fieldset>
                <button disabled={busy || !!command.pending}>별도 최초 관리자 지정</button>
              </form>
            )}
        </section>
      )}
      <OriginalCommandResult command={command} />
      {receipt && (
        <p className="muted">
          원래 접수번호: {receipt.requestId} · {stateText[receipt.requestState] ?? '결과 확인 필요'}
        </p>
      )}
    </section>
  );
}
