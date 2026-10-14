import { describe, it, expect } from 'vitest';
import { validateMembershipOrganisation } from '@oms/core';
import type { EnterpriseAccess } from '@oms/core';
import type { Ref } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
  owner: 'EnterpriseAccess',
  entity,
  id,
  revision: 1,
});
const enterprise = {
  enterpriseId: 'enterprise',
  revision: 1,
  orderingContextPolicy: { departmentUsage: 'USED', siteUsage: 'USED' },
};
function access(rows: Record<string, Record<string, unknown>> = {}) {
  return {
    authorization: { lookup: async (model: string, id: string) => rows[model + ':' + id] ?? null },
  } as unknown as EnterpriseAccess;
}
const department = {
  departmentId: 'Department',
  enterpriseRef: r('Enterprise', 'enterprise'),
  active: true,
  revision: 1,
};
const site = {
  siteId: 'BusinessSite',
  enterpriseRef: r('Enterprise', 'enterprise'),
  active: true,
  revision: 1,
};
describe('소속 전후 조직의 현재 명시 정책', () => {
  it('사용하는 두 축의 같은 기업 현재 원본을 허용한다', async () => {
    await expect(
      validateMembershipOrganisation(
        access({ 'Department:Department': department, 'BusinessSite:BusinessSite': site }),
        enterprise,
        r('Department'),
        r('BusinessSite'),
        true,
      ),
    ).resolves.toBeUndefined();
  });
  it('NOT_USED는 선택값 null만 허용한다', async () => {
    await expect(
      validateMembershipOrganisation(
        access(),
        {
          ...enterprise,
          orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
        },
        null,
        null,
        true,
      ),
    ).resolves.toBeUndefined();
  });
  it('사용 축의 누락값을 거절한다', async () => {
    await expect(
      validateMembershipOrganisation(access(), enterprise, null, null, true),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_POLICY' });
  });
  it('UNSET는 active 소속의 근거가 아니다', async () => {
    await expect(
      validateMembershipOrganisation(
        access(),
        {
          ...enterprise,
          orderingContextPolicy: { departmentUsage: 'UNSET', siteUsage: 'NOT_USED' },
        },
        null,
        null,
        true,
      ),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_POLICY' });
  });
  it('타기업 선택값을 거절한다', async () => {
    await expect(
      validateMembershipOrganisation(
        access({
          'Department:Department': { ...department, enterpriseRef: r('Enterprise', 'other') },
        }),
        enterprise,
        r('Department'),
        r('BusinessSite'),
        true,
      ),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_ORGANISATION' });
  });
  it('stale 개정과 다른 owner/entity를 거절한다', async () => {
    for (const selected of [
      { ...r('Department'), revision: 2 },
      { ...r('Department'), owner: 'IdentityRecovery' },
    ])
      await expect(
        validateMembershipOrganisation(
          access({ 'Department:Department': department }),
          enterprise,
          selected,
          r('BusinessSite'),
          true,
        ),
      ).rejects.toMatchObject({ code: 'MEMBERSHIP_ORGANISATION' });
  });
  it('비활성 소속에는 원래 retired 조직을 보존한다', async () => {
    await expect(
      validateMembershipOrganisation(
        access({
          'Department:Department': { ...department, active: false },
          'BusinessSite:BusinessSite': { ...site, active: false },
        }),
        enterprise,
        r('Department'),
        r('BusinessSite'),
        false,
      ),
    ).resolves.toBeUndefined();
  });
  it('active 소속은 retired 조직을 사용할 수 없다', async () => {
    await expect(
      validateMembershipOrganisation(
        access({ 'Department:Department': { ...department, active: false } }),
        enterprise,
        r('Department'),
        r('BusinessSite'),
        true,
      ),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_ORGANISATION' });
  });
});
