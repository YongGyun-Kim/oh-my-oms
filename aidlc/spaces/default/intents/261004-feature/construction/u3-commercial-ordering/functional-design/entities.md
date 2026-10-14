# U3 상품·계약·주문 엔티티

## 목적과 범위

확인한 [질문 답변](functional-design-questions.md)을 근거로 첫 배포의 논리 데이터 모델을 정의한다. 원래 U3의 소유 엔티티 18개를 보존한다. 아래 타입/관계는 기능 설계이며 실행 코드·저장 구조·실제 연동 검증 결과가 아니다. 갱신/부분 제공 등 후속 구조의 존재는 해당 기능의 첫 배포 제공을 뜻하지 않는다.

## 논리 타입과 값 객체

| 타입 | 의미와 제약 |
| --- | --- |
| Identifier / PositiveInteger | 소유자 범위의 고유 식별자 / 정확한 양의 정수. 임의 수량 최대값은 두지 않으며 입력행 한도100과 구분한다. |
| VersionedReference | C00.Ref의 닫힌 owner/entity 목록에 있는 원본만 가리키는 owner·entity·id·revision 참조. 아래 논리 값 객체 이름은 이 enum에 넣지 않는다. 현재성·기업·목적·권한은 별도 검증한다. |
| VersionedReferenceList | 해당 원본 참조 목록. required는 명시 값 보존이며 목록의 비어 있음 허용 여부는 필드별 규칙을 따른다. 계약 개정이 없다는 확인은 빈 목록으로 보존하고 조회 실패와 구분한다. |
| Instant / EffectiveWindow | 명시한 시점 / 시작·종료 시점과 포함 여부를 합의 근거에 고정한 유효 구간. 종료 없음도 명시한다. 날짜·경계 규칙이 불명확하면 적용을 보류하며 임의 월말·자정·포함 규칙을 만들지 않는다. |
| PriceTerms | 통화 KRW, 비음수 원 단위 정수 단가, 단가의 세금/비용 포함 여부와 근거. 확인되지 않은 포함 여부와0원 확정은 다르다. |
| OrderPriceBreakdown | 행별 단가·수량·금액, 상품금액 합계, 확인한 추가 비용/세금/할인 항목별 비음수 원 단위 정수 금액·포함 위치·근거·확인자, 최종 합계. 할인은 별도 차감으로 표현한다. 최종 합계도 공통 Money 계약에 따라 비음수이며 음수 결과는 확정하지 않는다. 포함된 항목은 가산액0으로 중복 합산하지 않고 포함 근거를 보존한다. |
| CommercialTerms / PaymentTerms | 기업·상품·조건 항목별 승인 가격/지급 조건과 명시된 적용 구간. 첫 배포 주문의 지급 종류는 PREPAY 또는 POSTPAY 하나이며 조건 상세를 임의 기본값으로 채우지 않는다. |
| AgreedPeriod / PurchasedTerms | 구매 당시의 상품별 이용 기간·지급·완료 기준·합의 조건. 실제 SW 기간은 다른 소유자의 참조이며 값을 덮어쓰지 않는다. |
| VisibilityTerms / SalesDescription / SalesCondition | 공개 기업·상품 대상과 판매 설명·타입/이용형·주문 판단에 필요한 확인된 조건. 미완성 정보는 유효 제시를 막는다. |
| Evidence / Reason / OwnerEvidence | 출처·대상·개정·판단 목적·확인 시점·확인 주체를 포함한 소유자 근거 / 사유. 미등록 출처·조회 실패·충돌·미확인은 확정 근거가 아니다. |
| RequestIdentity / BusinessResult | 호출자·기업·행위 범위와 제출 내용에 결합한 요청 식별 / 접수·검토·적용 결과. 같은 식별자 다른 내용은 충돌이며 접수만으로 업무 완료가 아니다. |

| TargetScope | C00.TargetScope의 필수 enterpriseRef·departmentRef·siteRef·contextPolicyRef·organisationRevision. 부서/사업장의 null은 승인 정책상 하위 보호 단위가 없음만 의미한다. |
| ConditionBindingList | 입력행별 conditionKey와 적용 소유자/원본 개정·고정 값·유효 구간·근거의 목록. 한 행의 서로 다른 항목/상품의 기업 합의를 모두 보존하며 기업 개정 합집합과 일치해야 한다. |
| SourceBoundValue / SourceBoundValueList | 아래 표의 인라인 값 또는 허용 원본 개정의 고정된 하위 값. 속성의 references는 논리 내용 타입이며 C00.Ref.entity가 아니다. 하위 필드 선택자는 전송 Ref에 추가하지 않고 명령의 기존 필드 의미로 해석한다. |
| ProvisionTerms | 기업 계약의 일괄/부분 제공 합의·지급/납기/완료 기준과 근거. 소유자는 CommercialAgreement이며 첫 배포는 FULL만 실행한다. |
| RenewalTerms | 기업 계약의 갱신 허용 범위·가격/지급/유예 조건과 명시 근거. 자동 갱신 실행과 구분한다. |
| RequestedCondition | 고객 변경 요청의 대상 계약·희망 조건 텍스트/범위·근거. 요청 내용이며 승인 조건이 아니다. |
| ProposedCommercialTerms | 제안의 정확한 새 가격/비용/할인·지급/기간 조건·대상·개정·근거. 원래 조건과 분리한다. |
| CompletionBasis | 상품/계약에 명시한 배송·인수 또는 SW 제공 완료 판단 기준과 근거. 실제 완료 증명은 각 이행 소유자 책임이다. |
| AppliedTerms | 적용한 제안 개정/고정 조건과 원래 조건·동의·필요 승인 근거. 소유자는 OrderAcceptance이며 최초 스냅샷과 분리한다. |
| OriginalReference | 이력에서 원본/전후/정정 대상에 쓰는 C00.Ref 허용 원본의 합집합. 임의 새로운 entity 종류가 아니다. |

값 객체 이름은 모델을 설명하는 논리 타입이다. 새 공통 API·독립 원본 서비스로 확정하지 않는다. 외부 소유자의 근거 이름 역시 이 문서의 조회 의도를 표현하며 실제 전송 스키마는 해당 소유자의 계약을 따른다.

## 값 객체와 공통 계약 매핑

| 논리 내용 | 원본 보존 위치와 전송 표현 |
| --- | --- |
| SalesDescription | Product의 판매 설명/label 인라인. C03 입력/조회 필드의 문자열이며 별도 Ref.entity가 아님 |
| VisibilityTerms | CommonOfferRevision/EnterpriseOfferException의 대상·visible 고정 값. C03 조회 visible/C04 예외 visibility와 기존 승인 원본 참조를 사용 |
| PriceTerms / SalesCondition / PaymentTerms / CompletionBasis | CommonOfferRevision 또는 AgreementRevision의 해당 조건 값. 금액 조회/구매 단가는 C00.Money 인라인, salesConditionRefs/paymentTermsRef/completionBasisRef는 허용되는 그 조건의 원본 개정 참조로 전달하고 수신 필드가 필요한 하위 조건을 선택 |
| CommercialTerms / ProvisionTerms / RenewalTerms | AgreementRevision에 고정한 조건 내용. C04의 각 termsRef는 CommercialAgreement.AgreementRevision(등록/승인 대상별 정확한 개정) 또는 해당 초안 내용을 보존한 AgreementHistory를 참조하며 각 입력 필드 의미가 조건 묶음을 구별. 수신자는 실제 저장된 내용·대상·근거를 역참조해야 함 |
| RequestedCondition | ContractChangeRequest에 인라인 보존. C04.ContractChangeInput.requestedTerms 문자열과 agreementEvidenceRefs로 전달; 요청 텍스트를 임의 Ref로 만들지 않음 |
| ProposedCommercialTerms / AppliedTerms | CommercialProposal의 제안 개정에 새 조건을, OrderChangeApplication의 적용 기록에 확정 조건을 인라인 보존. C04.proposedTermsRef/C05.newTermsRef는 새 조건을 고정한 CommercialProposal 또는 AgreementRevision/AgreementHistory의 허용 원본 개정 참조. 미저장 초안 식별이나 자기 참조만으로 조건을 확인했다고 가정하지 않음 |
| AgreedPeriod / PurchasedTerms / OrderPriceBreakdown | PurchaseTermsSnapshot과 입력행에 인라인 보존. C00.Period/Money 및 OrderView.purchaseTermsSnapshotRef와 공통/기업 개정 참조로 제공. 실제 SW 기간과 별도 |
| Evidence / Reason / OwnerEvidence | C00.Evidence 또는 C00.Ref의 실제 원본과 사유 텍스트. U3 증거·판단 사유는 CatalogHistory/AgreementHistory/OrderHistory 또는 해당 승인/결정 원본에 보존. source·confirmation·관찰 시점·대상/목적을 대조하고 원본 존재만으로 CONFIRMED를 선언하지 않음 |
| 외부 공급/대금 근거 | HW는 HardwareFulfillment.HardwareSupplyAssessment, SW는 SoftwareLifecycle.SoftwareSupplyAssessment, 대금은 FinancialSettlement.FinancialEligibility 등 실제 C00.Ref 허용 원본을 참조. 가상의 SupplyEvidence/IssuanceEvidence/ConditionEvidence 이름을 entity로 전송하지 않음 |
| RequestIdentity / BusinessResult | C00.CommandMeta.clientRequestId와 C00.Receipt 및 각 명령 결과의 접수/업무 결과 의미에 매핑. 요청/결과 연결은 해당 원본 이력에 인라인 보존하며 RequestIdentity/BusinessResult를 새 Ref.entity로 전송하지 않음 |
| OriginalReference | CatalogHistory/AgreementHistory/OrderHistory의 원본 허용 Ref. actorAccountId는 계정 식별과 확인한 Account 참조를 보존하고 외부 전송은 C00.Ref의 Account 형식 사용 |

같은 허용 원본을 여러 termsRef 필드에서 사용해도 대상 개정의 각 조건 묶음을 구별한다. 해당 원본에 실제 조건 내용이 없거나 필드/대상/개정 의미가 불일치하면 미확인으로 보류한다. 별도 값 객체 저장 서비스나 닫힌 Ref enum의 임의 확장은 요구하지 않는다.

## Entity Model

다음 YAML이 엔티티 속성의 단일 원본이다. required:false는 미확인 상태를 표현할 수 있다는 뜻이며 승인/수락의 확인 요건을 면제하지 않는다. identifier 속성의 unique는 해당 소유 엔티티 내 식별자 고유성이다.

```yaml
unit: u3-commercial-ordering
entities:
  - name: Product
    owner: ProductCatalog
    description: "내부 직원이 등록하는 HW 또는 SW 판매 상품"
    attributes:
      - {"name":"productId","type":"Identifier","required":true,"unique":true}
      - {"name":"productType","type":"Enum","required":true,"unique":false,"allowed_values":["HW","SW"]}
      - {"name":"softwareTermKind","type":"Enum","required":false,"unique":false,"allowed_values":["PERPETUAL","TERM"]}
      - {"name":"salesDescriptionRef","type":"SourceBoundValue","required":true,"unique":false,"references":"SalesDescription","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"currentCommonOfferRef","type":"VersionedReference","required":false,"unique":false,"references":"CommonOfferRevision"}
      - {"name":"saleState","type":"Enum","required":true,"unique":false,"allowed_values":["INCOMPLETE","OFFERABLE","SUSPENDED"]}
    constraints: ["HW는 softwareTermKind를 갖지 않고 SW는 이용형을 명시한다.","OFFERABLE은 필수 정보와 유효 판매 조건이 확인된 경우에만 가능하다."]
  - name: CommonOfferRevision
    owner: ProductCatalog
    description: "공통 공개·가격·판매 조건의 불변 개정"
    attributes:
      - {"name":"commonOfferRevisionId","type":"Identifier","required":true,"unique":true}
      - {"name":"productRef","type":"VersionedReference","required":true,"unique":false,"references":"Product"}
      - {"name":"publicVisibilityRuleRef","type":"SourceBoundValue","required":true,"unique":false,"references":"VisibilityTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"priceTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PriceTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"salesConditionRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"SalesCondition","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"revisionEvidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"revision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"effectiveWindow","type":"EffectiveWindow","required":true,"unique":false}
    constraints: ["가격 변경은 새로운 개정이다. 기존 주문에서 참조한 개정은 덮어쓰지 않는다."]
  - name: EnterpriseContract
    owner: CommercialAgreement
    description: "한 기업의 합의와 현재 승인 개정 연결"
    attributes:
      - {"name":"contractId","type":"Identifier","required":true,"unique":true}
      - {"name":"enterpriseRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseAccess.Enterprise"}
      - {"name":"currentApprovedRevisionRef","type":"VersionedReference","required":false,"unique":false,"references":"AgreementRevision"}
      - {"name":"contractEvidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
    constraints: ["등록만으로 currentApprovedRevisionRef가 생기지 않는다."]
  - name: AgreementRevision
    owner: CommercialAgreement
    description: "대상·시점·내용·근거와 등록자를 고정한 계약 개정"
    attributes:
      - {"name":"agreementRevisionId","type":"Identifier","required":true,"unique":true}
      - {"name":"contractRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseContract"}
      - {"name":"productScopeRefs","type":"VersionedReferenceList","required":true,"unique":false,"references":"Product"}
      - {"name":"commercialTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"CommercialTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"provisionTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"ProvisionTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"renewalTermsRef","type":"SourceBoundValue","required":false,"unique":false,"references":"RenewalTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"registeredBy","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"registeredPersonRef","type":"VersionedReference","required":false,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"approvalRef","type":"VersionedReference","required":false,"unique":false,"references":"AgreementApproval"}
      - {"name":"agreementEvidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"effectiveWindow","type":"EffectiveWindow","required":true,"unique":false}
      - {"name":"state","type":"Enum","required":true,"unique":false,"allowed_values":["REGISTERED","CONFIRMATION_REQUIRED","APPROVED","REJECTED","SUPERSEDED"]}
    constraints: ["승인 대상 개정·근거·대상·유효 구간은 불변이며 수정은 새 개정으로 등록한다.","등록자 동일인 근거가 미확인이면 승인을 막는다.","갱신·유예 등 등록 내용이 있어도 후속 자동 실행을 활성화하지 않는다."]
  - name: ContractChangeRequest
    owner: CommercialAgreement
    description: "고객의 변경 요청과 내부 확인 결과"
    attributes:
      - {"name":"contractChangeRequestId","type":"Identifier","required":true,"unique":true}
      - {"name":"enterpriseRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseAccess.Enterprise"}
      - {"name":"requestedConditionRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"RequestedCondition","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"requesterRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"registeredRevisionRef","type":"VersionedReference","required":false,"unique":false,"references":"AgreementRevision"}
      - {"name":"resultRef","type":"SourceBoundValue","required":false,"unique":false,"references":"BusinessResult","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"state","type":"Enum","required":true,"unique":false,"allowed_values":["RECEIVED","UNDER_REVIEW","RESULT_RECORDED"]}
    constraints: ["요청은 유효 조건을 바꾸지 않는다.","실제 대상 계약과 요청 본문은 requestedConditionRefs에 고정한다."]
  - name: AgreementApproval
    owner: CommercialAgreement
    description: "다른 사람의 정확한 계약 개정 승인·거절 근거"
    attributes:
      - {"name":"approvalId","type":"Identifier","required":true,"unique":true}
      - {"name":"revisionRef","type":"VersionedReference","required":true,"unique":false,"references":"AgreementRevision"}
      - {"name":"registrantPersonRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"approverAccountRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"approverPersonRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"decision","type":"Enum","required":true,"unique":false,"allowed_values":["APPROVE","REJECT"]}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
    constraints: ["APPROVE는 현재 권한·서로 다른 사람·일치하는 개정·유효한 근거·충돌 없음이 확인되어야 한다.","거절 기록은 조건 적용을 허용하지 않는다."]
  - name: EnterpriseOfferException
    owner: CommercialAgreement
    description: "승인 계약에 근거한 기업별 공개·가격 예외"
    attributes:
      - {"name":"offerExceptionId","type":"Identifier","required":true,"unique":true}
      - {"name":"enterpriseRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseAccess.Enterprise"}
      - {"name":"productRef","type":"VersionedReference","required":true,"unique":false,"references":"Product"}
      - {"name":"agreementRevisionRef","type":"VersionedReference","required":true,"unique":false,"references":"AgreementRevision"}
      - {"name":"visibilityTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"VisibilityTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"priceTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PriceTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"effectiveWindow","type":"EffectiveWindow","required":true,"unique":false}
    constraints: ["예외 경로로 계약 승인·동일인 검증을 우회하지 않는다."]
  - name: CommercialProposal
    owner: CommercialAgreement
    description: "주문 또는 SW 갱신의 원래/변경 조건과 대상 버전"
    attributes:
      - {"name":"proposalId","type":"Identifier","required":true,"unique":true}
      - {"name":"targetOrderRef","type":"VersionedReference","required":false,"unique":false,"references":"Order"}
      - {"name":"targetEntitlementRef","type":"VersionedReference","required":false,"unique":false,"references":"SoftwareLifecycle.EnterpriseEntitlement"}
      - {"name":"targetRenewalCycleRef","type":"VersionedReference","required":false,"unique":false,"references":"SoftwareLifecycle.RenewalCycle"}
      - {"name":"originalTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PurchaseTermsSnapshot|RenewalTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"proposedTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"ProposedCommercialTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"proposalRevision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"result","type":"Enum","required":true,"unique":false,"allowed_values":["OPEN","CONSENTED","DECLINED","CONFIRMATION_REQUIRED","SUPERSEDED","APPLIED"]}
    constraints: ["주문 제안은 targetOrderRef만, 갱신 제안은 일치하는 권한·회차 참조를 함께 갖는다.","제안 수정은 새 개정이며 이전 동의를 새 개정에 재사용하지 않는다."]
  - name: CustomerConsent
    owner: CommercialAgreement
    description: "현재 권한 있는 고객의 특정 제안 개정 응답"
    attributes:
      - {"name":"consentId","type":"Identifier","required":true,"unique":true}
      - {"name":"proposalRef","type":"VersionedReference","required":true,"unique":false,"references":"CommercialProposal"}
      - {"name":"proposalRevision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"actorAccountRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"enterpriseRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseAccess.Enterprise"}
      - {"name":"decision","type":"Enum","required":true,"unique":false,"allowed_values":["AGREE","DECLINE"]}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
    constraints: ["전송·알림 열람 또는 직원 입력은 동의가 아니다.","AGREE도 실제 적용·대금·기간 변경 완료가 아니다."]
  - name: Order
    owner: OrderAcceptance
    description: "성공 접수한 전체 주문과 현재 판단"
    attributes:
      - {"name":"orderId","type":"Identifier","required":true,"unique":true}
      - {"name":"enterpriseRef","type":"VersionedReference","required":true,"unique":false,"references":"EnterpriseAccess.Enterprise"}
      - {"name":"requesterAccountRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"submissionRequestRef","type":"SourceBoundValue","required":true,"unique":false,"references":"RequestIdentity","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"submittedAt","type":"Instant","required":true,"unique":false}
      - {"name":"productType","type":"Enum","required":true,"unique":false,"allowed_values":["HW","SW"]}
      - {"name":"purchaseTermsRef","type":"VersionedReference","required":true,"unique":false,"references":"PurchaseTermsSnapshot"}
      - {"name":"provisionChoiceRef","type":"VersionedReference","required":true,"unique":false,"references":"ProvisionChoice"}
      - {"name":"acceptanceRef","type":"VersionedReference","required":false,"unique":false,"references":"AcceptanceDecision"}
      - {"name":"changeApplicationRefs","type":"VersionedReferenceList","required":false,"unique":false,"references":"OrderChangeApplication"}
      - {"name":"revision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"state","type":"Enum","required":true,"unique":false,"allowed_values":["REVIEW","ACCEPTED","REJECTED"]}
      - {"name":"paymentKind","type":"Enum","required":true,"unique":false,"allowed_values":["PREPAY","POSTPAY"]}
      - {"name":"targetScope","type":"TargetScope","required":true,"unique":false,"constraints":["enterpriseRef, departmentRef, siteRef, contextPolicyRef, organisationRevision을 C00.TargetScope와 같은 의미로 보존한다.","departmentRef/siteRef null은 승인 조직 정책에 하위 보호 단위가 없음이 명시된 경우만 허용하며 누락/미확인이 아니다."]}
    constraints: ["주문·전체 입력행·불변 스냅샷·접수 결과는 함께 보존한다.","입력 오류·권한 거절은 성공 접수 주문으로 생성하지 않는다.","REVIEW의 미확인/업무 검토/조회 실패 사유는 별도 보존한다.","현재 요청자의 소속으로 과거 주문 문맥을 재구성하지 않고 조회/판단/변경/대금/이행/통지에 같은 targetScope를 전달한다."]
  - name: OrderLine
    owner: OrderAcceptance
    description: "한 상품·수량과 구매 당시 조건"
    attributes:
      - {"name":"orderLineId","type":"Identifier","required":true,"unique":true}
      - {"name":"orderRef","type":"VersionedReference","required":true,"unique":false,"references":"Order"}
      - {"name":"productRef","type":"VersionedReference","required":true,"unique":false,"references":"Product"}
      - {"name":"quantity","type":"PositiveInteger","required":true,"unique":false,"min":1}
      - {"name":"purchasePriceTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PriceTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"paymentTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PaymentTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"agreedPeriodRef","type":"SourceBoundValue","required":false,"unique":false,"references":"AgreedPeriod","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"agreedCompletionBasisRef","type":"SourceBoundValue","required":true,"unique":false,"references":"CompletionBasis","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"position","type":"PositiveInteger","required":true,"unique":false,"min":1,"max":100}
      - {"name":"commonOfferRevisionRef","type":"VersionedReference","required":true,"unique":false,"references":"CommonOfferRevision"}
      - {"name":"agreementRevisionRefs","type":"VersionedReferenceList","required":true,"unique":false,"references":"AgreementRevision","constraints":["해당 행/조건 항목에 실제 적용한 모든 승인 개정; 없는 경우도 명시적으로 빈 목록"]}
      - {"name":"conditionBindings","type":"ConditionBindingList","required":true,"unique":false}
    constraints: ["한 주문에 1–100입력행이며 상품 타입과 지급 종류는 주문과 일치한다.","SW 영구/기간제는 같은 SW 주문에 담을 수 있다.","상품 참조와 구매 당시 개정 참조를 함께 보존한다."]
  - name: PurchaseTermsSnapshot
    owner: OrderAcceptance
    description: "제출 당시 조건의 불변 원본"
    attributes:
      - {"name":"purchaseTermsId","type":"Identifier","required":true,"unique":true}
      - {"name":"orderRef","type":"VersionedReference","required":true,"unique":false,"references":"Order"}
      - {"name":"catalogRevisionRefs","type":"VersionedReferenceList","required":true,"unique":false,"references":"CommonOfferRevision"}
      - {"name":"pricesRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OrderPriceBreakdown","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"termsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PurchasedTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"agreementRevisionRefs","type":"VersionedReferenceList","required":true,"unique":false,"references":"AgreementRevision","constraints":["모든 입력행 conditionBindings에 사용된 기업 개정 참조의 중복 없는 합집합"]}
      - {"name":"conditionBindings","type":"ConditionBindingList","required":true,"unique":false}
    constraints: ["주문당 최초 스냅샷은 정확히 하나이며 이후 상품/계약 변경으로 바뀌지 않는다.","변경 적용은 원본 대신 새 조건 참조와 별도 적용 기록을 만든다."]
  - name: ProvisionChoice
    owner: OrderAcceptance
    description: "고객의 제공 선택과 그 근거"
    attributes:
      - {"name":"provisionChoiceId","type":"Identifier","required":true,"unique":true}
      - {"name":"orderRef","type":"VersionedReference","required":true,"unique":false,"references":"Order"}
      - {"name":"customerChoice","type":"Enum","required":true,"unique":false,"allowed_values":["FULL","PARTIAL"],"default":"FULL"}
      - {"name":"consentRef","type":"VersionedReference","required":false,"unique":false,"references":"CustomerConsent"}
      - {"name":"effectiveRevisionRef","type":"VersionedReference","required":true,"unique":false,"references":"PurchaseTermsSnapshot"}
    constraints: ["첫 배포는 FULL만 실행한다. PARTIAL 입력을 FULL로 자동 치환하지 않고 지원 밖/확인 필요로 구분한다.","PARTIAL 구조는 후속 명시적 동의를 보존하기 위한 원래 책임 모델이다."]
  - name: AcceptanceDecision
    owner: OrderAcceptance
    description: "전체 주문의 한 판단 개정"
    attributes:
      - {"name":"acceptanceDecisionId","type":"Identifier","required":true,"unique":true}
      - {"name":"orderRef","type":"VersionedReference","required":true,"unique":false,"references":"Order"}
      - {"name":"assessmentRevision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"supplyEvidenceRefs","type":"VersionedReferenceList","required":false,"unique":false,"references":"HardwareFulfillment.HardwareSupplyAssessment|SoftwareLifecycle.SoftwareSupplyAssessment"}
      - {"name":"leadTimeEvidenceRefs","type":"SourceBoundValueList","required":false,"unique":false,"references":"OwnerEvidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"contractEvidenceRef","type":"VersionedReference","required":false,"unique":false,"references":"AgreementRevision|CommonOfferRevision"}
      - {"name":"actorRef","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"decision","type":"Enum","required":true,"unique":false,"allowed_values":["ACCEPT","REJECT","HOLD"]}
      - {"name":"reasonRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"Reason","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"observedOrderRevision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"assessedTermsRefs","type":"SourceBoundValueList","required":true,"unique":false,"references":"PurchasedTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"financialEvidenceRefs","type":"VersionedReferenceList","required":false,"unique":false,"references":"FinancialSettlement.FinancialEligibility"}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
    constraints: ["ACCEPT는전체 입력행의 계약·공급·납기·대금 조건이 확인되고 판단 전제 개정이 현재와 일치해야 한다.","HOLD는 주문 REVIEW를 유지하며 기술 실패와 업무 사유를 구분한다.","판단은 실제 확보·출고·발급·지급의 완료가 아니다."]
  - name: OrderChangeApplication
    owner: OrderAcceptance
    description: "동의·허용 근거에 따른 조건 변경 적용 결과"
    attributes:
      - {"name":"orderChangeApplicationId","type":"Identifier","required":true,"unique":true}
      - {"name":"orderRef","type":"VersionedReference","required":true,"unique":false,"references":"Order"}
      - {"name":"afterSalesDecisionRef","type":"VersionedReference","required":false,"unique":false,"references":"AfterSalesDecision.AfterSalesDecisionRecord","constraints":["REVIEW_PRICE_CHANGE 경로는 미사용; ACCEPTED_AFTERSALES_CHANGE 경로는 필수이며 확인된 U7 결정 원본이어야 한다."]}
      - {"name":"consentRef","type":"VersionedReference","required":true,"unique":false,"references":"CustomerConsent"}
      - {"name":"previousTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"PurchaseTermsSnapshot|AppliedTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"changedTermsRef","type":"SourceBoundValue","required":true,"unique":false,"references":"AppliedTerms","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"actualApplicationResult","type":"Enum","required":true,"unique":false,"allowed_values":["APPLIED","CONFLICT","CONFIRMATION_REQUIRED"]}
      - {"name":"expectedOrderRevision","type":"PositiveInteger","required":true,"unique":false}
      - {"name":"proposalRef","type":"VersionedReference","required":true,"unique":false,"references":"CommercialProposal"}
      - {"name":"changeKind","type":"Enum","required":true,"unique":false,"allowed_values":["REVIEW_PRICE_CHANGE","ACCEPTED_AFTERSALES_CHANGE"]}
    constraints: ["동의·정확한 제안 개정·현재 주문 전제와 필요한 허용/승인이 일치할 때 한 번만 적용한다.","최초 구매 스냅샷은 변경하지 않는다.","적용 기록과 현재 조건 포인터·이력·결과는 함께 보존한다."]
  - name: CatalogHistory
    owner: ProductCatalog
    description: "원본 소유자의 추가 전용 변경·판단 이력"
    attributes:
      - {"name":"historyId","type":"Identifier","required":true,"unique":true}
      - {"name":"actorAccountId","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"verifiedPersonRef","type":"VersionedReference","required":false,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
      - {"name":"reason","type":"Text","required":true,"unique":false}
      - {"name":"beforeRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"afterRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":false,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"requestRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"resultRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"correctionOf","type":"SourceBoundValue","required":false,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"sourceRevision","type":"PositiveInteger","required":true,"unique":false}
    constraints: ["원본과 이력을 같은 성공 접수/변경 결과로 연결한다. 정정은 correctionOf로 원본을 가리키며 원본 삭제/덮어쓰기를 하지 않는다.","민감 근거·계약·가격의 조회 권한은 목록/요약/이력에도 적용한다."]
  - name: AgreementHistory
    owner: CommercialAgreement
    description: "원본 소유자의 추가 전용 변경·판단 이력"
    attributes:
      - {"name":"historyId","type":"Identifier","required":true,"unique":true}
      - {"name":"actorAccountId","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"verifiedPersonRef","type":"VersionedReference","required":false,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
      - {"name":"reason","type":"Text","required":true,"unique":false}
      - {"name":"beforeRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"afterRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":false,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"requestRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"resultRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"correctionOf","type":"SourceBoundValue","required":false,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"sourceRevision","type":"PositiveInteger","required":true,"unique":false}
    constraints: ["원본과 이력을 같은 성공 접수/변경 결과로 연결한다. 정정은 correctionOf로 원본을 가리키며 원본 삭제/덮어쓰기를 하지 않는다.","민감 근거·계약·가격의 조회 권한은 목록/요약/이력에도 적용한다."]
  - name: OrderHistory
    owner: OrderAcceptance
    description: "원본 소유자의 추가 전용 변경·판단 이력"
    attributes:
      - {"name":"historyId","type":"Identifier","required":true,"unique":true}
      - {"name":"actorAccountId","type":"VersionedReference","required":true,"unique":false,"references":"IdentityRecovery.Account"}
      - {"name":"verifiedPersonRef","type":"VersionedReference","required":false,"unique":false,"references":"IdentityRecovery.VerifiedPersonLink"}
      - {"name":"occurredAt","type":"Instant","required":true,"unique":false}
      - {"name":"reason","type":"Text","required":true,"unique":false}
      - {"name":"beforeRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"afterRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"evidenceRefs","type":"SourceBoundValueList","required":false,"unique":false,"references":"Evidence","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"requestRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"resultRef","type":"SourceBoundValue","required":true,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"correctionOf","type":"SourceBoundValue","required":false,"unique":false,"references":"OriginalReference","transport":"아래 값 객체 매핑 표에 따른 인라인 값 또는 허용 원본 개정 참조; 이 논리 타입 이름을 C00.Ref.entity로 보내지 않음"}
      - {"name":"sourceRevision","type":"PositiveInteger","required":true,"unique":false}
    constraints: ["원본과 이력을 같은 성공 접수/변경 결과로 연결한다. 정정은 correctionOf로 원본을 가리키며 원본 삭제/덮어쓰기를 하지 않는다.","민감 근거·계약·가격의 조회 권한은 목록/요약/이력에도 적용한다."]
relationships:
  - {from: Product, to: CommonOfferRevision, cardinality: "1 -> 0..many", direction: "product owns revisions"}
  - {from: EnterpriseContract, to: AgreementRevision, cardinality: "1 -> 0..many", direction: "contract owns revisions"}
  - {from: AgreementRevision, to: AgreementApproval, cardinality: "1 -> 0..many", direction: "revision receives immutable decisions"}
  - {from: EnterpriseOfferException, to: AgreementRevision, cardinality: "many -> 1", direction: "exception requires approved revision"}
  - {from: EnterpriseOfferException, to: Product, cardinality: "many -> 1", direction: "exception targets product"}
  - {from: Order, to: OrderLine, cardinality: "1 -> 1..100", direction: "order owns input rows"}
  - {from: Order, to: PurchaseTermsSnapshot, cardinality: "1 -> 1", direction: "order preserves original snapshot"}
  - {from: PurchaseTermsSnapshot, to: CommonOfferRevision, cardinality: "many -> 1..many", direction: "snapshot pins catalog revisions"}
  - {from: PurchaseTermsSnapshot, to: AgreementRevision, cardinality: "many -> 0..many", direction: "snapshot pins every applied corporate revision through line and condition bindings"}
  - {from: Order, to: ProvisionChoice, cardinality: "1 -> 1", direction: "order owns effective choice"}
  - {from: Order, to: AcceptanceDecision, cardinality: "1 -> 0..many", direction: "order preserves assessments"}
  - {from: CommercialProposal, to: Order, cardinality: "many -> 0..1", direction: "proposal targets exact order revision"}
  - {from: CommercialProposal, to: SoftwareLifecycle.RenewalCycle, cardinality: "many -> 0..1", direction: "renewal proposal pins cycle and entitlement"}
  - {from: CommercialProposal, to: CustomerConsent, cardinality: "1 -> 0..many", direction: "proposal preserves customer responses"}
  - {from: Order, to: OrderChangeApplication, cardinality: "1 -> 0..many", direction: "order preserves changes"}
  - {from: OrderChangeApplication, to: CustomerConsent, cardinality: "0..1 -> 1", direction: "one applicable consent authorizes at most one order change"}
```

## 엔티티와 소유 경계 요약

ProductCatalog는 상품·공통 조건, CommercialAgreement는 기업 조건·예외·제안/동의, OrderAcceptance는 주문·스냅샷·판단·적용을 소유한다. Enterprise·Account·VerifiedPersonLink는 U2, 실제 대금 조건은 U4, HW 공급은 U5, SW 권한·실제 기간/갱신 회차는 U6의 참조를 검증한다. 조회 실패 시 로컬 사본을 원본 근거로 승격하지 않는다.

## Sources

- [확인한 Q&A](functional-design-questions.md): Q1–Q4와 Looks correct.
- [컴포넌트](../../../inception/domain-design/components.md): U3의 단일 소유 18엔티티.
- [공통 계약](../../../inception/contract-design/contract-summary.md): C03/C04/C05, TypedRef·Receipt·정확한 금액.
- [첫 배포 계획](../../../release-planning/first-release-delivery-plan.md): 단일 지급 조건·전체 직원 판단과 후속 범위.
