import { canonicalJson, requireCondition, type SchemaValidator } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { U3_MODELS } from './u3-model-catalog.js';
import { U3_SUPPORT_MODELS } from './u3-support-models.js';
import { validateModel, rowModelVersion, type ModelData } from './model-catalog.js';

const check = (condition: unknown, message: string) =>
  requireCondition(condition, 400, 'U3_MODEL_CONSTRAINT', message);
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const refs = (items: unknown[]) => [...new Set(items.map(canonicalJson))].sort();
export function validateU3ModelConstraints(
  model: string,
  data: ModelData,
  schema: SchemaValidator,
): void {
  if (data.modelVersion === 2 && U3_SUPPORT_MODELS.some((entry) => entry.name === model)) {
    if (model === 'CustomerRole')
      check(
        (data.actionScopeRefs as Ref[]).length === 0,
        '새 동의 역할은 구형 범위 투영을 권위로 사용하지 않습니다.',
      );
    if (model === 'RoleRevisionState') {
      if (data.roleRef !== null) {
        check(
          data.staffRoleRef === null && (data.actions as unknown[]).length === 0,
          '새 고객 역할의 직원 행위 혼합은 허용하지 않습니다.',
        );
        check(
          data.active === false || (data.scopeRefs as Ref[]).length > 0,
          '활성 새 고객 역할의 명시 동의 술어가 필요합니다.',
        );
      } else {
        check(
          (data.scopeRefs as Ref[]).length === 0,
          '직원 역할에 고객 동의 범위를 섞을 수 없습니다.',
        );
        schema.validateUri('urn:oms:contract:u3-commercial:2#/$defs/StaffActionList', data.actions);
      }
    }
    if (model === 'ScopeV2') {
      const predicate = data.predicate as { enterpriseRef: Ref; action: string; kind: string };
      check(
        same(data.enterpriseRef, predicate.enterpriseRef) &&
          data.action === predicate.action &&
          data.kind === predicate.kind,
        '동의 술어와 실제 저장 기업·행위·종류가 다릅니다.',
      );
    }
  }
  if (!U3_MODELS.some((entry) => entry.name === model) || data.modelVersion !== 2) return;
  if (model === 'Product') {
    check(
      data.productType === 'HARDWARE'
        ? data.softwareTermKind === null
        : data.softwareTermKind !== null,
      '상품 타입과 SW 이용형을 일치시켜야 합니다.',
    );
    check(
      data.saleState !== 'OFFERABLE' || data.currentOfferRef !== null,
      '유효 판매 개정 없이 제시할 수 없습니다.',
    );
  }
  if (model === 'Order') {
    const scope = data.targetScope as { enterpriseRef: Ref };
    check(
      same(scope.enterpriseRef, data.enterpriseRef),
      '주문 기업과 고정 TargetScope가 다릅니다.',
    );
    check(
      (data.lineRefs as Ref[]).length >= 1 && (data.lineRefs as Ref[]).length <= 100,
      '주문 입력행은1~100행입니다.',
    );
  }
  if (model === 'OrderLine') {
    check(Number(data.position) <= 100, '입력행 위치는1~100입니다.');
    schema.validateUri('urn:oms:contract:u3-commercial:2#/$defs/CapturedLine', {
      productRef: data.productRef,
      commonOfferRevisionRef: data.commonOfferRevisionRef,
      agreementRevisionRefs: data.agreementRevisionRefs,
      conditionBindings: data.conditionBindings,
      quantity: data.quantity,
      paymentMode: data.requestedPaymentMode,
      requestedActivationDate: data.requestedActivationDate,
      purchasePrice: data.purchasePrice,
      priceKnowledge: data.priceKnowledge,
      paymentTermsRef: data.paymentTermsRef,
      agreedPeriod: data.agreedPeriod,
      completionBasisRef: data.completionBasisRef,
    });
  }
  if (model === 'PurchaseTermsSnapshot') {
    if (data.priceConfirmation !== undefined && data.priceConfirmation !== null)
      check(
        same(
          (data.priceConfirmation as { priceBreakdown: unknown }).priceBreakdown,
          data.priceBreakdown,
        ),
        '불변 스냅샷의 확인 전체 금액과 저장 금액이 다릅니다.',
      );
    const lines = data.capturedLines as {
      agreementRevisionRefs: Ref[];
      commonOfferRevisionRef: Ref;
      conditionBindings: unknown[];
    }[];
    check(
      same(
        refs(lines.flatMap((line) => line.agreementRevisionRefs)),
        refs(data.agreementRevisionRefs as Ref[]),
      ),
      '불변 스냅샷의 전체 기업 계약 개정이 행별 적용과 다릅니다.',
    );
    check(
      same(
        refs(lines.map((line) => line.commonOfferRevisionRef)),
        refs(data.catalogRevisionRefs as Ref[]),
      ),
      '불변 스냅샷의 공통 개정이 행별 적용과 다릅니다.',
    );
    check(
      same(
        refs(lines.flatMap((line) => line.conditionBindings)),
        refs(data.conditionBindings as unknown[]),
      ),
      '불변 스냅샷의 조건 합집합이 다릅니다.',
    );
  }
  if (model === 'CommercialProposal') {
    check(
      data.targetOrderRef !== null
        ? data.targetEntitlementRef === null &&
            data.targetRenewalCycleRef === null &&
            data.targetScope !== null
        : data.targetEntitlementRef !== null && data.targetRenewalCycleRef !== null,
      '주문 대상 또는 정확한 권한·갱신 회차를 보존해야 합니다.',
    );
    if (data.termsFingerprint !== undefined && data.termsFingerprint !== null)
      check(
        typeof data.termsFingerprint === 'string' &&
          /^[a-f0-9]{64}$/.test(data.termsFingerprint) &&
          data.originalPriceBreakdown !== undefined &&
          data.originalPriceBreakdown !== null,
        '표시 fingerprint에는 원래 확인 비용이 함께 보존돼야 합니다.',
      );
  }
  // CustomerConsent.proposalRef는 보호된 저장 개정, proposalRevision은 내용 개정이다.
  // 정확한 둘의 결합은 현재 CommercialProposal을 확인하는 소유 서비스에서 검증한다.
  if (model === 'OrderChangeApplication')
    check(
      data.changeKind === 'REVIEW_PRICE_CHANGE'
        ? data.afterSalesDecisionRef === null
        : (data.afterSalesDecisionRef as Ref)?.owner === 'AfterSalesDecision' &&
            (data.afterSalesDecisionRef as Ref)?.entity === 'AfterSalesDecisionRecord',
      '수락 전/후 변경의 U7 근거 분기가 다릅니다.',
    );
}
export function decodeU3Model(
  model: string,
  version: number,
  data: ModelData,
  schema: SchemaValidator,
): ModelData {
  check(
    U3_MODELS.some((entry) => entry.name === model) && [1, 2].includes(version),
    '등록된 U3 모델/decoder 버전이 필요합니다.',
  );
  check(rowModelVersion(model, data) === version, '원상과 decoder 버전이 다릅니다.');
  return validateModel(model, data, schema);
}
export function recordedSourceContract(
  data: ModelData,
  schema: SchemaValidator,
): { knowledge: 'UNKNOWN' } | { knowledge: 'KNOWN'; profile: string; registryVersion: number } {
  if (data.sourceContract === undefined || data.sourceContract === null)
    return { knowledge: 'UNKNOWN' };
  const value = schema.validateUri<{ profile: string; registryVersion: number }>(
    'urn:oms:contract:u3-commercial:2#/$defs/SourceContract',
    data.sourceContract,
  );
  return { knowledge: 'KNOWN', ...value };
}
export function decodeU3SupportModel(
  model: string,
  version: number,
  data: ModelData,
  schema: SchemaValidator,
): ModelData {
  check(
    U3_SUPPORT_MODELS.some((entry) => entry.name === model) && [1, 2].includes(version),
    '등록된 C01 지원 모델/decoder 버전이 필요합니다.',
  );
  check(rowModelVersion(model, data) === version, '지원 모델의 실제 원상 버전이 다릅니다.');
  return validateModel(model, data, schema);
}
