'use client';
import type { FormEvent } from 'react';
import { useState } from 'react';
import type { EnterpriseView } from './ui-types.ts';
import type { BrowserApi } from './client.ts';
import { useBusinessCommand, OriginalCommandResult } from './business-command.tsx';
import { commandMeta, EvidenceFields, ReasonField } from './forms.tsx';
export function MemberPanel({
  api,
  view,
  reload,
  report,
}: {
  api: BrowserApi;
  view: EnterpriseView;
  reload: () => Promise<void>;
  report: (error: unknown) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const accountId = String(data.get('accountId'));
    const previous = view.memberships.find((member) => member.accountRef.id === accountId);
    const meta = commandMeta(data, previous?.membershipRef.revision ?? null);
    const selected = (kind: 'departments' | 'sites', field: string) =>
      view[kind].find((value) => value.recordRef.id === data.get(field))?.recordRef ?? null;
    setBusy(true);
    try {
      await command.execute(
        'EnterpriseAccess',
        'upsertMembership',
        { kind: 'ENTERPRISE', enterpriseRef: view.enterpriseRef },
        '/enterprises/' + view.enterpriseRef.id + '/membership-changes',
        {
          meta,
          accountRef: {
            owner: 'IdentityRecovery',
            entity: 'Account',
            id: accountId,
            revision: Number(data.get('accountRevision')),
          },
          departmentRef: selected('departments', 'department'),
          siteRef: selected('sites', 'site'),
          active: data.get('active') === 'on',
          administrator: data.get('administrator') === 'on',
        },
        view.enterpriseRef.revision,
      );
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>현재 허용 담당자 관리</h3>
      {view.administratorCount === 0 && (
        <p role="alert" data-testid="administrator-zero-warning">
          현재 관리자가0명입니다. 기업 이용과 다른 역할은 유지됩니다. 관리 행위 복원을 위해 현재
          근거를 갖춘 별도 재지정 확인이 필요합니다.
        </p>
      )}
      <p>
        소속 활성화가 역할이나 거래 권한의 자동 부여를 뜻하지 않습니다. 본인 관리자 권한도
        명시적으로 부여해야 합니다.
      </p>
      <div className="table-scroll" tabIndex={0} aria-label="현재 허용 담당자 표">
        <table>
          <caption>현재 담당자 관리 행위로 조회한 소속</caption>
          <thead>
            <tr>
              <th>담당자</th>
              <th>계정 번호·개정</th>
              <th>소속 상태</th>
            </tr>
          </thead>
          <tbody>
            {view.memberships.map((member) => (
              <tr key={member.membershipRef.id}>
                <td>{member.displayName}</td>
                <td>
                  {member.accountRef.id} · {member.accountRef.revision}
                </td>
                <td>
                  {member.active ? '활성' : '비활성'} ·{' '}
                  {member.administrator ? '관리자' : '일반 담당자'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit}>
        <p>
          활성 소속/관리자 변경은 실제 동일인·기업 관계·필요 위임 근거를 확인합니다. 역할이나 거래
          권한은 자동 부여하지 않습니다.
        </p>
        <label htmlFor="membership-account">확인된 소속 계정 번호</label>
        <input id="membership-account" name="accountId" required maxLength={128} />
        <label htmlFor="membership-account-revision">확인된 소속 계정 개정</label>
        <input
          id="membership-account-revision"
          name="accountRevision"
          type="number"
          min={1}
          required
          defaultValue={1}
        />
        {(['departments', 'sites'] as const).map((kind) => (
          <div key={kind}>
            <label htmlFor={'membership-' + kind}>
              {kind === 'departments' ? '소속 부서' : '소속 사업장'}
            </label>
            <select id={'membership-' + kind} name={kind === 'departments' ? 'department' : 'site'}>
              <option value="">명시적 소속 없음</option>
              {view[kind]
                .filter((value) => value.active)
                .map((value) => (
                  <option key={value.recordRef.id} value={value.recordRef.id}>
                    {value.label}
                  </option>
                ))}
            </select>
          </div>
        ))}
        <label className="check">
          <input type="checkbox" name="active" defaultChecked />
          활성 소속으로 기록
        </label>
        <label className="check">
          <input type="checkbox" name="administrator" />
          별도 관리자 지정/유지 근거 확인
        </label>
        <EvidenceFields />
        <ReasonField />
        <button disabled={busy || !!command.pending}>확인된 담당자 소속 변경 제출</button>
      </form>
      <OriginalCommandResult command={command} />
    </section>
  );
}
