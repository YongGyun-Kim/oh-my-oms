import { fingerprint, requireCondition } from '@oms/contracts';
import type { InvocationTarget, Receipt, ServiceContext, TargetScope } from '@oms/contracts';
import { HttpAttempts, originalScopedKey } from '@oms/persistence';
import type { ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import type { OrderingPolicy } from './scopes.js';
export class WorkInquiry {
  private readonly authorization: Authorization;
  private readonly commands: Commands;
  constructor(
    readonly store: ProtectedStore,
    now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
  }
  async probeOriginal(
    context: ServiceContext,
    input: Parameters<WorkInquiry['lookupOriginal']>[1],
  ): Promise<unknown> {
    this.store.schema.validateUri(
      'urn:oms:contract:foundation:1#/$defs/OriginalReceiptLookup',
      input,
    );
    await this.authorization.identity(context);
    const epoch = await this.store.currentEpoch();
    const rows = (await this.store.primary.query(
      'SELECT data FROM u1_request_key WHERE scoped_key=$1 LIMIT 1',
      [originalScopedKey(context, input)],
    )) as { data: { requestId: string } }[];
    if (rows[0]) {
      const visible = await this.store.read('RequestReceipt', rows[0].data.requestId);
      if (visible)
        return {
          disposition: 'RECEIPT',
          receipt: await this.readReceipt(context, rows[0].data.requestId),
          observedAt: new Date().toISOString(),
        };
    }
    const absent =
      !rows[0] &&
      (await new HttpAttempts(this.store.primary).provenNotAccepted(context, input, epoch));
    return {
      disposition: absent ? 'NOT_ACCEPTED' : 'UNCONFIRMED',
      clientRequestId: input.clientRequestId,
      observedAt: new Date().toISOString(),
      safeReason: absent
        ? 'REVIEW_INPUT_AND_AUTHORITY'
        : 'ORIGINAL_OUTCOME_RECONCILIATION_REQUIRED',
    };
  }
  async lookupOriginal(
    context: ServiceContext,
    input: { owner: string; operation: string; target: InvocationTarget; clientRequestId: string },
  ): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:foundation:1#/$defs/OriginalReceiptLookup',
      input,
    );
    await this.authorization.identity(context);
    const key = fingerprint({
      principalId: context.principalId,
      audience: context.audience,
      owner: input.owner,
      operation: input.operation,
      target: input.target,
      key: input.clientRequestId,
    });
    const rows = (await this.store.primary.query(
      'SELECT data FROM u1_request_key WHERE scoped_key=$1 LIMIT 1',
      [key],
    )) as { data: { requestId: string } }[];
    requireCondition(rows[0], 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const visible = await this.store.read('RequestReceipt', rows[0].data.requestId);
    requireCondition(
      visible,
      503,
      'ORIGINAL_PROTECTION_PENDING',
      '원래 접수의 보호 결과 대조가 필요합니다.',
    );
    return this.readReceipt(context, rows[0].data.requestId);
  }
  async readReceipt(context: ServiceContext, requestId: string): Promise<Receipt> {
    this.store.schema.validate('Id', requestId);
    await this.authorization.identity(context);
    const receipt = await this.store.read('RequestReceipt', requestId);
    requireCondition(
      receipt &&
        receipt.audience === context.audience &&
        receipt.principalId === context.principalId,
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    if (receipt.targetScope && context.audience === 'CUSTOMER') {
      const target = receipt.targetScope as TargetScope;
      const original = await this.store.readRevision(
        'Enterprise',
        target.enterpriseRef.id,
        target.organisationRevision,
      );
      requireCondition(
        original,
        503,
        'ORIGINAL_POLICY_MISSING',
        '원래 조직 정책을 확인해야 합니다.',
      );
      await this.authorization.requireCustomer(
        context,
        receipt.owner === 'OrderAcceptance'
          ? 'order.read'
          : ['setOrderingContextPolicy', 'upsertOrganisation'].includes(String(receipt.operation))
            ? 'organisation.manage'
            : receipt.operation === 'upsertMembership'
              ? 'user.manage'
              : 'role.manage',
        target,
        original.orderingContextPolicy as OrderingPolicy,
      );
    }
    if (context.audience === 'STAFF') {
      const action = {
        approveEnterprise: 'enterprise.approve',
        designateInitialAdministrator: 'enterprise.initial-administrator.designate',
        registerProduct: 'product.register',
        reviseProduct: 'product.revise',
        defineStaffRole: 'staff.role.manage',
        grantStaffRole: 'staff.role.manage',
      }[String(receipt.operation)];
      requireCondition(
        action,
        403,
        'RECEIPT_ACTION_NOT_REGISTERED',
        '접수 조회 행위가 등록되지 않았습니다.',
      );
      await this.authorization.requireStaff(context, action);
    }
    return this.commands.receipt(receipt);
  }
}
