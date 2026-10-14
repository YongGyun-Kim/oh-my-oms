'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Ref } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
import { commandMeta, ReasonField } from './forms.tsx';
interface RolePage {
  items: {
    roleRef: Ref;
    label: string;
    actions: string[];
    active: boolean;
  }[];
  nextCursor: string | null;
}
const actions = [
  ['application.read', '기업 신청 조회'],
  ['enterprise.approve', '기업 이용 승인'],
  ['enterprise.initial-administrator.designate', '별도 최초 관리자 지정'],
  ['product.register', '상품 등록'],
  ['product.revise', '상품 개정'],
  ['product.read', '상품 조회'],
  ['order.read', '주문 조회'],
  ['order.review.read', '주문 판단 정보 조회'],
  ['staff.role.manage', '직원 역할 관리'],
  ['identity.recovery.verify', '복구 본인 확인'],
  ['identity.person.verify', '동일인 근거 확인'],
  ['enterprise.administrator.restore', '현재 관리자 재지정 확인'],
];
export function StaffRolePanel({
  api,
  accountRef,
  report,
  active,
}: {
  active: boolean;
  api: BrowserApi;
  accountRef: Ref;
  report: (error: unknown) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [page, setPage] = useState<RolePage | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<string[] | null>(null);
  const [revisionReview, setRevisionReview] = useState<string[] | null>(null);
  async function reload(cursor: string | null = null) {
    try {
      setPage(
        await api.read<RolePage>(
          '/staff-role-directory' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        ),
      );
    } catch (error) {
      setPage(null);
      report(error);
    }
  }
  useEffect(() => {
    if (active) void reload();
    else setPage(null);
  }, [active]);
  async function define(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const chosen = data.getAll('action').map(String);
    if (!review) {
      setReview(chosen);
      return;
    }
    const meta = commandMeta(data);
    setBusy(true);
    try {
      await command.execute(
        'EnterpriseAccess',
        'defineStaffRole',
        { kind: 'NONE' },
        '/staff-roles',
        { meta, label: data.get('label'), actions: chosen },
      );
      setReview(null);
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const role = page?.items.find((value) => value.roleRef.id === data.get('role'));
    if (!role) return;
    const meta = commandMeta(data);
    setBusy(true);
    try {
      await command.execute(
        'EnterpriseAccess',
        'grantStaffRole',
        { kind: 'NONE' },
        '/staff-role-grant-changes',
        { meta, accountRef, roleRef: role.roleRef, decision: 'GRANT' },
      );
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      role = page?.items.find((value) => value.roleRef.id === data.get('role')),
      chosen = data.getAll('action').map(String);
    if (!role) return;
    if (!revisionReview) {
      setRevisionReview(chosen);
      return;
    }
    const meta = { ...commandMeta(data), expectedRevision: role.roleRef.revision };
    setBusy(true);
    try {
      await command.execute(
        'EnterpriseAccess',
        'reviseStaffRole',
        { kind: 'RECORD', recordRef: role.roleRef },
        `/staff-roles/${encodeURIComponent(role.roleRef.id)}/revisions`,
        { meta, roleRef: role.roleRef, label: role.label, actions: chosen },
        role.roleRef.revision,
      );
      setRevisionReview(null);
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>내부 역할·명시 권한</h2>
      <p>
        직원의 모든 접점은 승인된 회사망과 PC1280 환경에서만 이용합니다. 역할 관리 자체가 본인의 새
        권한 자동 부여가 아닙니다.
      </p>
      <p>
        역할 관리 권한이 있을 때만 이용할 수 있습니다. 기업 승인·최초 관리자 지정·주문 정보 조회는
        서로 별도 행위입니다.
      </p>
      <form onSubmit={define} onChange={() => setReview(null)}>
        <label htmlFor="staffRoleLabel">직원 역할 이름</label>
        <input id="staffRoleLabel" name="label" required maxLength={4096} />
        <fieldset>
          <legend>명시적으로 허용할 직원 행위</legend>
          {actions.slice(0, 9).map(([action, text]) => (
            <label className="check" key={action}>
              <input type="checkbox" name="action" value={action} />
              {text}
            </label>
          ))}
        </fieldset>
        <ReasonField />
        {review && (
          <section aria-label="직원 역할 검토">
            <h3>선택한 행위 검토</h3>
            <ul>
              {review.map((action) => (
                <li key={action}>{actions.find((value) => value[0] === action)![1]}</li>
              ))}
            </ul>
            <p>역할 정의만으로 직원에게 부여되지 않습니다.</p>
          </section>
        )}
        <button disabled={busy || !!command.pending}>
          {review ? '검토한 직원 역할 등록' : '직원 행위 검토'}
        </button>
      </form>
      <form onSubmit={revise} onChange={() => setRevisionReview(null)}>
        <h3>현재 역할의 명시 행위 개정</h3>
        <p>
          현재 역할의 행위 전체를 선택합니다. 복구·동일인·재지정 확인은 별도 행위이며, 개정만으로
          본인에게 역할을 자동 부여하지 않습니다.
        </p>
        <label htmlFor="staffRevisionRole">개정할 현재 역할</label>
        <select id="staffRevisionRole" name="role" required defaultValue="">
          <option value="">현재 활성 역할 선택</option>
          {page?.items
            .filter((role) => role.active)
            .map((role) => (
              <option key={role.roleRef.id} value={role.roleRef.id}>
                {role.label} · {role.actions.join(', ')}
              </option>
            ))}
        </select>
        <fieldset>
          <legend>개정 후 허용할 전체 직원 행위</legend>
          {actions.map(([action, text]) => (
            <label className="check" key={action}>
              <input type="checkbox" name="action" value={action} />
              {text}
            </label>
          ))}
        </fieldset>
        <ReasonField />
        {revisionReview && (
          <p role="status">
            개정 후 행위:{' '}
            {revisionReview
              .map((action) => actions.find((value) => value[0] === action)?.[1])
              .join(', ')}
          </p>
        )}
        <button disabled={busy || !!command.pending}>
          {revisionReview ? '검토한 현재 역할 개정' : '역할 개정 검토'}
        </button>
      </form>
      <form onSubmit={grant}>
        <h3>현재 직원에게 역할 별도 부여</h3>
        <label htmlFor="staffRole">역할 선택</label>
        <select id="staffRole" name="role" required defaultValue="">
          <option value="">정의한 역할 선택</option>
          {page?.items
            .filter((role) => role.active)
            .map((role) => (
              <option value={role.roleRef.id} key={role.roleRef.id}>
                {role.label}
              </option>
            ))}
        </select>
        <ReasonField />
        <button disabled={busy || !!command.pending}>선택한 역할을 현재 직원에게 부여</button>
      </form>
      <button className="secondary" onClick={() => reload()}>
        내부 역할 재확인
      </button>
      {page?.nextCursor && (
        <button onClick={() => reload(page.nextCursor)}>다음 직원 역할 페이지</button>
      )}
      <OriginalCommandResult command={command} />
    </section>
  );
}
