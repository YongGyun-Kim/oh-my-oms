## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-11T03:24:30Z
**Iteration:** 1

### Prior findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md:122 > WF07 단계 1–5, WF06 단계 4, CE-U2-01/05; aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/entities.md:115 > IdentitySession | 비밀번호·코드를 확인할 수 없는 담당자 복구는 직원 권한과 대상 신원 근거를 확인한 뒤 곧바로 ENROLMENT_ONLY로 진행하지만, 확인된 당사자가 제한 권위를 받거나 청구하는 단계가 없다. 미인증 요청자가 타인의 RecoveryCase를 먼저 생성한 경우 그 요청자에게 재등록 세션을 반환해도 되는지 결정할 수 없다. 또한 CE-U2-01은 단일 invitation target을 요구하나 IdentitySession 원본에는 account/binding/purpose만 있고 원래 invitation/case/challenge의 결합 관계가 없다. C01 LimitedIdentityContext의 challengeId·verificationBasisRefs 및 G19/G23의 목적/subject/challenge 검증을 새 흐름에 어떻게 이어 붙이는지 불완전하다. 이는 실제 확인 정책이나 제공자 선정의 미완료와 별개의 기능 설계 공백이다. 재확인: WF07:128은 여전히 확인 후 바로 제한 상태로 진행하며 IdentitySession:120–134에 해당 원본 결합이나 참조하는 별도 제한 허가가 없다. | WF07/08에서 직원·비상 작업자의 확인 권위와 당사자의 재등록 권위를 구별하고, 확인된 당사자만 원래 복구 허가를 청구·소비할 수 있는 인계 순서를 명시한다. 제한 문맥의 원래 case 또는 invitation, challenge/확인 근거, 계정·binding 세대·목적·기한의 논리 결합을 IdentitySession 또는 명시적으로 참조하는 제한 허가 원본에 정의한다. 최초 미인증 요청·식별자만으로 허가를 받지 못하고 다른 case/초대·다른 사람·다른 목적에 재사용하지 못하는 조건과 재시도/회수 동작을 추가한다. 후속 검증에 타인 선행 요청→정상 본인 확인, 다른 요청자의 결과 조회/허가 청구, case·초대 교체 및 동일 허가 중복 소비를 포함한다. 특정 전달 제품·추가 인원 승인·실계정 실행은 요구하지 않는다. | Unresolved |
| R-02 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md:180 > 상태 전이 — EmergencyRecoveryCase/AdministratorRestoration 및 HOLD 재개 문단 | RecoveryCase에는 HOLD에서 재개할 목적 상태가 명시되어 있으나 EmergencyRecoveryCase와 AdministratorRestoration은 HOLD로 들어가는 전이만 있다. 뒤의 일반 문단은 원래 기한/대상을 유지한다고 설명하지만 각 원본에서 근거 보완 후 어느 상태로 재개하고 어떤 종료를 허용하는지 밝히지 않는다. 따라서 비상 복구의 권위 보완이나 관리자 재지정의 위임 근거 보완 후 동작이 상태표에서 닫히지 않는다. 재확인: 상태표:180–183과 일반 문단:186에 두 원본의 HOLD 출구가 여전히 없다. | 두 원본의 HOLD 재개 또는 종료 전이를 상태표에 추가하고 현재 권위·근거·예상 개정·원래 대상/기한·외부 작업 대조 조건을 붙인다. 새 요청을 요구하는 경우에는 기존 보류 원본의 종료/연결 규칙을 명시한다. 근거 미확인→보완→재검증→적용과 기한/권한 변경 후 재개 거절의 후속 검증 관점을 추가한다. | Unresolved |
| R-03 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md:197 > CE-U2-04 기존 계약과 차이 | v1 배열을 손실 없이 변환한다고 하면서 '불명/다중 조합은 거절'한다고만 기술한다. 전달된 U1 functional-spec.md의 행위별 범위 판정 표는 SITE_ALL_DEPARTMENTS의 siteRefs 및 DEPARTMENT_ALL_SITES의 departmentRefs에 1개 이상 ID를 명시적 합집합으로 허용한다. 이 유효한 다중 ID와 의미가 불명한 쌍/곱집합을 구별하지 않으면 새 단일 EXACT 술어로 옮기는 과정에서 기존 유효 grant의 접근이 불필요하게 거절될 수 있다. 재확인: CE-U2-04의 문구가 그대로이며 지정된 공용 contract-summary.md:465–480도 ActionScope의 departmentRefs/siteRefs를 목록으로 유지한다. 이번에는 sibling 문서를 새로 읽지 않고 현재 설계와 공용 계약으로 확인했다. | 알려진 U1 v1 의미에서 다중 사업장/부서 ID를 같은 행위의 개별 완성 술어로 분해하는 변환 규칙을 명시하고, 거절 대상은 의미 미확인·정책/개정 누락·모호한 조합으로 구별한다. 예를 들어 한 SITE_ALL_DEPARTMENTS scope의 서울/부산 ID를 두 개의 EXACT 사업장 scope로 변환한 전후 허용 집합이 동일함을 후속 호환 검증에 포함한다. 현재 접근 권한이나 과거 주문 문맥을 자동 확대하지 않는다. | Unresolved |

### New findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|

새 finding 없음. Code Generation의 별도 두 Major를 기능 설계 finding으로 이전하지 않았다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Stage 정의 확인 | 별도 validation_tools 목록 없음; declared sensors는 required-sections/upstream-coverage/linter/type-check/traceability | 문서의 구조·참조 검사를 읽기 전용으로 수행했다. lifecycle/sensor firing/승인 기록은 실행하지 않았다. |
| YAML 파싱 | entities.md/rules.md의 source-of-truth YAML 모두 PASS | 24개 엔티티·25개 관계·31개 규칙을 파싱했다. |
| 엔티티/규칙 참조 | PASS: 관계 endpoint 오류0, 정의되지 않은 속성 참조0, 규칙 applies_to 미정의0 | 논리 외부 참조 Evidence/RegisteredContact/Operation은 entities.md의 명시 logical_types로 해석했다. |
| traceability JSON/BR target | PASS: 227개 upstream ID/고유227개/coverage227개, 누락0, 잘못된 BR target0, 설명 없는 BR orphan0 | 주 책임26AC와 협력201AC의 연결을 유지한다. OK/Deferred는 설계 연결이며 시험 통과가 아니다. |
| 기존 finding 위치 재확인 | R-01/R-02/R-03 모두 Unresolved | 해당 기능 설계의 문서상 공백이 유지된다. 외부 정책/실계정 미확인이나 별도 코드 상태로 자동 해결 판정하지 않았다. |

### Artifact Evidence

검토한 네 산출물의 SHA-256은 entities.md `7745b0bba5d80581b534def4722576e2758d43b5906e257ad735654507235ff2`, rules.md `0238fd5c2f7900d852b24086a7df22f37c724006b49a13c4ef65474b6f9718e4`, functional-spec.md `5c51080e32b86da176b0a8753af42eef301c1cf5693739ebb195d71498d50181`, traceability.json `b78584ba1c6200fdd28aa13d2130dd77aa26fcc243f8f5bf8df275c1987b5e94`다. 이 파일과 Q&A·상위 계약을 수정하지 않았다.

### Summary

Critical 0, Major 1, Minor 2로 명시된 판정 규칙에 따라 READY다. 기존 세 finding의 해결·위험 수용은 기록하지 않았으며 새 독립 심사에서 더 심각한 결함이나 추가 finding은 확인하지 못했다.

기능 설계는 현재 신원·행위별 범위·초대의 원자 수락·관리자0 허용·외부 효과 미확인/HOLD·복구 완료 조건을 구별하고 전체69US/227AC와 후속 책임을 유지한다. 제한 파일럿 범위는 실제 출시 완료가 아니며 이 판정으로 부하/DR 미실행·실제 제공자/회사망/국내 경로/확인 권위의 HOLD를 PASS로 바꾸지 않는다. 제품 코드·DB·장기 시험·cloud·보안 scanner를 실행하거나 수정하지 않았다.

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > WF07 단계 1–5, WF06 단계 4, CE-U2-01/05; entities.md > IdentitySession | 비밀번호·코드를 확인할 수 없는 담당자 복구는 직원 권한과 대상 신원 근거를 확인한 뒤 곧바로 ENROLMENT_ONLY로 진행하지만, 확인된 당사자가 제한 권위를 받거나 청구하는 단계가 없다. 미인증 요청자가 타인의 RecoveryCase를 먼저 생성한 경우 그 요청자에게 재등록 세션을 반환해도 되는지 결정할 수 없다. 또한 CE-U2-01은 단일 invitation target을 요구하나 IdentitySession 원본에는 account/binding/purpose만 있고 원래 invitation/case/challenge의 결합 관계가 없다. C01 LimitedIdentityContext의 challengeId·verificationBasisRefs 및 G19/G23의 목적/subject/challenge 검증을 새 흐름에 어떻게 이어 붙이는지 불완전하다. 이는 실제 확인 정책이나 제공자 선정의 미완료와 별개의 기능 설계 공백이다. | WF07/08에서 직원·비상 작업자의 확인 권위와 당사자의 재등록 권위를 구별하고, 확인된 당사자만 원래 복구 허가를 청구·소비할 수 있는 인계 순서를 명시한다. 제한 문맥의 원래 case 또는 invitation, challenge/확인 근거, 계정·binding 세대·목적·기한의 논리 결합을 IdentitySession 또는 명시적으로 참조하는 제한 허가 원본에 정의한다. 최초 미인증 요청·식별자만으로 허가를 받지 못하고 다른 case/초대·다른 사람·다른 목적에 재사용하지 못하는 조건과 재시도/회수 동작을 추가한다. 후속 검증에 타인 선행 요청→정상 본인 확인, 다른 요청자의 결과 조회/허가 청구, case·초대 교체 및 동일 허가 중복 소비를 포함한다. 특정 전달 제품·추가 인원 승인·실계정 실행은 요구하지 않는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > 상태 전이 — EmergencyRecoveryCase/AdministratorRestoration 및 HOLD 재개 문단 | RecoveryCase에는 HOLD에서 재개할 목적 상태가 명시되어 있으나 EmergencyRecoveryCase와 AdministratorRestoration은 HOLD로 들어가는 전이만 있다. 뒤의 일반 문단은 원래 기한/대상을 유지한다고 설명하지만 각 원본에서 근거 보완 후 어느 상태로 재개하고 어떤 종료를 허용하는지 밝히지 않는다. 따라서 비상 복구의 권위 보완이나 관리자 재지정의 위임 근거 보완 후 동작이 상태표에서 닫히지 않는다. | 두 원본의 HOLD 재개 또는 종료 전이를 상태표에 추가하고 현재 권위·근거·예상 개정·원래 대상/기한·외부 작업 대조 조건을 붙인다. 새 요청을 요구하는 경우에는 기존 보류 원본의 종료/연결 규칙을 명시한다. 근거 미확인→보완→재검증→적용과 기한/권한 변경 후 재개 거절의 후속 검증 관점을 추가한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > CE-U2-04 기존 계약과 차이 | v1 배열을 손실 없이 변환한다고 하면서 '불명/다중 조합은 거절'한다고만 기술한다. 전달된 U1 functional-spec.md의 행위별 범위 판정 표는 SITE_ALL_DEPARTMENTS의 siteRefs 및 DEPARTMENT_ALL_SITES의 departmentRefs에 1개 이상 ID를 명시적 합집합으로 허용한다. 이 유효한 다중 ID와 의미가 불명한 쌍/곱집합을 구별하지 않으면 새 단일 EXACT 술어로 옮기는 과정에서 기존 유효 grant의 접근이 불필요하게 거절될 수 있다. | 알려진 U1 v1 의미에서 다중 사업장/부서 ID를 같은 행위의 개별 완성 술어로 분해하는 변환 규칙을 명시하고, 거절 대상은 의미 미확인·정책/개정 누락·모호한 조합으로 구별한다. 예를 들어 한 SITE_ALL_DEPARTMENTS scope의 서울/부산 ID를 두 개의 EXACT 사업장 scope로 변환한 전후 허용 집합이 동일함을 후속 호환 검증에 포함한다. 현재 접근 권한이나 과거 주문 문맥을 자동 확대하지 않는다. | New |

> R-01 Not re-checked this round

> R-02 Not re-checked this round

> R-03 Not re-checked this round
