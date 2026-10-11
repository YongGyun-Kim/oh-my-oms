import { SchemaValidator, U3_PROFILE, requireCondition, canonicalJson } from '@oms/contracts';
import type { ScopeV2 } from '@oms/contracts';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';

const schema = new SchemaValidator();
export const U3_CONSENT_ACTION = 'contract.consent';
export function validateConsentScope(predicate: ScopeV2): ScopeV2 {
  schema.validateUri(U3_PROFILE + '#/$defs/ConsentScope', predicate);
  requireCondition(
    predicate.sourcePolicyRevision === predicate.enterpriseRef.revision,
    400,
    'U3_CONSENT_POLICY',
    '명시 동의 범위의 조직 정책 개정을 일치시켜야 합니다.',
  );
  return predicate;
}
// validator 선택은 클라이언트 action/marker가 아닌 검증된 저장 모델 버전으로만 한다.
export function currentConsentScope(row: ModelData, roleState: ModelData): ScopeV2 {
  requireCondition(
    row.modelVersion === 2 &&
      roleState.modelVersion === 2 &&
      canonicalJson(row.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT) &&
      canonicalJson(roleState.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT),
    503,
    'U3_CONSENT_PROFILE_REQUIRED',
    '동의 행위는 같은 명시 profile의 현재 역할·술어 원본이 필요합니다.',
  );
  return validateConsentScope(row.predicate as ScopeV2);
}
