# U4 대금·청구·입금 엔티티

## 목적과 범위

[확인한 답변](functional-design-questions.md)을 사용하는 논리 모델이다. 실행 코드·실제 은행 연동·운영 검증 결과가 아니다. FinancialSettlement가 기존 9개 원본 엔티티를 소유한다. 계약과 구매 당시 총 대금·조건은 U3 소유이며 아래 원본을 입력하는 것으로 계약을 변경할 수 없다. [S1–S6]

## 논리 타입과 값 객체

| 타입 | 의미와 제약 |
| --- | --- |
| Identifier / Revision | 소유자 내 고유 식별자 / 증가하는 원본 개정. 외부 거래 식별자는 선행0·대소문자를 보존하는 불투명 문자열이다. |
| Ref / Evidence | C00의 허용 owner/entity/id/revision 참조 / 출처·대상·시점·확인자·판단 목적을 갖는 실제 근거. 아래 값 객체 이름을 Ref.entity로 보내지 않는다. |
| TargetScope | 현재 기업·조직·사업장 범위와 적용 정책 개정. 주문·청구·입금·환불의 범위가 일치해야 한다. |
| Money | KRW 원 단위의 정확한 비음수 정수. 합산도 정확한 정수로 수행한다. 입력 한계·표현 한계를 넘으면 거절하며 반올림·잘림·오버플로를 허용하지 않는다. 미확인은 금액0이 아니다. |
| DueBasis | FIXED_DATE의 합의 날짜 또는 CONFIRMED_FACT_PLUS_DAYS의 확인할 사실·소유자·합의 일수·달력 규칙. 실제 제공 완료 기산인 경우에만 Q3의 한국 날짜+달력일수 규칙을 사용한다. 실제 사실 미확인 시 dueDate는 없고 knowledge로 미확인을 구별한다. |
| AgreedPaymentPlan | U3의 승인 계약·주문 스냅샷에 고정하는 값 객체. planRevision, 주문 총액, obligationKey별 명칭·확정 금액·조건·DueBasis·출고/활성화 전 충족 필요 여부·합의 근거를 보존한다. 명칭은 자유 설명이며 고정된 계약금/중도금/잔금 enum이 아니다. |
| PaymentIdentity | 입금 원본의 수취 계좌 식별·원본 거래 식별에 대한 정규 식별값과 별칭 목록 및 검증에 사용한 sourceProfileRevision. 프로필 개정은 해석 근거이며 거래 유일성 범위를 분리하는 키가 아니다. 정확한 구성·정규화는 실제 원본으로 검증해야 한다. 기업/주문/직원 계정/요청 키·입력 채널 변경은 동일 실제 입금을 다른 거래로 만드는 차원이 아니다. |
| OrderPaymentBinding | 입금당 현재 연결 주문0..1과 원래 연결·정정 참조. 미배분 입금은 주문 미연결일 수 있으며 청구별 배분 전 한 주문에 결합한다. |
| AllocationEffect | 원래 배분에 대한 양의 반영 또는 명시적 취소 관계. 음수 입금·이력 덮어쓰기를 사용하지 않는다. 실제 환불로 확정된 금액을 미배분 현금으로 되돌리지 않는다. |
| RefundPortion | portionKey·원래 입금/배분/청구·대상 금액·현재 시도 식별·원래 작업 식별·실제 거래 식별·결과 개정·정정 관계를 보존하는 환불 부분 값 객체. 해당 부분의 금액을 확정 성공/확정 실패·미실행/결과 불명/진행 대기로 분리한다. 같은 부분의 현재 시도 하나만 원금을 예약하며 모든 과거 시도는 이력에 남긴다. 미확인 결과의 후속 확인은 새 실행 시도가 아니다. |
| Knowledge / RequestIdentity | KNOWN, UNKNOWN, CONFLICT, UNAVAILABLE / 호출자·기업·행위·본문에 결합한 원래 요청 식별. 업무 식별과 요청 재전송 식별은 별개다. |

AgreedPaymentPlan은 유효 개정 전체 합계가 승인 주문 총액과 같아야 완전하다. 청구를 아직 발행하지 않은 지급분도 계획에 남아 있어야 한다. 양의 금액의 지급분을 청구에 중복 연결하지 않고 청구 합계가 주문 총액을 넘지 않도록 한다. 취소·정정된 청구는 새 매출이 아니다. 금액0인 주문은 U3의 명시적 무상 합의로 표현하며 가짜 입금·청구를 생성하지 않는다. [Q1,Q4; FR4.3, FR7, FR8]

## Entity Model

다음 YAML이 데이터 구조의 단일 원본이다. 모든 엔티티는 공통으로 `revision`, `targetScope`, `knowledge`, `historyRefs`를 갖는다. revision과 targetScope는 필수, knowledge는 위 네 값 중 필수, historyRefs는 빈 목록부터 시작하되 실제 변경과 같은 기록 단위에서 추가한다. 별도의 임의 기본 금액·확인 상태를 두지 않는다. nullable은 확인 면제가 아니다.

```yaml
unit: u4-financial-settlement
entities:
  - name: Invoice
    owner: FinancialSettlement
    description: 계약상 지급분을 고객에게 요청하는 청구 원본과 불변 개정
    attributes:
      - {name: invoiceId, type: Identifier, required: true, unique: true}
      - {name: orderRef, type: Ref, required: true, unique: false, references: OrderAcceptance.Order}
      - {name: renewalCycleRefs, type: RefList, required: true, unique: false, references: SoftwareLifecycle.RenewalCycle}
      - {name: enterpriseRef, type: Ref, required: true, unique: false, references: EnterpriseAccess.Enterprise}
      - {name: chargeTermsRef, type: Ref, required: true, unique: false, references: OrderAcceptance.PurchaseTermsSnapshot}
      - {name: planRevision, type: Revision, required: true, unique: false}
      - {name: obligationKey, type: Identifier, required: true, unique: false}
      - {name: label, type: Text, required: true, unique: false, constraints: 공백만 있는 값은 거절하고 계약상 설명을 보존}
      - {name: amount, type: Money, required: true, unique: false, min: 1}
      - {name: dueBasis, type: DueBasis, required: true, unique: false}
      - {name: dueDate, type: KoreanDate, required: false, unique: false}
      - {name: requiredBeforeProvision, type: Boolean, required: true, unique: false}
      - {name: lifecycle, type: Enum, required: true, unique: false, allowed_values: [DRAFT, ISSUED, SUPERSEDED, CANCELLED]}
      - {name: providedTrancheRefs, type: RefList, required: true, unique: false, references: 확인된 제공 소유자의 완료 원본}
      - {name: correctionOf, type: Ref, required: false, unique: false, references: Invoice}
    constraints:
      - 주문 하나에 여러 청구가 가능하며 현재 계획의 동일 obligationKey에는 유효 청구 하나만 연결한다.
      - label을 지급 단계 종류나 제공 허용 판단의 코드로 해석하지 않는다.
      - 금액·조건·제공 전 필수 여부는 U3 승인 계획과 일치해야 하며 직원이 청구 입력으로 완화할 수 없다.
      - 지급 상태는 유효 배분·환불·충돌로 산출하며 ISSUED가 입금·통지 전달 완료를 뜻하지 않는다.
      - 최초 구매의 renewalCycleRefs는 빈 목록이고 수동 갱신 청구는 해당 갱신 주문에 결합된 회차 하나를 명시한다. 원래 구매 주문이나 다른 회차의 청구를 재사용하지 않는다.
  - name: PaymentEvidence
    owner: FinancialSettlement
    description: 실제 입금의 확인 근거와 원본 식별 및 한 주문 연결
    attributes:
      - {name: paymentEvidenceId, type: Identifier, required: true, unique: true}
      - {name: enterpriseRef, type: Ref, required: true, unique: false, references: EnterpriseAccess.Enterprise}
      - {name: sourceRef, type: Evidence, required: true, unique: false}
      - {name: externalReference, type: OpaqueText, required: false, unique: false}
      - {name: identity, type: PaymentIdentity, required: false, unique: false}
      - {name: amount, type: Money, required: false, unique: false, min: 1}
      - {name: actualPaidAt, type: Instant, required: false, unique: false}
      - {name: confirmationRef, type: Evidence, required: false, unique: false}
      - {name: binding, type: OrderPaymentBinding, required: true, unique: false}
      - {name: lifecycle, type: Enum, required: true, unique: false, allowed_values: [REVIEW, CONFIRMED, DISPUTED, REVERSED]}
      - {name: correctionRefs, type: RefList, required: true, unique: false, references: FinancialHistory}
    constraints:
      - CONFIRMED에는 양의 실제 금액·거래 식별 근거·현재 확인자가 필요하다.
      - 검증된 PaymentIdentity 및 그 별칭은 FinancialSettlement의 수취 원본 범위에서 중복될 수 없다. 기업·주문을 바꿔도 재등록을 허용하지 않는다.
      - 정정·REVERSED 후에도 식별 예약과 원래 참조를 보존하며 실제 환불과 입금 사실 정정을 혼동하지 않는다.
      - 회사명·금액·캡처 파일 해시·새 요청 키만으로 실제 거래의 동일성 또는 별개 거래임을 확정하지 않는다.
  - name: PaymentAllocation
    owner: FinancialSettlement
    description: 확인된 한 입금을 같은 주문의 청구에 연결한 금액 효과
    attributes:
      - {name: allocationId, type: Identifier, required: true, unique: true}
      - {name: paymentEvidenceRef, type: Ref, required: true, unique: false, references: PaymentEvidence}
      - {name: invoiceRef, type: Ref, required: true, unique: false, references: Invoice}
      - {name: orderRef, type: Ref, required: true, unique: false, references: OrderAcceptance.Order}
      - {name: orderLineRefs, type: RefList, required: true, unique: false, references: OrderAcceptance.OrderLine}
      - {name: renewalCycleRefs, type: RefList, required: true, unique: false, references: SoftwareLifecycle.RenewalCycle}
      - {name: amount, type: Money, required: true, unique: false, min: 1}
      - {name: effect, type: AllocationEffect, required: true, unique: false}
      - {name: decisionEvidenceRefs, type: EvidenceList, required: true, unique: false}
      - {name: correctionOf, type: Ref, required: false, unique: false, references: PaymentAllocation}
    constraints:
      - 한 입금으로 여러 청구를 충족할 수 있으나 모든 유효 연결의 주문은 동일해야 한다.
      - 입금별·청구별 잔액과 환불 예약을 함께 대조하여 중복·초과·동시 소비를 막는다.
      - 정정은 원래 효과를 참조하며 같은 취소 효과를 두 번 반영하지 않는다.
      - 갱신 회차 참조는 대상 청구·갱신 주문의 회차와 일치해야 하며 과거 회차의 지급액을 새 회차에 재사용하지 않는다.
  - name: FinancialEligibility
    owner: FinancialSettlement
    description: 특정 목적의 현재 대금 조건 판단과 사용한 근거
    attributes:
      - {name: financialEligibilityId, type: Identifier, required: true, unique: true}
      - {name: orderRef, type: Ref, required: true, unique: false, references: OrderAcceptance.Order}
      - {name: agreementRevisionRef, type: Ref, required: true, unique: false, references: CommercialAgreement.AgreementRevision}
      - {name: renewalCycleRefs, type: RefList, required: true, unique: false, references: SoftwareLifecycle.RenewalCycle}
      - {name: assessmentPurpose, type: Enum, required: true, unique: false, allowed_values: [SALE_ACCEPTANCE, PROVISION]}
      - {name: planRevision, type: Revision, required: true, unique: false}
      - {name: paymentBasisRefs, type: RefList, required: true, unique: false, references: PaymentAllocation}
      - {name: restrictionBasisRef, type: Evidence, required: false, unique: false}
      - {name: decision, type: Enum, required: true, unique: false, allowed_values: [ALLOW, HOLD, UNVERIFIED]}
      - {name: allowedQuantityBasisRef, type: Evidence, required: false, unique: false}
      - {name: sourceRevision, type: Revision, required: true, unique: false}
    constraints:
      - SALE_ACCEPTANCE는 유효 계약과 제한 근거를 확인하며 아직 청구/입금되지 않은 것만으로 수락을 순환 대기시키지 않는다.
      - PROVISION은 명시된 제공 전 지급 의무와 현재 제한·충돌을 확인하며 실제 출고/발급 완료를 생성하지 않는다.
      - FULL에서 일부 지급분 또는 일부 상품 준비만으로 전체 제공을 허용하지 않는다. 후불 잔액은 계약상 선지급 요건에 합산하지 않는다.
      - 수동 갱신의 판단은 해당 회차의 새 갱신 주문·승인 계획·회차 개정에 결합한다. 기존 주문의 ALLOW는 새 회차의 ALLOW가 아니다.
  - name: RefundCase
    owner: FinancialSettlement
    description: 승인된 환불 범위와 예약·실제 지급·실패·잔액의 대조
    attributes:
      - {name: refundCaseId, type: Identifier, required: true, unique: true}
      - {name: afterSalesDecisionRef, type: Ref, required: true, unique: false, references: AfterSalesDecision.AfterSalesDecisionRecord}
      - {name: orderRef, type: Ref, required: true, unique: false, references: OrderAcceptance.Order}
      - {name: paymentEvidenceRefs, type: RefList, required: true, unique: false, references: PaymentEvidence}
      - {name: allocationRefs, type: RefList, required: true, unique: false, references: PaymentAllocation}
      - {name: agreedLimit, type: Money, required: true, unique: false, min: 0}
      - {name: requestedAmount, type: Money, required: true, unique: false, min: 1}
      - {name: portions, type: RefundPortionList, required: true, unique: false}
      - {name: actualResultRefs, type: RefList, required: true, unique: false, references: FinancialExchange}
      - {name: lifecycle, type: Enum, required: true, unique: false, allowed_values: [REQUESTED, IN_PROGRESS, UNKNOWN, PARTIAL, COMPLETED, FAILED, CANCELLED, RECONCILING]}
    constraints:
      - 같은 주문·입금에 대한 다른 건의 확정 환불과 미확인/진행 중 예약도 남은 한도에 포함한다.
      - 요청·담당자의 전송 시도만으로 COMPLETED를 기록하지 않는다.
      - 실제 실패/미실행이 확인된 부분만 예약을 해제한다. 결과 불명은 예약을 유지한다.
      - lifecycle은 부분별 현재 결과를 집계한다. PARTIAL의 결과 불명분은 같은 원래 작업의 추가 확인으로 COMPLETED가 될 수 있다.
      - 완료/부분 결과의 근거 정정은 RECONCILING으로 들어가 원래 식별·과거 결과를 보존한다. 확인된 정정 개정의 금액 차이를 확정액·예약액·공통 한도에 원자 반영하고 상태를 재집계한다.
  - name: RenewalFeeAdjustment
    owner: FinancialSettlement
    description: 기존 보상 중첩 요금 조정의 원본 참조와 중복 차감 보호를 보존하는 후속 모델
    attributes:
      - {name: feeAdjustmentId, type: Identifier, required: true, unique: true}
      - {name: renewalCycleRef, type: Ref, required: true, unique: false, references: SoftwareLifecycle.RenewalCycle}
      - {name: periodAdjustmentRef, type: Ref, required: true, unique: false, references: SoftwareLifecycle.PeriodAdjustment}
      - {name: approvedAmountRef, type: Ref, required: false, unique: false, references: CommercialAgreement.AgreementRevision}
      - {name: invoiceRef, type: Ref, required: false, unique: false, references: Invoice}
      - {name: applicationResult, type: Knowledge, required: true, unique: false}
    constraints:
      - 존재만으로 자동 중첩 요금 계산·자동 갱신을 첫 버전에 포함하지 않는다.
      - 독립 금전 보상은 제외하며 기존 취소/반품 환불을 제거하지 않는다.
  - name: FinancialExchange
    owner: FinancialSettlement
    description: 실제 금융 작업 결과의 원래 식별과 반복·역순 수신 대조
    attributes:
      - {name: financialExchangeId, type: Identifier, required: true, unique: true}
      - {name: operationRef, type: Identifier, required: true, unique: false}
      - {name: requestRef, type: RequestIdentity, required: true, unique: false}
      - {name: externalReference, type: OpaqueText, required: false, unique: false}
      - {name: sourceRef, type: Evidence, required: true, unique: false}
      - {name: confirmedResultRef, type: Evidence, required: false, unique: false}
      - {name: correctionOf, type: Ref, required: false, unique: false, references: FinancialExchange}
    constraints:
      - 첫 버전은 직원이 확인한 실제 환불 근거를 기록하며 외부 자동 실행은 후속이다.
      - 동일 원래 작업/실제 거래의 반복 결과는 효과를 추가하지 않으며 더 늦게 도착했다는 이유로 최신 원본을 덮지 않는다.
      - 같은 실제 환불 거래를 다른 작업/RefundCase의 새 성공으로 중복 반영하지 않는다. 실제 거래 식별·원래 작업·부분 및 높은 정정 개정을 함께 대조한다.
  - name: FinancialReconciliationCase
    owner: FinancialSettlement
    description: 미확인·식별 부족·충돌 근거의 대조와 영향 범위
    attributes:
      - {name: financialReconciliationId, type: Identifier, required: true, unique: true}
      - {name: conflictingEvidenceRefs, type: EvidenceList, required: true, unique: false}
      - {name: affectedFactsRefs, type: RefList, required: true, unique: false}
      - {name: dependentActionRefs, type: RefList, required: true, unique: false}
      - {name: staffDecisionRef, type: Evidence, required: false, unique: false}
      - {name: remainingActionRefs, type: RefList, required: true, unique: false}
    constraints:
      - 해결 전 영향받은 추가 이행·배분·환불을 보류하되 무관 주문의 업무를 일괄 중단하지 않는다.
      - 이미 실행된 외부 이행을 원본 정정만으로 취소됐다고 표시하지 않는다.
  - name: FinancialHistory
    owner: FinancialSettlement
    description: 실제 변경의 행위자·시각·사유·전후·근거를 보존하는 불변 이력
    attributes:
      - {name: historyId, type: Identifier, required: true, unique: true}
      - {name: actorAccountId, type: Identifier, required: true, unique: false}
      - {name: verifiedPersonRef, type: Ref, required: true, unique: false, references: IdentityRecovery.Account}
      - {name: occurredAt, type: Instant, required: true, unique: false}
      - {name: reason, type: Text, required: true, unique: false}
      - {name: beforeRef, type: Ref, required: false, unique: false}
      - {name: afterRef, type: Ref, required: true, unique: false}
      - {name: evidenceRefs, type: EvidenceList, required: true, unique: false}
      - {name: requestRef, type: RequestIdentity, required: true, unique: false}
      - {name: correctionOf, type: Ref, required: false, unique: false, references: FinancialHistory}
    constraints:
      - 생성의 beforeRef 없음은 명시하며 원래 이력을 일반 업무 권한으로 수정·삭제하지 않는다.
      - 확인된 사람 식별은 기존 신원 소유자의 검증 결과를 사용하며 Account 참조만으로 동일인을 추정하지 않는다.
relationships:
  - {from: OrderAcceptance.Order, to: Invoice, cardinality: one-to-many, direction: outbound, description: 주문당 복수 청구}
  - {from: PaymentEvidence, to: OrderAcceptance.Order, cardinality: many-to-zero-or-one, direction: outbound, description: 현재 한 주문 연결}
  - {from: PaymentEvidence, to: PaymentAllocation, cardinality: one-to-many, direction: outbound, description: 확인 입금의 청구별 배분}
  - {from: Invoice, to: PaymentAllocation, cardinality: one-to-many, direction: outbound, description: 한 청구에 여러 입금 가능}
  - {from: SoftwareLifecycle.RenewalCycle, to: Invoice, cardinality: one-to-many, direction: outbound, description: 회차별 갱신 주문의 복수 청구}
  - {from: RefundCase, to: FinancialExchange, cardinality: one-to-many, direction: outbound, description: 실제 환불 결과와 부분 재처리}
  - {from: FinancialHistory, to: FinancialHistory, cardinality: many-to-zero-or-one, direction: outbound, description: 정정 전 원래 이력}
```

## 데이터·계약 경계

9개 원본 이름은 기존 C00.Ref 허용 목록과 일치한다. AgreedPaymentPlan·PaymentIdentity·RefundPortion은 인라인 값 객체다. 기존 `FinancialEvidenceInput`은 label·DueBasis·계획 개정·원본 거래 식별 프로필을 전달할 필드가 없고, `EligibilityInput`은 판단 목적을 구별하지 못한다. 기존 닫힌 스키마에 필드를 몰래 추가하지 않는다. [functional-spec.md의 계약 변경 표](functional-spec.md#계약-변경과-기존-동작-호환)에서 기존 버전 유지와 변경 계약을 구분한다.

입금 증빙의 원문·계좌 정보는 권한 있는 직원만 접근한다. 고객용 목록·상세·합계·이력에는 허용된 자기 기업의 대금 정보만 제공한다. 전역 중복 검사에서 다른 기업의 존재·금액·식별 정보를 오류로 노출하지 않는다.

## Sources

- S1: [질문과 확인](functional-design-questions.md) Q1–Q5 및 통합 확인.
- S2: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md), [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md).
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) FR7–FR8·FR12–FR16, NFR4–NFR5.
- S4: [components.md](../../../inception/domain-design/components.md) FinancialSettlement의 원본 소유권.
- S5: [contract-summary.md](../../../inception/contract-design/contract-summary.md) C00·C04·C06·C16·C17·C20·C22.
- S6: [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md), 단일 지급 조건 제외는 이번 Q4 B로 변경.

## Assumptions & Open Questions

- A-U4-01 [assumption]: 실제 수취 원본에서 안정적인 거래 식별 근거를 확보할 수 있다. 아직 확인되지 않았으며, 확보하지 못한 입금은 REVIEW를 벗어나 지급 충족으로 사용할 수 없다. 실제 source profile·계좌/증빙 보관·권한·국내 저장은 출시 준비에서 확인한다.
- 물리 저장·보호 저장 복구·입력 크기·페이지 상한·운영 성능은 후속 NFR/인프라 및 구현 검증 대상이다. 논리 모델이 그 검증을 대신하지 않는다.
