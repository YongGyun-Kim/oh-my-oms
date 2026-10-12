import {
  canonicalJson,
  declareU3Operations,
  fingerprint,
  OmsError,
  OperationRegistry,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';
import { ProtectedTransaction, U3Repository, U3Transaction } from '@oms/persistence';
import type {
  DiagnosticRequest,
  ModelData,
  OwnerDiagnostics,
  ProtectedStore,
  U3Owner,
} from '@oms/persistence';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import type { CommercialAgreement } from './commercial-agreement.js';
import { withinEffectiveWindow } from './catalog-conditions.js';
import type { EffectiveWindow } from '@oms/contracts';
import type { OrderingPolicy } from './scopes.js';
import { u3Ref } from './references.js';

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const owners = {
  ProductCatalog: {
    history: 'CatalogHistory',
    action: 'product.read',
    diagnosticAction: 'product.read',
    entities: ['Product', 'CommonOfferRevision'],
  },
  CommercialAgreement: {
    history: 'AgreementHistory',
    action: 'product.read',
    diagnosticAction: 'contract.approve',
    entities: [
      'EnterpriseContract',
      'AgreementRevision',
      'ContractChangeRequest',
      'EnterpriseOfferException',
      'CommercialProposal',
      'CustomerConsent',
    ],
  },
  OrderAcceptance: {
    history: 'OrderHistory',
    action: 'order.read',
    diagnosticAction: 'order.review.read',
    entities: ['Order'],
  },
} as const;
export interface U3OwnerRecordQuery {
  targetRef: Ref;
  targetScope: TargetScope | null;
}
export interface U3AgreementPageQuery {
  targetRef: Ref | null;
  scope: TargetScope | null;
  cursor: string | null;
  pageSize: number;
  sourceRevision: number | null;
}

// 과거 bytes는 이력으로만 읽고, 현재 원본/권한과 유효 조건을 별도로 검증한다.
export class U3OwnerQuery {
  private readonly authorization: Authorization;
  private readonly registry: OperationRegistry;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    private readonly agreement: CommercialAgreement,
    private readonly diagnostics?: OwnerDiagnostics,
  ) {
    this.authorization = new Authorization(store, now);
    this.registry = new OperationRegistry(store.schema);
    declareU3Operations(this.registry);
  }
  private async admit(
    context: ServiceContext,
    owner: U3Owner,
    scope: TargetScope | null,
    proof: unknown,
    diagnostic = false,
  ): Promise<void> {
    await this.authorization.identity(context);
    if (context.audience === 'STAFF') {
      requireCondition(
        await this.staffIngress(proof),
        403,
        'STAFF_NETWORK_REQUIRED',
        '현재 등록된 내부망 접근이 필요합니다.',
      );
      await this.authorization.requireStaff(
        context,
        diagnostic ? owners[owner].diagnosticAction : owners[owner].action,
      );
    } else {
      requireCondition(
        context.audience === 'CUSTOMER' && !diagnostic && scope,
        403,
        'U3_CUSTOMER_SCOPE',
        '고객 조회는 명시된 현재 고정 대상이 필요합니다.',
      );
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', scope);
      const enterprise = await this.authorization.lookup('Enterprise', scope.enterpriseRef.id);
      requireCondition(
        enterprise &&
          same(u3EnterpriseRef(enterprise), scope.enterpriseRef) &&
          scope.organisationRevision === scope.enterpriseRef.revision &&
          same(scope.contextPolicyRef, scope.enterpriseRef),
        409,
        'U3_ORGANISATION_REVISION',
        '현재 기업/조직 정책의 정확한 개정이 필요합니다.',
      );
      await this.authorization.requireCustomer(
        context,
        owners[owner].action,
        scope,
        enterprise.orderingContextPolicy as OrderingPolicy,
      );
    }
  }
  private async read<T>(
    context: ServiceContext,
    owner: U3Owner,
    scope: TargetScope | null,
    proof: unknown,
    observe: (tx: U3Transaction) => Promise<T>,
  ): Promise<T> {
    await this.admit(context, owner, scope, proof);
    const fence = new AuthorizationFence(this.authorization),
      snapshot = await fence.capture(context, scope?.enterpriseRef.id ?? null);
    const result = await this.store.primary.transaction(async (manager) => {
      const tx = new U3Transaction(
        new U3Repository(this.store),
        new ProtectedTransaction(manager, this.store.schema),
      );
      const value = await observe(tx);
      await tx.assertPremises();
      return value;
    });
    await this.admit(context, owner, scope, proof);
    await fence.assert(context, snapshot);
    return result;
  }
  private async enterprise(tx: U3Transaction, reference: Ref, scope: TargetScope | null) {
    requireCondition(
      reference.owner === 'EnterpriseAccess' &&
        reference.entity === 'Enterprise' &&
        (!scope || same(scope.enterpriseRef, reference)),
      400,
      'U3_ENTERPRISE_TARGET',
      '입력·현재 기업 대상·고정 범위가 같아야 합니다.',
    );
    const enterprise = await tx.current(reference);
    requireCondition(
      enterprise.approvalState === 'APPROVED' && enterprise.usageEnabled,
      403,
      'ENTERPRISE_NOT_ENABLED',
      '현재 승인된 사용 기업이 필요합니다.',
    );
  }
  private async view(
    tx: U3Transaction,
    contract: ModelData,
    enterpriseRef: Ref,
    context: ServiceContext,
    targetScope: TargetScope | null,
  ) {
    requireCondition(
      contract.modelVersion === 2 && (contract.enterpriseRef as Ref).id === enterpriseRef.id,
      404,
      'NOT_FOUND',
      '현재 같은 기업의 계약 원본이 필요합니다.',
    );
    const contractRef = u3Ref('EnterpriseContract', contract, this.store.schema),
      approvedRef = contract.currentApprovedRevisionRef as Ref | null;
    if (!approvedRef)
      return {
        knowledge: 'UNKNOWN',
        sourceRefs: [contractRef],
        observedAt: this.now().toISOString(),
        safeReasonCode: 'AGREEMENT_APPROVAL_UNCONFIRMED',
      };
    const revision = await tx.current(approvedRef);
    requireCondition(
      (revision.contractRef as Ref).id === contractRef.id,
      409,
      'AGREEMENT_TARGET',
      '승인 개정의 원래 계약 소속이 다릅니다.',
    );
    if (!withinEffectiveWindow(revision.effectiveWindow as EffectiveWindow, this.now()))
      return {
        knowledge: 'UNKNOWN',
        sourceRefs: [contractRef, approvedRef],
        observedAt: this.now().toISOString(),
        safeReasonCode: 'AGREEMENT_NOT_CURRENTLY_EFFECTIVE',
      };
    await this.agreement.approvedSources(tx, [approvedRef], {
      epoch: await this.store.currentEpoch(),
      targetEnterpriseRef: enterpriseRef,
      approvalDigest: canonicalDigest(approvedRef),
    });
    const exceptions = await this.agreement.basis.collection(tx, 'EnterpriseOfferException', {
      enterpriseRef: { id: enterpriseRef.id },
      agreementRevisionRef: { id: approvedRef.id },
    });
    const applicable = exceptions.filter((record) =>
      withinEffectiveWindow(record.effectiveWindow as EffectiveWindow, this.now()),
    );
    const proposals = await this.agreement.basis.collection(tx, 'CommercialProposal', {
        enterpriseRef: { id: enterpriseRef.id },
      }),
      allowed: ModelData[] = [];
    for (const proposal of proposals) {
      const terms = proposal.proposedTerms as { lines: { conditionRefs: Ref[] }[] } | null;
      if (
        !terms?.lines.some((line) =>
          line.conditionRefs.some((reference) => same(reference, approvedRef)),
        )
      )
        continue;
      if (context.audience === 'CUSTOMER') {
        if (!same(proposal.targetScope, targetScope)) continue;
        const enterprise = await tx.current(enterpriseRef);
        try {
          await this.authorization.requireCustomer(
            context,
            'order.read',
            targetScope!,
            enterprise.orderingContextPolicy as OrderingPolicy,
          );
        } catch (error) {
          if (error instanceof OmsError && error.code === 'ACTION_DENIED') continue;
          throw error;
        }
      }
      allowed.push(proposal);
    }
    const consents = await this.agreement.basis.collection(tx, 'CustomerConsent', {
      enterpriseRef: { id: enterpriseRef.id },
    });
    const data = {
      enterpriseRef,
      approvedRevisionRef: approvedRef,
      offerExceptionRefs: applicable.map((record) =>
        u3Ref('EnterpriseOfferException', record, this.store.schema),
      ),
      commercialTermsRef: revision.commercialTermsRef ?? null,
      provisionTermsRef: revision.provisionTermsRef ?? null,
      renewalTermsRef: revision.renewalTermsRef ?? null,
      proposalRefs: allowed.map((record) => u3Ref('CommercialProposal', record, this.store.schema)),
      consentRefs: consents
        .filter((record) =>
          allowed.some((proposal) => proposal.proposalId === (record.proposalRef as Ref).id),
        )
        .map((record) => u3Ref('CustomerConsent', record, this.store.schema)),
    };
    for (const reference of [data.commercialTermsRef, data.provisionTermsRef, data.renewalTermsRef])
      if (reference) await tx.current(reference as Ref);
    return {
      knowledge: 'KNOWN',
      data,
      sourceRefs: [
        contractRef,
        approvedRef,
        revision.approvalRef as Ref,
        ...data.offerExceptionRefs,
        ...data.proposalRefs,
        ...data.consentRefs,
      ],
      observedAt: this.now().toISOString(),
    };
  }
  async readAgreement(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: U3AgreementPageQuery,
    proof: unknown = null,
  ) {
    this.store.schema.validateUri(
      this.registry.lookup('CommercialAgreement', 'readAgreement', 3).input,
      input,
    );
    requireCondition(
      input.sourceRevision === null || input.sourceRevision === enterpriseRef.revision,
      409,
      'STALE_U3_REFERENCE',
      '현재 기업 대상 개정과 조회 개정이 다릅니다.',
    );
    return this.read(context, 'CommercialAgreement', input.scope, proof, async (tx) => {
      await this.enterprise(tx, enterpriseRef, input.scope);
      const rows = await this.store.list('EnterpriseContract', {
        equals: { enterpriseRef: { id: enterpriseRef.id }, modelVersion: 2 },
        cursor: input.cursor,
        limit: input.pageSize,
      });
      const items = [];
      for (const row of rows) {
        const reference = u3Ref('EnterpriseContract', row, this.store.schema);
        if (input.targetRef && !same(input.targetRef, reference)) continue;
        items.push(
          await this.view(tx, await tx.current(reference), enterpriseRef, context, input.scope),
        );
      }
      if (input.targetRef)
        requireCondition(
          items.length === 1,
          409,
          'STALE_U3_REFERENCE',
          '조회한 현재 계약 개정을 확인해야 합니다.',
        );
      return this.store.schema.validateUri(
        this.registry.lookup('CommercialAgreement', 'readAgreement', 3).output,
        {
          items,
          nextCursor: rows.length === input.pageSize ? String(rows.at(-1)!.contractId) : null,
          observedAt: this.now().toISOString(),
        },
      );
    });
  }
  async effectiveAgreement(
    context: ServiceContext,
    input: U3OwnerRecordQuery,
    proof: unknown = null,
  ) {
    this.store.schema.validateUri(
      this.registry.lookup('CommercialAgreement', 'effectiveAgreement', 3).input,
      input,
    );
    requireCondition(
      input.targetRef.owner === 'CommercialAgreement' &&
        input.targetRef.entity === 'EnterpriseContract',
      400,
      'AGREEMENT_TARGET',
      '정확한 현재 기업 계약 대상이 필요합니다.',
    );
    return this.read(context, 'CommercialAgreement', input.targetScope, proof, async (tx) => {
      const contract = await tx.current(input.targetRef),
        enterprise = await this.store.currentProtected(
          'Enterprise',
          (contract.enterpriseRef as Ref).id,
        );
      requireCondition(enterprise, 404, 'NOT_FOUND', '현재 기업이 필요합니다.');
      const enterpriseRef = u3EnterpriseRef(enterprise);
      await this.enterprise(tx, enterpriseRef, input.targetScope);
      return this.store.schema.validateUri(
        this.registry.lookup('CommercialAgreement', 'effectiveAgreement', 3).output,
        await this.view(tx, contract, enterpriseRef, context, input.targetScope),
      );
    });
  }
  async history(
    context: ServiceContext,
    owner: U3Owner,
    input: U3OwnerRecordQuery,
    proof: unknown = null,
  ) {
    this.store.schema.validateUri(this.registry.lookup(owner, 'readOwnerHistory', 3).input, input);
    requireCondition(
      input.targetRef.owner === owner &&
        (owners[owner].entities as readonly string[]).includes(input.targetRef.entity),
      404,
      'NOT_FOUND',
      '해당 소유자의 허용 원본 이력만 조회합니다.',
    );
    return this.read(context, owner, input.targetScope, proof, async (tx) => {
      const record = await tx.current(input.targetRef);
      if (owner === 'OrderAcceptance')
        requireCondition(
          same(record.targetScope, input.targetScope) ||
            (context.audience === 'STAFF' && input.targetScope === null),
          404,
          'NOT_FOUND',
          '주문의 고정 범위와 현재 조회 대상이 다릅니다.',
        );
      if (context.audience === 'CUSTOMER' && owner === 'CommercialAgreement') {
        let enterprise = record.enterpriseRef as Ref | undefined;
        if (input.targetRef.entity === 'AgreementRevision') {
          const parent = await this.store.currentProtected(
            'EnterpriseContract',
            (record.contractRef as Ref).id,
          );
          requireCondition(parent, 404, 'NOT_FOUND', '현재 계약 소속이 필요합니다.');
          await tx.current(u3Ref('EnterpriseContract', parent, this.store.schema));
          enterprise = parent.enterpriseRef as Ref;
        }
        requireCondition(
          enterprise && enterprise.id === input.targetScope!.enterpriseRef.id,
          404,
          'NOT_FOUND',
          '현재 같은 기업 소속 원본만 조회합니다.',
        );
        if (record.targetScope)
          requireCondition(
            same(record.targetScope, input.targetScope),
            404,
            'NOT_FOUND',
            '원래 거래의 고정 범위를 확대하지 않습니다.',
          );
      }
      if (context.audience === 'CUSTOMER' && owner === 'ProductCatalog') {
        const product =
            input.targetRef.entity === 'Product'
              ? record
              : await tx.current(record.productRef as Ref),
          offerRef = product.currentOfferRef as Ref;
        const current = await this.agreement.currentTerms(tx, {
          targetScope: input.targetScope!,
          productRef: u3Ref('Product', product, this.store.schema),
          commonOfferRevisionRef: offerRef,
        });
        requireCondition(
          current.conditionBindings.some(
            (value) => value.conditionKey === 'VISIBILITY' && value.value === true,
          ),
          404,
          'NOT_FOUND',
          '현재 고객에게 공개된 상품 이력만 조회합니다.',
        );
      }
      const identity = { owner, entity: input.targetRef.entity, id: input.targetRef.id },
        rows = await this.store.list(owners[owner].history, {
          anyOf: [{ beforeRef: identity }, { afterRef: identity }, { resultRefs: [identity] }],
          limit: 100,
        });
      requireCondition(
        rows.length > 0,
        503,
        'U3_HISTORY_UNCONFIRMED',
        '등록된 원래 이력 출처를 확인해야 합니다.',
      );
      const items = [];
      for (const row of rows) {
        const historyRef = u3Ref(owners[owner].history, row, this.store.schema);
        await tx.current(historyRef);
        requireCondition(
          row.owner === owner,
          503,
          'U3_HISTORY_OWNER',
          '이력 소유 원본이 다릅니다.',
        );
        items.push({
          historyRef,
          actorAccountRef: context.audience === 'STAFF' ? row.actorAccountRef : null,
          verifiedPersonRef: context.audience === 'STAFF' ? row.verifiedPersonRef : null,
          occurredAt: row.occurredAt,
          reason: context.audience === 'STAFF' ? row.reason : '원래 변경 이력',
          beforeRef: row.beforeRef,
          afterRef: row.afterRef,
          evidenceRefs: context.audience === 'STAFF' ? row.evidenceRefs : [],
          requestId: row.requestId,
          resultRefs:
            context.audience === 'STAFF'
              ? row.resultRefs
              : (row.resultRefs as Ref[]).filter(
                  (reference) =>
                    reference.owner === owner &&
                    (owners[owner].entities as readonly string[]).includes(reference.entity),
                ),
          correctionOf: row.correctionOf,
          sourceRevision: row.sourceRevision,
        });
      }
      return this.store.schema.validateUri(
        this.registry.lookup(owner, 'readOwnerHistory', 3).output,
        {
          historyRefs: items.map((item) => item.historyRef),
          sourceFactRefs: [],
          correctionRefs: items.flatMap((item) => (item.correctionOf ? [item.correctionOf] : [])),
          observedAt: this.now().toISOString(),
          items,
          nextCursor: rows.length === 100 ? String(rows.at(-1)!.historyId) : null,
        },
      );
    });
  }
  async diagnostic(
    context: ServiceContext,
    owner: U3Owner,
    input: DiagnosticRequest,
    proof: unknown = null,
  ) {
    this.store.schema.validateUri(
      this.registry.lookup(owner, 'readOwnerDiagnostics', 3).input,
      input,
    );
    requireCondition(
      input.owner === owner,
      403,
      'DIAGNOSTIC_SCOPE',
      '서버 소유자와 요청 범위가 같아야 합니다.',
    );
    await this.admit(context, owner, null, proof, true);
    requireCondition(
      this.diagnostics,
      503,
      'U3_DIAGNOSTIC_NOT_REGISTERED',
      '등록된 읽기 전용 진단 소유자가 필요합니다.',
    );
    const fence = new AuthorizationFence(this.authorization),
      snapshot = await fence.capture(context, null);
    for (const id of input.requestRefs) {
      const receipt = await this.store.currentProtected('RequestReceipt', id);
      requireCondition(
        receipt && receipt.owner === owner,
        404,
        'DIAGNOSTIC_REQUEST_OWNER',
        '같은 소유자의 현재 보호 접수만 대조합니다.',
      );
    }
    const result = await this.diagnostics.read(input);
    await this.admit(context, owner, null, proof, true);
    await fence.assert(context, snapshot);
    return this.store.schema.validateUri(
      this.registry.lookup(owner, 'readOwnerDiagnostics', 3).output,
      result,
    );
  }
}
function u3EnterpriseRef(data: ModelData): Ref {
  return {
    owner: 'EnterpriseAccess',
    entity: 'Enterprise',
    id: String(data.enterpriseId),
    revision: Number(data.revision),
  };
}
function canonicalDigest(value: Ref): string {
  return fingerprint(value);
}
